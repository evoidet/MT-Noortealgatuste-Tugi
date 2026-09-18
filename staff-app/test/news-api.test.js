import assert from "node:assert/strict";
import test from "node:test";
import { api, ApiError } from "../public/api.js";

test("a transient image completion failure retries the existing uploaded image", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const requests = [];
  let completionAttempts = 0;
  globalThis.fetch = async (url) => {
    requests.push(url);
    if (url.endsWith("/upload-intent")) return Response.json({ upload: {
      attachmentId: "image", method: "PUT", uploadUrl: "https://upload.example.test/image"
    } });
    if (url.startsWith("https://upload.")) return new Response(null, { status: 200 });
    if (url.endsWith("/complete")) {
      completionAttempts++;
      return completionAttempts === 1
        ? Response.json({ error: "REQUEST_FAILED" }, { status: 503 })
        : Response.json({ attachment: { id: "image", storageStatus: "ready" } });
    }
    assert.fail(`Unexpected request: ${url}`);
  };
  const file = new File(["synthetic"], "photo.png", { type: "image/png" });
  await assert.rejects(api.uploadAttachment("news", file, "primary"), { status: 503 });
  const retried = await api.uploadAttachment("news", file, "primary");
  assert.equal(retried.attachment.id, "image");
  assert.equal(requests.filter((url) => url.endsWith("/upload-intent")).length, 1);
  assert.equal(requests.filter((url) => url.startsWith("https://upload.")).length, 1);
  assert.equal(completionAttempts, 2);
});

test("invalid API bodies cannot count as success and preserve safe HTTP diagnostics", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const [body, contentType, status] of [
    ["<html>PRIVATE diagnostic</html>", "text/html", 200],
    ["{invalid PRIVATE", "application/json", 200],
    ["null", "application/json", 200],
    ["", "application/json", 200],
    ["<html>PRIVATE upstream error</html>", "text/html", 502],
    ["{invalid PRIVATE", "application/json", 503]
  ]) {
    globalThis.fetch = async () => new Response(body, { status, headers: { "Content-Type": contentType } });
    await assert.rejects(api.createSubmission("news", { title: "Test", content: ["Body"] }), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, status);
      assert.equal(error.payload.error, "INVALID_API_RESPONSE");
      assert.doesNotMatch(JSON.stringify(error), /PRIVATE/);
      return true;
    });
  }
  globalThis.fetch = async () => Response.json({ error: "VALIDATION_ERROR", fields: [{ field: "title" }] }, { status: 422 });
  await assert.rejects(api.createSubmission("news", {}), (error) => {
    assert.equal(error.status, 422);
    assert.equal(error.payload.fields[0].field, "title");
    return true;
  });
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await api.logout(), null);
});

test("news draft creation sends a caller-owned idempotency key", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.get("Idempotency-Key"), "11111111-1111-4111-8111-111111111111");
    return Response.json({ item: { id: "draft" } });
  };
  await api.createSubmission("news", { title: "Title", content: ["Body"] }, "11111111-1111-4111-8111-111111111111");
});

test("a lost upload-intent response retries its original idempotency key", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const keys = [];
  let uploads = 0;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("/upload-intent")) {
      keys.push(options.headers.get("Idempotency-Key"));
      if (keys.length === 1) throw new TypeError("Connection lost after server saved intent");
      return Response.json({ upload: { attachmentId: "same-image", method: "PUT", uploadUrl: "https://upload.example.test/image" } });
    }
    if (url.startsWith("https://upload.")) { uploads++; return new Response(null); }
    if (url.endsWith("/complete")) return Response.json({ attachment: { id: "same-image" } });
    assert.fail(`Unexpected request: ${url}`);
  };
  const file = new File(["fixture"], "image.png", { type: "image/png" });
  await assert.rejects(api.uploadAttachment("news", file, "primary"), { status: 0 });
  await api.uploadAttachment("news", file, "primary");
  assert.match(keys[0], /^[0-9a-f-]{36}$/);
  assert.equal(keys[0], keys[1]);
  assert.equal(uploads, 1);
});

test("unconfirmed attachment completion retries without a duplicate upload", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const invalid of [{}, { attachment: { id: "different" } }, { attachment: { id: "image", storageStatus: "pending" } }]) {
    let intents = 0, uploads = 0, completes = 0;
    globalThis.fetch = async (url) => {
      if (url.endsWith("/upload-intent")) {
        intents++;
        return Response.json({ upload: { attachmentId: "image", method: "PUT", uploadUrl: "https://upload.example.test/image" } });
      }
      if (url.startsWith("https://upload.")) { uploads++; return new Response(null); }
      if (url.endsWith("/complete")) return Response.json(++completes === 1 ? invalid : { attachment: { id: "image" } });
      assert.fail(`Unexpected request: ${url}`);
    };
    const file = new File(["fixture"], "image.png", { type: "image/png" });
    await assert.rejects(api.uploadAttachment("news", file, "primary"), { status: 502 });
    await api.uploadAttachment("news", file, "primary");
    assert.equal(intents, 1);
    assert.equal(uploads, 1);
    assert.equal(completes, 2);
  }
});

test("an already completed upload-intent is verified without uploading again", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(url);
    if (url.endsWith("/upload-intent")) return Response.json({ upload: { attachmentId: "existing-image", status: "ready" } });
    if (url.endsWith("/existing-image/complete")) return Response.json({ attachment: { id: "existing-image" } });
    assert.fail(`Unexpected request: ${url}`);
  };
  const result = await api.uploadAttachment("news", new File(["fixture"], "image.png"), "primary");
  assert.equal(result.attachment.id, "existing-image");
  assert.equal(requests.length, 2);
});

test("a server-deleted rejected upload can start a fresh attempt", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const keys = [];
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("/upload-intent")) {
      keys.push(options.headers.get("Idempotency-Key"));
      return Response.json({ upload: { attachmentId: "image", method: "PUT", uploadUrl: "https://upload.example.test/image" } });
    }
    if (url.startsWith("https://upload.")) return new Response(null);
    if (url.endsWith("/complete")) return keys.length === 1
      ? Response.json({ error: "FILE_SIZE_MISMATCH" }, { status: 400 })
      : Response.json({ attachment: { id: "image" } });
    assert.fail(`Unexpected request: ${url}`);
  };
  const file = new File(["fixture"], "image.png");
  await assert.rejects(api.uploadAttachment("news", file, "primary"), { status: 400 });
  await api.uploadAttachment("news", file, "primary");
  assert.notEqual(keys[0], keys[1]);
});

test("optional AI requests have a bounded timeout and fail with an API error", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const controller = new AbortController();
  controller.abort(new DOMException("Request timed out", "TimeoutError"));
  t.mock.method(AbortSignal, "timeout", (milliseconds) => {
    assert.equal(milliseconds, 25_000);
    return controller.signal;
  });
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.signal, controller.signal);
    throw options.signal.reason;
  };
  await assert.rejects(api.improveText({ text: "Original text", field: "news.title", mode: "news", language: "et" }), {
    name: "ApiError", message: "network_error", status: 0
  });
});

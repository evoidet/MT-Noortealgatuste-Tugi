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
    ["[]", "application/json", 200],
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

test("API failures retain HTTP status and structured error details", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const status of [400, 401, 403, 404, 409, 413, 415, 422, 429, 500, 502, 503]) {
    globalThis.fetch = async () => Response.json({ error: "NEWS_CREATE_FAILED", stage: "database" }, { status });
    await assert.rejects(api.createSubmission("news", {}), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, status);
      assert.equal(error.code, "NEWS_CREATE_FAILED");
      assert.equal(error.stage, "database");
      return true;
    });
  }
  for (const failure of [
    { ok: false, error: "NEWS_CREATE_FAILED", stage: "database" },
    { success: false, error: { code: "NEWS_CREATE_FAILED", message: "Unable to save news", stage: "database" } }
  ]) {
    globalThis.fetch = async () => Response.json(failure);
    await assert.rejects(api.createSubmission("news", {}), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "NEWS_CREATE_FAILED");
      assert.equal(error.stage, "database");
      assert.deepEqual(error.payload, failure);
      return true;
    });
  }
  globalThis.fetch = async () => { throw new TypeError("Connection lost"); };
  await assert.rejects(api.createSubmission("news", {}), { name: "ApiError", status: 0, code: "network_error" });
});

test("lost PUT responses and conflicts recover the stored image without deletion or another upload", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const status of [0, 409, 502]) {
    let uploads = 0, completions = 0;
    globalThis.fetch = async (url, options) => {
      assert.notEqual(options.method, "DELETE");
      if (url.endsWith("/upload-intent")) return Response.json({ upload: {
        attachmentId: "stored-image", method: "PUT", uploadUrl: "https://upload.example.test/image"
      } });
      if (url.startsWith("https://upload.")) {
        uploads++;
        if (status === 0) throw new TypeError("Response lost after Blob stored the file");
        return new Response("Upstream diagnostic must not reach the user", { status });
      }
      if (url.endsWith("/complete")) {
        completions++;
        return Response.json({ attachment: { id: "stored-image", storageStatus: "ready" } });
      }
      assert.fail(`Unexpected request: ${url}`);
    };
    const result = await api.uploadAttachment("news", new File(["fixture"], "image.png"), "primary");
    assert.equal(result.attachment.id, "stored-image");
    assert.equal(uploads, 1);
    assert.equal(completions, 1);
  }
});

test("an uncertain PUT followed by temporary verification failure retries only completion", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let intents = 0, uploads = 0, completions = 0;
  globalThis.fetch = async (url, options) => {
    assert.notEqual(options.method, "DELETE");
    if (url.endsWith("/upload-intent")) {
      intents++;
      return Response.json({ upload: { attachmentId: "stored-image", method: "PUT", uploadUrl: "https://upload.example.test/image" } });
    }
    if (url.startsWith("https://upload.")) {
      uploads++;
      throw new TypeError("Response lost after Blob stored the file");
    }
    if (url.endsWith("/complete")) return ++completions === 1
      ? Response.json({ error: "BLOB_READ_FAILED" }, { status: 503 })
      : Response.json({ attachment: { id: "stored-image" } });
    assert.fail(`Unexpected request: ${url}`);
  };
  const file = new File(["fixture"], "image.png");
  await assert.rejects(api.uploadAttachment("news", file, "primary"), { status: 503, code: "BLOB_READ_FAILED" });
  await api.uploadAttachment("news", file, "primary");
  assert.equal(intents, 1);
  assert.equal(uploads, 1);
  assert.equal(completions, 2);
});

test("a PUT that stored no image returns a typed error and reuses its original grant on retry", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const status of [0, 400, 401, 403, 404, 409, 413, 415, 422, 429, 500, 502, 503]) {
    const keys = [];
    let uploads = 0;
    globalThis.fetch = async (url, options) => {
      assert.notEqual(options.method, "DELETE");
      if (url.endsWith("/upload-intent")) {
        keys.push(options.headers.get("Idempotency-Key"));
        return Response.json({ upload: { attachmentId: "original-image", method: "PUT", uploadUrl: "https://upload.example.test/image" } });
      }
      if (url.startsWith("https://upload.")) {
        if (++uploads > 1) return new Response(null);
        if (status === 0) throw new TypeError("Connection failed before uploading");
        return new Response("PRIVATE upstream response", { status });
      }
      if (url.endsWith("/complete")) return uploads === 1
        ? Response.json({ error: "BLOB_NOT_FOUND" }, { status: 404 })
        : Response.json({ attachment: { id: "original-image" } });
      assert.fail(`Unexpected request: ${url}`);
    };
    const file = new File(["fixture"], "image.png");
    await assert.rejects(api.uploadAttachment("news", file, "primary"), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, status);
      assert.equal(error.code, status === 413 ? "FILE_TOO_LARGE" : status === 415 ? "FILE_TYPE_NOT_ALLOWED" : "BLOB_UPLOAD_FAILED");
      assert.equal(error.stage, "upload");
      assert.doesNotMatch(JSON.stringify(error), /PRIVATE/);
      return true;
    });
    await api.uploadAttachment("news", file, "primary");
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    assert.equal(uploads, 2);
  }
});

test("verification after an uncertain PUT can resume an upload confirmed missing on the next retry", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const keys = [];
  let uploads = 0, completions = 0;
  globalThis.fetch = async (url, options) => {
    assert.notEqual(options.method, "DELETE");
    if (url.endsWith("/upload-intent")) {
      keys.push(options.headers.get("Idempotency-Key"));
      return Response.json({ upload: { attachmentId: "original-image", method: "PUT", uploadUrl: "https://upload.example.test/image" } });
    }
    if (url.startsWith("https://upload.")) {
      if (++uploads === 1) throw new TypeError("Network failure before upload");
      return new Response(null);
    }
    if (url.endsWith("/complete")) {
      completions++;
      if (completions === 1) return Response.json({ error: "BLOB_READ_FAILED" }, { status: 503 });
      if (completions === 2) return Response.json({ error: "BLOB_NOT_FOUND" }, { status: 404 });
      return Response.json({ attachment: { id: "original-image" } });
    }
    assert.fail(`Unexpected request: ${url}`);
  };
  const file = new File(["fixture"], "image.png");
  await assert.rejects(api.uploadAttachment("news", file, "primary"), { status: 503 });
  const result = await api.uploadAttachment("news", file, "primary");
  assert.equal(result.attachment.id, "original-image");
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(uploads, 2);
  assert.equal(completions, 3);
});

test("image upload metadata uses a supported MIME type when the browser omits or misreports it", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const [name, type] of [["photo.JPG", "image/jpeg"], ["photo.jpeg", "image/jpeg"], ["photo.png", "image/png"], ["photo.webp", "image/webp"]]) {
    globalThis.fetch = async (url, options) => {
      if (url.endsWith("/upload-intent")) {
        assert.equal(JSON.parse(options.body).mimeType, type);
        return Response.json({ upload: { attachmentId: "image", method: "PUT", uploadUrl: "https://upload.example.test/image", headers: { "Content-Type": type } } });
      }
      if (url.startsWith("https://upload.")) {
        assert.equal(options.headers["Content-Type"], type);
        return new Response(null);
      }
      if (url.endsWith("/complete")) return Response.json({ attachment: { id: "image" } });
      assert.fail(`Unexpected request: ${url}`);
    };
    await api.uploadAttachment("news", new File(["fixture"], name, { type: "application/octet-stream" }), "primary");
  }
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

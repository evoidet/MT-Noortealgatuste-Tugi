import assert from "node:assert/strict";
import test from "node:test";
import { api } from "../public/api.js";

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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { ApiError } from "../public/api.js";

async function harness() {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const toasts = [], logs = [];
  let sessionResets = 0;
  const context = vm.createContext({ ApiError, document: { getElementById: () => null },
    console: { error: (...args) => logs.push(args) },
    toast: (key) => toasts.push(key), resetSession: () => { sessionResets++; } });
  vm.runInContext(source.replace(/^import[\s\S]*?from "\.\/[^"\n]+";\s*/gm, "").replace("void init();", ""), context);
  const handlers = vm.runInContext(`
    showToast = toast;
    loadSession = resetSession;
    renderSubmissionValidation = () => false;
    ({ friendlyErrorKey, handlePreviewError, handleSubmissionError, safeClientError });
  `, context);
  return { ...handlers, toasts, logs, sessionResets: () => sessionResets };
}

test("news preview and final Submit retain known API failures instead of generic fallback", async () => {
  const ui = await harness();
  for (const [status, code, key] of [
    [400, "VALIDATION_ERROR", "validation"], [401, "UNAUTHENTICATED", "sessionExpired"],
    [403, "FORBIDDEN", "forbidden"], [404, "NOT_FOUND", "notFound"],
    [409, "NEWS_SLUG_CONFLICT", "newsSlugConflict"], [413, "REQUEST_TOO_LARGE", "fileTooLarge"],
    [415, "FILE_TYPE_NOT_ALLOWED", "fileType"], [422, "VALIDATION_ERROR", "validation"],
    [429, "RATE_LIMITED", "rateLimit"], [500, "NEWS_CREATE_FAILED", "newsSaveFailed"],
    [500, "NEWS_SAVE_FAILED", "newsSaveFailed"], [500, "NEWS_SUBMIT_FAILED", "newsSubmitFailed"],
    [502, "NEWS_IMAGE_UPLOAD_FAILED", "imageUploadFailed"], [503, "REQUEST_FAILED", "serverUnavailable"],
    [0, "NETWORK_ERROR", "network"], [0, "BLOB_UPLOAD_FAILED", "imageUploadFailed"],
    [200, "INVALID_API_RESPONSE", "invalidResponse"], [502, "INVALID_API_RESPONSE", "invalidResponse"],
    [500, "missing_submission_id", "invalidResponse"], [502, "invalid_submission_response", "invalidResponse"],
    [500, "invalid_upload_grant", "invalidResponse"],
    [401, "INVALID_API_RESPONSE", "sessionExpired"], [413, "INVALID_API_RESPONSE", "fileTooLarge"]
  ]) {
    const error = new ApiError("PRIVATE diagnostic must never reach the UI", status, { error: code });
    for (const handler of [ui.handlePreviewError, ui.handleSubmissionError]) {
      handler(error);
      assert.equal(ui.toasts.at(-1), `staff.errors.${key}`, `${status}/${code}`);
    }
  }
  assert.equal(ui.sessionResets(), 4);
  assert.doesNotMatch(JSON.stringify(ui.logs), /PRIVATE/);
});

test("structured news error diagnostics preserve safe code and stage", async () => {
  const ui = await harness();
  const error = new ApiError("Unable to save", 500,
    { ok: false, error: { code: "NEWS_SAVE_FAILED", stage: "database", message: "Unable to save" } });
  assert.equal(ui.friendlyErrorKey(error), "staff.errors.newsSaveFailed");
  assert.equal(ui.safeClientError(error).stage, "database");
});

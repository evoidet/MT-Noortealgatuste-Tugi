import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { ApiError } from "../public/api.js";

const messages = {
  "staff.errors.registrationUrlInvalid": "Registration URL is invalid.",
  "staff.errors.imageUrlInvalid": "Image URL is invalid.",
  "staff.errors.imageUploadFailed": "Image upload failed."
};

// Exercise the actual form/error handlers without a browser dependency. Real
// submission coverage also lives in the API tests and browser verification.
class Element {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.value = "";
    this.className = "";
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.className.split(" "), ...names])].join(" ").trim(); },
      remove: (...names) => { this.className = this.className.split(" ").filter((name) => !names.includes(name)).join(" "); },
      contains: (name) => this.className.split(" ").includes(name)
    };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  setCustomValidity(message) { this.validationMessage = message; }
  matches(selector) {
    if (selector === "[aria-invalid='true']" || selector === '[aria-invalid="true"]') return this.getAttribute("aria-invalid") === "true";
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    return false;
  }
  append(...children) { children.forEach((child) => { child.parentElement = this; this.children.push(child); }); }
  prepend(child) { child.parentElement = this; this.children.unshift(child); }
  before(child) {
    child.parentElement = this.parentElement;
    this.parentElement.children.splice(this.parentElement.children.indexOf(this), 0, child);
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
  }
  closest(selector) {
    return selector.split(",").some((part) => this.matches(part.trim())) ? this : this.parentElement?.closest(selector) ?? null;
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  focus() { this.focused = true; }
  scrollIntoView() {}
}

async function harness({ preview = false, uploadAttachment = async () => ({}) } = {}) {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const form = new Element("form");
  const previewView = new Element("section");
  previewView.className = "staff-preview-view";
  const canvas = new Element();
  canvas.className = "staff-preview-canvas";
  previewView.append(canvas);
  const controls = new Map(preview ? [] : [["submissionForm", form]]);
  for (const id of ["newsRegistrationUrl", "newsImage", "newsMainImage", "newsAdditionalImages"]) {
    const container = new Element("label");
    container.className = id.endsWith("Images") || id === "newsMainImage" ? "staff-file-field" : "staff-field";
    const control = new Element("input");
    control.id = id;
    container.append(control);
    form.append(container);
    controls.set(id, control);
  }
  const document = {
    getElementById: (id) => controls.get(id) ?? null,
    createElement: (tag) => new Element(tag),
    querySelector: (selector) => selector === ".staff-preview-view" ? preview ? previewView : null
      : selector === "#submissionForm" ? preview ? null : form : null,
    querySelectorAll: (selector) => form.querySelectorAll(selector)
  };
  const toasts = [], savedPayloads = [];
  const context = vm.createContext({
    ApiError, URL, document,
    window: { location: { origin: "https://news.example.test" } },
    console: { error() {} },
    api: {
      uploadAttachment,
      createSubmission: async (type, data) => {
        savedPayloads.push({ type, data });
        return { submission: { id: "submission-id", type, data } };
      }
    },
    t: (key) => messages[key] || key,
    contentToParagraphs: (value) => value ? value.split(/\n\s*\n/) : [],
    toast: (key) => toasts.push(key)
  });
  vm.runInContext(source.replace(/^import[\s\S]*?from "\.\/[^"\n]+";\s*/gm, "").replace("void init();", ""), context);
  const handlers = vm.runInContext(`
    showToast = toast;
    state.formType = "news";
    state.view = ${JSON.stringify(preview ? "preview" : "form")};
    ({ state, newsUrlValidationIssues, validateNewsUrlFields, collectNewsData,
       validationControlId, handleError, handlePreviewError, handleSubmissionError,
       uploadPendingFiles, clearControlValidation, saveData });
  `, context);
  return { ...handlers, controls, form, previewView, toasts, savedPayloads };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("optional registration URL accepts empty values, Google Forms, and trimmed HTTPS URLs", async () => {
  const ui = await harness();
  for (const registrationUrl of [undefined, null, "", " \n\t ",
    "https://forms.gle/example", "https://docs.google.com/forms/d/e/example/viewform",
    "https://example.org/register?event=42", "  https://forms.gle/example  "]) {
    assert.deepEqual(plain(ui.newsUrlValidationIssues({ registrationUrl })), [], String(registrationUrl));
  }
  ui.controls.get("newsRegistrationUrl").value = "  https://forms.gle/example  ";
  assert.equal(ui.validateNewsUrlFields(), true);
  assert.equal(ui.controls.get("newsRegistrationUrl").value, "https://forms.gle/example");
  assert.equal(ui.collectNewsData().registrationUrl, "https://forms.gle/example");
  ui.controls.get("newsRegistrationUrl").value = "   ";
  assert.equal(ui.validateNewsUrlFields(), true);
  assert.equal(ui.collectNewsData().registrationUrl, "");
});

test("malformed registration and image URLs identify each field independently", async () => {
  const ui = await harness();
  assert.deepEqual(plain(ui.newsUrlValidationIssues({ registrationUrl: "not a link", image: "broken image" })), [
    { field: "registrationUrl", message: "Registration URL is invalid." },
    { field: "image", message: "Image URL is invalid." }
  ]);
  for (const registrationUrl of ["javascript:alert(1)", "https://user:password@example.org", "x".repeat(2049)]) {
    assert.deepEqual(plain(ui.newsUrlValidationIssues({ registrationUrl })), [
      { field: "registrationUrl", message: "Registration URL is invalid." }
    ]);
  }
  for (const image of ["/api/staff/public/news/article/attachments/image", "https://images.example.org/photo.jpg"]) {
    assert.deepEqual(plain(ui.newsUrlValidationIssues({ image })), [], image);
  }
});

test("invalid URL shows beside its control, then clears after correction", async () => {
  const ui = await harness();
  const control = ui.controls.get("newsRegistrationUrl");
  control.value = "broken registration";
  assert.equal(ui.validateNewsUrlFields(), false);
  assert.equal(control.getAttribute("aria-invalid"), "true");
  assert.equal(control.parentElement.querySelector(".staff-field-error").textContent, "Registration URL is invalid.");
  assert.equal(ui.controls.get("newsImage").getAttribute("aria-invalid"), null);
  assert.deepEqual(ui.toasts, []);
  control.value = "https://forms.gle/example";
  assert.equal(ui.validateNewsUrlFields(), true);
  assert.equal(control.getAttribute("aria-invalid"), null);
  assert.equal(control.parentElement.querySelector(".staff-field-error"), null);
});

test("preview and submit errors render API URL details next to the correct form field", async () => {
  for (const handlerName of ["handleError", "handlePreviewError", "handleSubmissionError"]) {
    for (const [field, controlId, message] of [
      ["registrationUrl", "newsRegistrationUrl", "Registration URL is invalid."],
      ["image", "newsImage", "Image URL is invalid."]
    ]) {
      const ui = await harness();
      ui[handlerName](new ApiError("PRIVATE URL diagnostic", 400, {
        ok: false, error: { code: "VALIDATION_ERROR", field, message }, fields: [{ field, message }]
      }));
      const control = ui.controls.get(controlId);
      assert.equal(control.getAttribute("aria-invalid"), "true", `${handlerName}/${field}`);
      assert.equal(control.parentElement.querySelector(".staff-field-error").textContent, message);
      assert.deepEqual(ui.toasts, []);
    }
  }
});

test("API field validation works in preview and is retained when returning to edit", async () => {
  const ui = await harness({ preview: true });
  ui.handleSubmissionError(new ApiError("Invalid URL", 400, {
    ok: false, error: { code: "VALIDATION_ERROR", field: "registrationUrl", message: "Registration URL is invalid." },
    fields: [{ field: "registrationUrl", message: "Registration URL is invalid." }]
  }));
  const summary = ui.previewView.querySelector(".staff-validation-summary");
  assert.ok(summary);
  assert.equal(summary.children[1].children[0].textContent, "Registration URL is invalid.");
  assert.equal(ui.state.validationIssues[0].field, "registrationUrl");
  assert.equal(ui.validationControlId("news", "registrationUrl"), "newsRegistrationUrl");
  assert.equal(ui.validationControlId("news", "image"), "newsImage");
  assert.deepEqual(ui.toasts, []);
});

test("a queued uploaded image does not require or validate a stale manual image URL", async () => {
  const ui = await harness();
  const file = Object.assign(new Blob(["test image"], { type: "image/png" }), { name: "image.png", lastModified: 1 });
  ui.state.pendingFiles.set("news-main", [file]);
  ui.controls.get("newsImage").value = "stale invalid URL";
  assert.equal(ui.validateNewsUrlFields(), true);
  const data = ui.collectNewsData();
  await ui.saveData("news", data);
  assert.equal(ui.savedPayloads[0].data.image, "");
  assert.equal(ui.savedPayloads[0].data.registrationUrl, "");
  assert.equal(ui.savedPayloads[0].data._mainImagePreview, undefined);
  URL.revokeObjectURL(data._mainImagePreview);
});

test("image upload failures point to the upload field and never registration", async () => {
  const ui = await harness({ uploadAttachment: async () => { throw new ApiError("PRIVATE storage diagnostic", 502, { error: "BLOB_READ_FAILED" }); } });
  ui.state.pendingFiles.set("news-main", [{ name: "photo.png", size: 100, lastModified: 1 }]);
  let failure;
  try { await ui.uploadPendingFiles("submission-id"); } catch (error) { failure = error; }
  assert.ok(failure instanceof ApiError);
  assert.equal(failure.code, "NEWS_IMAGE_UPLOAD_FAILED");
  ui.handleSubmissionError(failure);
  assert.equal(ui.controls.get("newsMainImage").parentElement.querySelector(".staff-field-error").textContent, "Image upload failed.");
  assert.equal(ui.controls.get("newsRegistrationUrl").getAttribute("aria-invalid"), null);
  assert.deepEqual(ui.toasts, []);
});

test("saving an image works both with and without a registration link", async () => {
  for (const registrationUrl of ["https://forms.gle/example", ""]) {
    const uploads = [];
    const ui = await harness({ uploadAttachment: async (...args) => { uploads.push(args); } });
    const file = Object.assign(new Blob(["test image"], { type: "image/png" }), { name: "image.png", lastModified: 1 });
    ui.state.pendingFiles.set("news-main", [file]);
    ui.controls.get("newsRegistrationUrl").value = registrationUrl;
    assert.equal(ui.validateNewsUrlFields(), true);
    const data = ui.collectNewsData();
    const saved = await ui.saveData("news", data);
    assert.equal(saved.id, "submission-id");
    assert.equal(ui.savedPayloads[0].data.registrationUrl, registrationUrl);
    assert.equal(ui.savedPayloads[0].data.image, "");
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0][0], "submission-id");
    assert.equal(uploads[0][1], file);
    assert.equal(uploads[0][2], "primary");
    URL.revokeObjectURL(data._mainImagePreview);
  }
});

test("additional image failure identifies its picker; authentication failures keep their cause", async () => {
  const ui = await harness({ uploadAttachment: async () => { throw new Error("PRIVATE provider exception"); } });
  ui.state.pendingFiles.set("news-additional", [{ name: "photo.png", size: 100, lastModified: 1 }]);
  await assert.rejects(ui.uploadPendingFiles("submission-id"), (error) => {
    ui.handleSubmissionError(error);
    assert.equal(ui.controls.get("newsAdditionalImages").parentElement.querySelector(".staff-field-error").textContent, "Image upload failed.");
    return error.code === "NEWS_IMAGE_UPLOAD_FAILED";
  });
  for (const status of [401, 403]) {
    const denied = new ApiError("Authorization failed", status, { error: status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" });
    const deniedUi = await harness({ uploadAttachment: async () => { throw denied; } });
    deniedUi.state.pendingFiles.set("news-main", [{ name: "photo.png", size: 100, lastModified: 1 }]);
    await assert.rejects(deniedUi.uploadPendingFiles("submission-id"), (error) => error === denied);
  }
});

test("a denied image PUT is an upload failure, not a staff authentication failure", async () => {
  for (const status of [401, 403]) {
    const ui = await harness({ uploadAttachment: async () => {
      throw new ApiError("blob_upload_failed", status, { error: "BLOB_UPLOAD_FAILED", stage: "upload" });
    } });
    ui.state.pendingFiles.set("news-main", [{ name: "photo.png", size: 100, lastModified: 1 }]);
    await assert.rejects(ui.uploadPendingFiles("submission-id"), (error) => {
      assert.equal(error.code, "NEWS_IMAGE_UPLOAD_FAILED");
      assert.equal(error.status, 502);
      ui.handlePreviewError(error);
      assert.equal(ui.controls.get("newsMainImage").parentElement.querySelector(".staff-field-error").textContent,
        "Image upload failed.");
      return true;
    });
  }
});

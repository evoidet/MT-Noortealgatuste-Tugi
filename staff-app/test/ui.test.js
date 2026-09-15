import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const publicRoot = new URL("../public/", import.meta.url);

test("dark-green shared CTA variants override the low-specificity button reset", async () => {
  const css = await readFile(new URL("styles.css", publicRoot), "utf8");
  const translations = await readFile(new URL("staff-translations.js", publicRoot), "utf8");
  assert.match(css, /:where\(body\.staff-page\) button\s*\{\s*color:\s*inherit;/);
  assert.match(css, /\.staff-button--primary\s*\{[^}]*background:\s*var\(--staff-dark\);[^}]*color:\s*#fff;/s);
  assert.match(css, /\.staff-button--success\s*\{[^}]*background:\s*var\(--staff-success\);[^}]*color:\s*#fff;/s);
  assert.match(css, /\.staff-button--primary \.staff-button-spinner[\s\S]*border-top-color:\s*#fff;/);
  assert.match(css, /\.staff-status--approved,\s*\.staff-status--published,\s*\.staff-status--ready_for_export/);
  assert.match(translations, /"staff\.status\.published": \["Avaldatud", "Published", "Опубликовано"\]/);
});

test("submission UI renders persistent structured issues and requires positive money", async () => {
  const source = await readFile(new URL("app.js", publicRoot), "utf8");
  const translations = await readFile(new URL("staff-translations.js", publicRoot), "utf8");
  assert.match(source, /summary\.setAttribute\("role", "alert"\)/);
  assert.match(source, /validation\.fields\.forEach/);
  assert.match(source, /applyFormValidationIssues\(type\)/);
  assert.match(source, /id: `expenseItemAmount\$\{index\}`[^\n]*min: "0\.01"/);
  assert.match(source, /id: `invoiceUnitPrice\$\{index\}`[^\n]*min: "0\.01"/);
  assert.match(source, /id: "expenseReimbursementRecipient"/);
  assert.match(source, /state\.session\?\.reimbursementRecipients/);
  assert.doesNotMatch(source, /id: "expensePerson"/);
  assert.match(translations,
    /"staff\.expense\.reimbursementRecipient": \["Kellele raha tagastatakse\?", "Reimbursement recipient", "Кому возвращаются деньги\?"\]/);
});

test("AI suggestions change a form field only through the explicit use action", async () => {
  const source = await readFile(new URL("app.js", publicRoot), "utf8");
  const generateStart = source.indexOf("async function generateAiSuggestion()");
  const useStart = source.indexOf("function useAiSuggestion()");
  const nextFunction = source.indexOf("function addLine(type)", useStart);
  const generateSource = source.slice(generateStart, useStart);
  const useSource = source.slice(useStart, nextFunction);

  assert.ok(generateStart >= 0 && useStart > generateStart && nextFunction > useStart);
  assert.match(generateSource, /state\.ai\.suggestion = suggestion/);
  assert.doesNotMatch(generateSource, /target\.value = state\.ai\.suggestion/);
  assert.match(useSource, /target\.value = state\.ai\.suggestion/);
  assert.match(source, /if \(action === "use-ai"\) \{\s*useAiSuggestion\(\);/);
});

async function submissionUiHarness(api) {
  const source = await readFile(new URL("app.js", publicRoot), "utf8");
  const controls = ["submit-preview", "save-preview", "edit-preview", "navigate"]
    .map((action) => ({ disabled: false, dataset: { action }, innerHTML: action }));
  const permanentlyDisabled = { disabled: true, dataset: {}, innerHTML: "unavailable" };
  controls.push(permanentlyDisabled);
  const attributes = new Map();
  const viewRoot = {
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name)
  };
  const shell = { querySelectorAll: () => controls };
  const context = vm.createContext({
    api,
    ApiError: Error,
    t: (key) => key,
    escapeHtml: (value) => value,
    contentToParagraphs: (value) => value ? [value] : [],
    document: {
      getElementById: (id) => id === "authenticatedShell" ? shell : id === "viewRoot" ? viewRoot : null,
      querySelector: () => null
    }
  });
  vm.runInContext(source.replace(/^import[\s\S]*?from "\.\/[^"\n]+";\s*/gm, "").replace("void init();", ""), context);
  const ui = vm.runInContext(`
    showToast = () => {};
    handleError = () => {};
    handleSubmissionError = () => {};
    renderSubmissionSuccess = (type, record) => { state.view = "success"; state.lastSubmitted = { type, record }; };
    validateCurrentForm = () => true;
    collectFormData = () => ({ invoiceNumber: "TEST-ONLY" });
    state.formType = "invoice";
    state.preview = { type: "invoice", data: { invoiceNumber: "TEST-ONLY" } };
    ({ state, saveDraft, savePreview, openPreview, handleAction, collectNewsData, canCreate });
  `, context);
  return { ...ui, controls, attributes, permanentlyDisabled };
}

test("an in-flight submission blocks save, edit, navigation, and duplicate requests", async () => {
  let completeCreate;
  let createCalls = 0;
  let submitCalls = 0;
  const ui = await submissionUiHarness({
    createSubmission: () => {
      createCalls += 1;
      return new Promise((resolve) => { completeCreate = resolve; });
    },
    submitSubmission: async () => {
      submitCalls += 1;
      return { submission: { id: "synthetic-invoice", type: "invoice", status: "APPROVED" } };
    }
  });
  const operation = ui.savePreview(ui.controls[0], true);
  assert.equal(ui.attributes.get("aria-busy"), "true");
  assert.ok(ui.controls.every((control) => control.disabled));
  await ui.savePreview(ui.controls[0], true);
  await ui.savePreview(ui.controls[1], false);
  await ui.saveDraft(ui.controls[1]);
  await ui.openPreview(ui.controls[1]);
  await ui.handleAction(ui.controls[2]);
  await ui.handleAction(ui.controls[3]);
  assert.equal(createCalls, 1);
  assert.equal(ui.state.preview.type, "invoice");
  completeCreate({ submission: { id: "synthetic-invoice", type: "invoice", status: "DRAFT" } });
  await operation;
  assert.equal(submitCalls, 1);
  assert.equal(ui.state.view, "success");
  assert.equal(ui.state.formOperation, false);
  assert.equal(ui.attributes.has("aria-busy"), false);
  assert.ok(ui.controls.slice(0, -1).every((control) => !control.disabled));
  assert.equal(ui.permanentlyDisabled.disabled, true);
});

test("failed saves restore controls and preserve the preview for retry", async () => {
  const ui = await submissionUiHarness({ createSubmission: async () => { throw new Error("synthetic failure"); } });
  await ui.savePreview(ui.controls[1], false);
  assert.equal(ui.state.formOperation, false);
  assert.equal(ui.state.preview.data.invoiceNumber, "TEST-ONLY");
  assert.equal(ui.attributes.has("aria-busy"), false);
  assert.ok(ui.controls.slice(0, -1).every((control) => !control.disabled));
  assert.equal(ui.controls[1].innerHTML, "save-preview");
  assert.equal(ui.permanentlyDisabled.disabled, true);
});

test("news editor preserves stored translations and uses server creation permissions", async () => {
  const ui = await submissionUiHarness({});
  const translations = { et: { title: "Uudis" }, en: { title: "News" }, ru: { title: "Новость" } };
  ui.state.current = { data: { language: "et", translations } };
  assert.deepEqual(ui.collectNewsData().translations, translations);
  assert.equal(ui.collectNewsData().language, "et");
  ui.state.session = { user: { role: "member" }, permissions: ["news:create", "expense:create"] };
  assert.equal(ui.canCreate("news"), true);
  assert.equal(ui.canCreate("invoice"), false);
  ui.state.session.user.role = "finance";
  assert.equal(ui.canCreate("invoice"), false);
});


test("news submission errors and invalid success responses preserve the preview", async () => {
  for (const result of [null, {}, { item: { id: "news-fixture", status: "DRAFT" } },
    { item: { id: "wrong-id", status: "SUBMITTED" } }, new Error("Database unavailable")]) {
    const ui = await submissionUiHarness({
      createSubmission: async () => ({ item: { id: "news-fixture", type: "news", status: "DRAFT" } }),
      submitSubmission: async () => { if (result instanceof Error) throw result; return result; }
    });
    ui.state.formType = "news";
    ui.state.preview = { type: "news", data: { title: "Õ ä ö ü š ž", content: ["Body"], summary: "" } };
    await ui.savePreview(ui.controls[0], true);
    assert.notEqual(ui.state.view, "success");
    assert.equal(ui.state.preview.data.title, "Õ ä ö ü š ž");
    assert.equal(ui.state.editingId, "news-fixture");
  }
});

test("an invalid update response cannot advance news to submission", async () => {
  const ui = await submissionUiHarness({
    updateSubmission: async () => ({}),
    submitSubmission: async () => assert.fail("Unconfirmed save must not submit")
  });
  ui.state.editingId = "news-fixture";
  ui.state.formType = "news";
  ui.state.preview = { type: "news", data: { title: "Preserve me", content: ["Body"] } };
  await ui.savePreview(ui.controls[0], true);
  assert.notEqual(ui.state.view, "success");
  assert.equal(ui.state.preview.data.title, "Preserve me");
});


test("news image upload failure keeps the saved draft and never submits", async () => {
  const ui = await submissionUiHarness({
    createSubmission: async () => ({ item: { id: "news-image", type: "news", status: "DRAFT" } }),
    uploadAttachment: async () => { throw new Error("Upload unavailable"); },
    submitSubmission: async () => assert.fail("Image failure must not report completed submission")
  });
  ui.state.formType = "news";
  ui.state.preview = { type: "news", data: { title: "Image article", content: ["Body"] } };
  ui.state.pendingFiles.set("news-main", [{ name: "photo.png", size: 100, lastModified: 1 }]);
  await ui.savePreview(ui.controls[0], true);
  assert.notEqual(ui.state.view, "success");
  assert.equal(ui.state.editingId, "news-image");
  assert.equal(ui.state.preview.data.title, "Image article");
  assert.equal(ui.state.pendingFiles.get("news-main").length, 1);
});

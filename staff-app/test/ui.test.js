import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const publicRoot = new URL("../public/", import.meta.url);

test("dark-green shared CTA variants override the low-specificity button reset", async () => {
  const css = await readFile(new URL("styles.css", publicRoot), "utf8");
  assert.match(css, /:where\(body\.staff-page\) button\s*\{\s*color:\s*inherit;/);
  assert.match(css, /\.staff-button--primary\s*\{[^}]*background:\s*var\(--staff-dark\);[^}]*color:\s*#fff;/s);
  assert.match(css, /\.staff-button--success\s*\{[^}]*background:\s*var\(--staff-success\);[^}]*color:\s*#fff;/s);
  assert.match(css, /\.staff-button--primary \.staff-button-spinner[\s\S]*border-top-color:\s*#fff;/);
});

test("submission UI renders persistent structured issues and requires positive money", async () => {
  const source = await readFile(new URL("app.js", publicRoot), "utf8");
  assert.match(source, /summary\.setAttribute\("role", "alert"\)/);
  assert.match(source, /validation\.fields\.forEach/);
  assert.match(source, /applyFormValidationIssues\(type\)/);
  assert.match(source, /id: `expenseItemAmount\$\{index\}`[^\n]*min: "0\.01"/);
  assert.match(source, /id: `invoiceUnitPrice\$\{index\}`[^\n]*min: "0\.01"/);
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

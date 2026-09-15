import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

async function harness(improveText) {
  const nodes = Object.fromEntries(["aiDialog", "aiGenerateButton", "aiUseButton", "aiOriginal", "aiSuggestion", "aiMode", "newsTitle", "expenseActivity"].map((id) => [id, {
    value: "Algne tekst", textContent: "", disabled: false, focus() {}, dispatchEvent() {},
    showModal() { this.open = true; }, close() { this.open = false; }
  }]));
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const context = vm.createContext({ document: { getElementById: (id) => nodes[id] },
    window: { I18N: { getLanguage: () => "et" } }, api: { improveText }, ApiError: Error, Event: class {}, t: (key) => key });
  vm.runInContext(source.replace(/^import[\s\S]*?from "\.\/[^"\n]+";\s*/gm, "").replace("void init();", ""), context);
  const ui = vm.runInContext(`showToast = () => {}; handleError = () => {};
    setBusy = (button, busy) => { button.disabled = busy; };
    ({ state, openAiDialog, closeAiDialog, generateAiSuggestion, useAiSuggestion });`, context);
  return { ...ui, nodes, open(id) { ui.openAiDialog({ dataset: { target: id, field: id === "newsTitle" ? "news.title" : "expense.activity" } }); } };
}

test("a late AI response cannot be applied to a different field", async () => {
  let resolve;
  const ui = await harness(() => new Promise((done) => { resolve = done; }));
  ui.open("newsTitle");
  const pending = ui.generateAiSuggestion();
  ui.closeAiDialog();
  ui.open("expenseActivity");
  resolve({ suggestion: "Parandatud uudise pealkiri" });
  await pending;
  ui.useAiSuggestion();
  assert.equal(ui.nodes.expenseActivity.value, "Algne tekst");
  assert.equal(ui.nodes.aiUseButton.disabled, true);
});

test("AI correction is explicit and provider errors preserve original text", async () => {
  const ui = await harness(async () => ({ suggestion: "Parandatud tekst" }));
  ui.open("expenseActivity");
  await ui.generateAiSuggestion();
  assert.equal(ui.nodes.expenseActivity.value, "Algne tekst");
  ui.useAiSuggestion();
  assert.equal(ui.nodes.expenseActivity.value, "Parandatud tekst");
  const failed = await harness(async () => { throw new Error("provider failed"); });
  failed.open("newsTitle");
  await failed.generateAiSuggestion();
  assert.equal(failed.nodes.newsTitle.value, "Algne tekst");
  assert.equal(failed.nodes.aiUseButton.disabled, true);
  assert.equal(failed.nodes.aiGenerateButton.disabled, false);
});

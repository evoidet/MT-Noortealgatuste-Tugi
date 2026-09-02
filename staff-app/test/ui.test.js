import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

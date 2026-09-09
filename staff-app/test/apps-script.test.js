import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../../Ida-Virumaa-Noorte-Tunnustuskonkurss.gs", import.meta.url), "utf8");

test("Apps Script copies form answers as literal cells, including formula-like values", () => {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const calls = [];
  const range = new Proxy({}, { get: (_target, method) => (...args) => {
    if (method === "setValue") calls.push(args[0]);
    return range;
  } });
  const sheet = { getRange: () => range, getMaxRows: () => 200, setRowHeight() {} };
  const formula = '=IMPORTXML("https://example.invalid/", "//text()")';
  context.writeAnswerRow_(sheet, 1, formula, formula);
  context.setMergedText_(sheet, "K4:O11", formula);
  assert.deepEqual(calls, [`'${formula}`, `'${formula}`, `'${formula}`]);
  assert.equal(context.sheetText_("Õun & Иванов"), "Õun & Иванов");
  assert.equal(context.sheetText_(18), 18);
  let record;
  context.formatDateTime_ = () => "09.09.2026";
  context.appendSystemRecord_({ appendRow: (values) => { record = values; } }, { candidateName: formula }, "Candidate", "PROCESSED", formula);
  assert.equal(record[4], `'${formula}`);
  assert.equal(record[9], `'${formula}`);
});

test("Apps Script translation failures never include provider response bodies", () => {
  const marker = "SYNTHETIC_PRIVATE_PROVIDER_DETAIL";
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "synthetic" }) },
    Utilities: { getUuid: () => "synthetic", sleep() {} },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 401, getContentText: () => marker }) }
  });
  vm.runInContext(source, context);
  assert.throws(() => context.translateJsonToEstonian_({ f1: "Текст" }), (error) => {
    assert.match(error.message, /OpenAI HTTP 401/);
    assert.ok(!error.message.includes(marker));
    return true;
  });
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { renderExpensePreview, renderSubmissionPreview } from "../public/previews.js";
import { validateSubmissionData } from "../src/validation.js";

function expense(overrides = {}) {
  return {
    project: "Õpilaste töötuba õ ä ö ü š ž",
    person: "Saved recipient",
    date: "2026-09-08",
    location: "Jõhvi",
    activity: "Juhendasin noorte töötuba.",
    purpose: "Kulu toetas noorte osalust.",
    result: "Valmis kolm tegevuskava.",
    items: [{ date: "2026-09-07", documentNumber: "TŠ-123", vendor: "Näide OÜ",
      description: "Töötoa materjalid", amount: 12.345 }],
    ...overrides
  };
}

test("expense preview follows the updated six-section document with approved recipient and saved number", () => {
  const data = validateSubmissionData("expense", expense(), { final: true });
  const html = renderExpensePreview(data, {
    submission: { id: "6559a6ad-0000-4000-8000-000000000001" },
    reimbursementRecipient: { name: "Jüri Põld", email: "juri@example.test" },
    attachments: [{ originalName: "tšekk.pdf" }]
  });
  for (const text of [
    "KULUDE HÜVITAMISE AVALDUS JA KULUARUANNE", "1. Üldandmed",
    "2. Tegevuse sisu, vajalikkus ja tulemus", "HÜVITATAVA KULU ARVESTUS",
    "3. Taotlus ja hüvitise saaja kinnitused", "4. Hüvitise saaja allkiri", "5. Lisad",
    "6. MTÜ kinnitus ja finantsjuhi allkiri", "KA-6559A6AD / 08.09.2026",
    "Jüri Põld", "juri@example.test", "Õpilaste töötuba õ ä ö ü š ž", "08.09.2026 — Jõhvi",
    "Näide OÜ — Töötoa materjalid", "07.09.2026", "TŠ-123", "12,35 €", "0,00 €",
    "tšekk.pdf", "Egor Stepanov", "finantsjuht", "Allkirjastatakse digitaalselt", "Digitaalallkirja ajatempel"
  ]) assert.ok(html.includes(text), `Missing preview content: ${text}`);
  assert.doesNotMatch(html, /Saved recipient|Allkirjastamata|KA-6559A6AD\.docx/);
  assert.equal((html.match(/class="staff-expense-page"/g) || []).length, 2);
  assert.match(html, /Eelvaate osa 1 \/ 2/);
  assert.match(html, /Eelvaate osa 2 \/ 2/);
  assert.doesNotMatch(html, /Lehekülg \d \/ 2/);
  assert.match(html, /lang="et"/);
});

test("preview preserves gross, requested, excluded and foreign-currency amounts from saved aliases", () => {
  const data = validateSubmissionData("expense", expense({
    necessity: "Eraldi põhjendus.", participants: "18 noort ja 2 juhendajat.",
    claimantRole: "Vabatahtlik", expenseCategory: "Materjalid", fundingSource: "Tegevuseelarve",
    period: "September 2026", route: "Narva–Jõhvi", iban: "EE101010101010101010",
    items: [{ date: "2026-09-07", sourceDocument: "receipt.pdf", provider: "Example Oy",
      description: "Supplies", currency: "USD", originalTotal: 100, totalEUR: 92,
      requestedEUR: 90, ineligibleEUR: 1, previouslyReimbursedEUR: 1 }]
  }), { final: true });
  const html = renderExpensePreview(data);
  for (const value of ["100 USD / 92,00 €", "90,00 €", "2,00 €", "receipt.pdf",
    "Eraldi põhjendus.", "18 noort ja 2 juhendajat.", "Vabatahtlik", "Materjalid",
    "Tegevuseelarve", "September 2026", "Narva–Jõhvi", "EE101010101010101010"]
  ) assert.ok(html.includes(value), `Missing saved value: ${value}`);
  assert.doesNotMatch(html, /Kulu toetas noorte osalust\./);
});

test("optional expense drafts remain previewable while invalid amounts are rejected", () => {
  for (const draft of [{}, { items: [{}] }, { project: "Pooleli", items: [] }]) {
    const html = renderExpensePreview(draft);
    assert.match(html, /Lisad puuduvad/);
    assert.match(html, /0,00 €/);
    assert.match(html, /Digitaalallkirja ajatempel/);
    assert.doesNotMatch(html, /undefined|NaN|\{#|\{\//);
  }
  assert.throws(() => renderExpensePreview(expense({ items: [{ amount: -1 }] })),
    { code: "DOCUMENT_VALIDATION_ERROR" });
});

test("expense preview escapes user text, retains line breaks and keeps saved signature values", () => {
  const html = renderExpensePreview(expense({
    activity: '<img src=x onerror="alert(1)">\nÕppetöö jätkub.',
    signatureStatus: "Digitaalselt allkirjastatud", signatureDate: "2026-09-09",
    attachments: [{ name: '<script>alert("x")</script>.pdf' }]
  }));
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;\nÕppetöö jätkub\./);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;\.pdf/);
  assert.match(html, /Digitaalselt allkirjastatud/);
  assert.match(html, /09\.09\.2026/);
  assert.doesNotMatch(html, /<script>|<img src=x/);
});

test("expense dispatch retains downloadable attachments outside the canonical document preview", () => {
  globalThis.window = { I18N: { t: (key) => key, locale: () => "et-EE" } };
  try {
    const html = renderSubmissionPreview("expense", expense(), {
      attachments: [{ id: "receipt-1", name: "proof.pdf", mimeType: "application/pdf", size: 42 }]
    });
    assert.match(html, /5\. Lisad/);
    assert.match(html, /proof\.pdf/);
    assert.match(html, /href="\/api\/staff\/attachments\/receipt-1\/download"/);
  } finally {
    delete globalThis.window;
  }
});

test("preview metadata uses approved recipient and submission id without mutating saved data", async () => {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const helper = source.slice(source.indexOf("function documentPreviewOptions("), source.indexOf("function renderPreview("));
  assert.ok(helper.startsWith("function documentPreviewOptions("));
  const data = expense({ reimbursementRecipientEmail: "recipient@example.test" });
  const submission = { id: "saved-submission", reimbursementRecipientEmail: "recipient@example.test",
    reimbursementRecipientName: "Old name", creatorEmail: "creator@example.test", creatorName: "Creator" };
  const state = { current: submission, editingId: submission.id,
    session: { reimbursementRecipients: [{ email: "recipient@example.test", name: "Approved current name" }] } };
  const before = JSON.stringify(data);
  const options = vm.runInNewContext(`${helper}\ndocumentPreviewOptions("expense", data, []);`, { state, data });
  assert.equal(options.submission.id, submission.id);
  assert.equal(options.reimbursementRecipient.name, "Approved current name");
  assert.equal(options.reimbursementRecipient.email, "recipient@example.test");
  assert.equal(JSON.stringify(data), before);

  state.current = { id: "legacy", creatorEmail: "creator@example.test", creatorName: "Creator" };
  delete data.reimbursementRecipientEmail;
  const legacy = vm.runInNewContext(`${helper}\ndocumentPreviewOptions("expense", data, []);`, { state, data });
  assert.equal(legacy.reimbursementRecipient.name, "Creator");
  assert.equal(legacy.reimbursementRecipient.email, "creator@example.test");
});

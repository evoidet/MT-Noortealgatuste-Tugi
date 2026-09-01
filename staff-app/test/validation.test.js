import assert from "node:assert/strict";
import test from "node:test";

import { validateSubmissionData } from "../src/validation.js";

function captureValidationError(work, expectedCode) {
  let captured;
  assert.throws(work, (error) => {
    captured = error;
    return error?.code === expectedCode;
  });
  return captured;
}

function validExpense(overrides = {}) {
  return {
    project: "Noorte arengupäev",
    person: "Mari Maasikas",
    date: "2026-08-29",
    location: "Narva",
    activity: "Korraldasin noortele töötoa.",
    purpose: "Kulu oli vajalik töötoa läbiviimiseks.",
    result: "Töötoas osales 18 noort.",
    items: [
      {
        date: "2026-08-28",
        documentNumber: "TSEKK-1",
        vendor: "Näide OÜ",
        description: "Töötoa materjalid",
        amount: 12.345,
      },
    ],
    ...overrides,
  };
}

function validInvoice(overrides = {}) {
  return {
    invoiceNumber: "2026-099",
    invoiceDate: "2026-08-29",
    dueDate: "2026-09-12",
    currency: "EUR",
    project: "Noorte arengupäev",
    client: "OÜ Ostja",
    registrationCode: "11223344",
    address: "Pargi 5, Narva",
    items: [
      {
        description: "Töötuba",
        quantity: 2,
        unit: "päev",
        unitPrice: 12.5,
      },
    ],
    ...overrides,
  };
}

test("final expense validation accepts current UI fields and recalculates totals", () => {
  const result = validateSubmissionData("expense", {
    ...validExpense(),
    amount: 999_999,
    requestedTotalEUR: 999_999,
  }, { final: true });

  assert.equal(result.goal, result.purpose);
  assert.equal(result.items[0].provider, "Näide OÜ");
  assert.equal(result.items[0].sourceDocumentNumber, "TSEKK-1");
  assert.equal(result.items[0].totalEUR, 12.35);
  assert.equal(result.items[0].requestedEUR, 12.35);
  assert.equal(Object.hasOwn(result.items[0], "originalTotal"), false);
  assert.equal(result.amount, 12.35);
  assert.equal(result.requestedTotalEUR, 12.35);
});

test("final expense validation reports every incomplete line-item field", () => {
  const error = captureValidationError(
    () => validateSubmissionData("expense", validExpense({ items: [{}] }), { final: true }),
    "INCOMPLETE_SUBMISSION",
  );

  const fields = new Set(error.fields);
  for (const field of [
    "items.0.date",
    "items.0.documentNumber",
    "items.0.vendor",
    "items.0.description",
    "items.0.amount",
    "amount",
  ]) {
    assert.ok(fields.has(field), `Expected missing field: ${field}`);
  }
});

test("final expense validation rejects a zero reimbursement amount", () => {
  const error = captureValidationError(
    () => validateSubmissionData("expense", validExpense({
      items: [{
        date: "2026-08-28",
        documentNumber: "TSEKK-1",
        vendor: "Näide OÜ",
        description: "Töötoa materjalid",
        amount: 0,
      }],
    }), { final: true }),
    "INCOMPLETE_SUBMISSION",
  );
  assert.ok(error.fields.includes("items.0.amount"));
  assert.ok(error.fields.includes("amount"));
});

test("calendar-invalid dates are rejected before final workflow validation", () => {
  const expenseError = captureValidationError(
    () => validateSubmissionData("expense", validExpense({ date: "2026-02-30" }), { final: true }),
    "VALIDATION_ERROR",
  );
  assert.ok(expenseError.issues.some((issue) => issue.path === "date"));

  const invoiceError = captureValidationError(
    () => validateSubmissionData("invoice", validInvoice({ dueDate: "2026-13-01" }), { final: true }),
    "VALIDATION_ERROR",
  );
  assert.ok(invoiceError.issues.some((issue) => issue.path === "dueDate"));
});

test("final invoice validation accepts current UI fields and recalculates totals", () => {
  const result = validateSubmissionData("invoice", {
    ...validInvoice(),
    amount: 999_999,
  }, { final: true });

  assert.equal(result.registryCode, "11223344");
  assert.equal(result.items[0].amount, 25);
  assert.equal(result.items[0].total, 25);
  assert.equal(result.amount, 25);
});

test("final invoice validation requires document, buyer and line-item data", () => {
  const error = captureValidationError(
    () => validateSubmissionData("invoice", {
      invoiceDate: "2026-08-29",
      dueDate: "2026-09-12",
      items: [{ quantity: 1, unitPrice: 0 }],
    }, { final: true }),
    "INCOMPLETE_SUBMISSION",
  );

  const fields = new Set(error.fields);
  for (const field of [
    "invoiceNumber",
    "client",
    "registrationCode",
    "address",
    "project",
    "items.0.description",
    "items.0.unitPrice",
    "amount",
  ]) {
    assert.ok(fields.has(field), `Expected missing field: ${field}`);
  }
});

test("final invoice validation rejects a due date before the invoice date", () => {
  const error = captureValidationError(
    () => validateSubmissionData("invoice", validInvoice({ dueDate: "2026-08-28" }), { final: true }),
    "INCOMPLETE_SUBMISSION",
  );
  assert.ok(error.fields.includes("dueDate"));
});

test("final news validation normalizes paragraphs and requires publishable content", () => {
  const result = validateSubmissionData("news", {
    slug: "noorte-arengupaev",
    title: "Noorte arengupäev",
    date: "2026-08-29",
    summary: "Lühikokkuvõte",
    content: "Esimene lõik.\n\nTeine lõik.",
    author: "Mari Maasikas",
  }, { final: true });
  assert.deepEqual(result.content, ["Esimene lõik.", "Teine lõik."]);

  const error = captureValidationError(
    () => validateSubmissionData("news", { title: "Pealkiri" }, { final: true }),
    "INCOMPLETE_SUBMISSION",
  );
  assert.deepEqual(new Set(error.fields), new Set(["slug", "date", "summary", "content", "author"]));
});

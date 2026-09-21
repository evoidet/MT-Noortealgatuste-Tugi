import assert from "node:assert/strict";
import test from "node:test";

test("money and quantities reject booleans, arrays and objects instead of coercing them", () => {
  for (const value of [true, false, [], [1], {}]) {
    for (const data of [{ amount: value }, { items: [{ quantity: value }] }, { items: [{ unitPrice: value }] }]) {
      assert.throws(() => validateSubmissionData("invoice", data), { code: "VALIDATION_ERROR" });
    }
    assert.throws(() => validateSubmissionData("expense", { amount: value }), { code: "VALIDATION_ERROR" });
  }
  assert.equal(validateSubmissionData("invoice", { amount: "12.35" }).amount, 12.35);
});

import { validateSubmissionData } from "../src/validation.js";

test("long news paragraphs and string input remain valid after persistence", () => {
  for (const text of ["õ".repeat(8_000), "A paragraph.\n\n".repeat(59).trim()]) {
    const saved = validateSubmissionData("news", { title: "Long article", content: text });
    assert.deepEqual(validateSubmissionData("news", saved, { final: true }), saved);
    assert.equal(saved.content.join("\n\n"), text);
  }
  for (const content of ["x".repeat(30_001), ["x".repeat(16_000), "y".repeat(16_000)], "x\n\n".repeat(61)]) {
    assert.throws(() => validateSubmissionData("news", { title: "Too long", content }), { code: "VALIDATION_ERROR" });
  }
});

test("calculated financial totals stay within the persisted monetary bounds", () => {
  assert.throws(() => validateSubmissionData("invoice", { items: [{ quantity: 2, unitPrice: 10_000_000 }] }), { code: "VALIDATION_ERROR" });
  assert.throws(() => validateSubmissionData("expense", { items: [{ amount: 6_000_000 }, { amount: 6_000_000 }] }), { code: "VALIDATION_ERROR" });
  const saved = validateSubmissionData("invoice", { items: [{ quantity: 2, unitPrice: 12.35 }] });
  assert.deepEqual(validateSubmissionData("invoice", saved), saved);
});

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
  assert.deepEqual(new Set(error.fields), new Set(["content"]));
});

test("news registration URL is optional in drafts and requires HTTPS on publish", () => {
  assert.equal(validateSubmissionData("news", {}).registrationUrl, "");
  assert.equal(
    validateSubmissionData("news", { registrationUrl: "https://example.org/register" }).registrationUrl,
    "https://example.org/register",
  );
  assert.equal(validateSubmissionData("news", { registrationUrl: "not a URL" }).registrationUrl, "not a URL");
  for (const registrationUrl of ["http://example.org/register", "ftp://example.org/register", "not a URL"]) {
    captureValidationError(() => validateSubmissionData("news", {
      title: "Title", content: ["Body"], registrationUrl
    }, { final: true }), "VALIDATION_ERROR");
  }
});

test("optional news URLs normalize before validation and accept Google Forms links", () => {
  for (const empty of [undefined, null, "", "   \t\n"]) {
    const result = validateSubmissionData("news", {
      title: "Title", content: ["Body"], registrationUrl: empty, image: empty
    }, { final: true });
    assert.equal(result.registrationUrl, "");
    assert.equal(result.image, "");
  }
  for (const registrationUrl of [
    "https://forms.gle/XXXXXXXX",
    "https://docs.google.com/forms/d/e/XXXXXXXX/viewform",
    "https://example.org/register?event=123"
  ]) {
    const result = validateSubmissionData("news", {
      title: "Title", content: ["Body"], registrationUrl: `  ${registrationUrl}  `
    }, { final: true });
    assert.equal(result.registrationUrl, registrationUrl);
    assert.equal(validateSubmissionData("news", result, { final: true }).registrationUrl, registrationUrl);
  }
  const image = `https://example.org/image.png?version=${"a".repeat(600)}`;
  assert.equal(validateSubmissionData("news", { image: ` ${image} ` }).image, image);
  assert.equal(validateSubmissionData("news", { image: " /assets/news/photo.png " }).image, "/assets/news/photo.png");
});

test("news URL validation reports every invalid URL field with a safe specific message", () => {
  for (const [field, message] of [
    ["registrationUrl", "Registration URL is invalid."], ["image", "Image URL is invalid."]
  ]) {
    for (const value of ["not a URL", "javascript:alert(1)", "https://user:password@example.org/", true,
      `https://example.org/${"a".repeat(2_048)}`]) {
      const error = captureValidationError(() => validateSubmissionData("news", {
        title: "Title", content: ["Body"], [field]: value
      }, { final: true }), "VALIDATION_ERROR");
      assert.ok(error.issues.length);
      for (const issue of error.issues) {
        assert.equal(issue.path, field);
        assert.equal(issue.message, message);
      }
      assert.equal(JSON.stringify(error.issues).includes("password"), false);
    }
  }
  const error = captureValidationError(() => validateSubmissionData("news", {
    title: "Title", content: ["Body"], registrationUrl: "bad registration", image: "bad image"
  }, { final: true }), "VALIDATION_ERROR");
  assert.deepEqual(error.issues.map(({ path, message }) => ({ path, message })), [
    { path: "registrationUrl", message: "Registration URL is invalid." },
    { path: "image", message: "Image URL is invalid." }
  ]);
});

test("news drafts preserve incomplete links while publication validates exact rows", () => {
  const draft = validateSubmissionData("news", {
    slug: "Temporary Slug", links: [{ label: "", url: "not ready" }]
  });
  assert.equal(draft.slug, "Temporary Slug");
  assert.deepEqual(draft.links, [{ label: "", url: "not ready" }]);

  const error = captureValidationError(() => validateSubmissionData("news", {
    title: "Title", content: ["Body"], links: [
      { label: "", url: "https://example.org" },
      { label: "Rohkem infot", url: "javascript:alert(1)" }
    ]
  }, { final: true }), "VALIDATION_ERROR");
  assert.deepEqual(error.issues.map(({ path, message }) => ({ path, message })), [
    { path: "links.0.label", message: "Please enter link text." },
    { path: "links.1.url", message: "Please enter a valid HTTPS URL." }
  ]);
});

test("news publication trims, deduplicates, and supports normal HTTPS action links", () => {
  const links = [
    { label: " Registreeru ", url: " https://forms.gle/example " },
    { label: "Duplicate", url: "https://forms.gle/example" },
    { label: "Programm", url: "https://docs.google.com/forms/d/e/example/viewform" },
    { label: "Rohkem infot", url: "https://drive.google.com/file/d/example/view" },
    { label: "Koduleht", url: "https://noortetugi.ee/uudised.html" }
  ];
  const result = validateSubmissionData("news", { title: "Title", content: ["Body"], links }, { final: true });
  assert.equal(result.links.length, 4);
  assert.deepEqual(result.links[0], { label: "Registreeru", url: "https://forms.gle/example" });
});


test("news needs only title and body; optional values normalize without generating summary", () => {
  for (const empty of [undefined, "", null]) {
    const result = validateSubmissionData("news", {
      title: "Õhtu õ ä ö ü š ž", content: "Esimene lõik.\n\nTeine \"tsitaat\" ja apostroof ' .",
      summary: empty, excerpt: empty, slug: empty, date: empty, category: empty,
      author: empty, authorRole: empty, project: empty, registrationUrl: empty,
      image: empty, imageAlt: empty, imagePosition: empty, imageFit: empty,
      translations: empty, mainImageAttachmentId: empty, additionalImageAttachmentIds: empty
    }, { final: true });
    assert.equal(result.summary, "");
    assert.equal(result.author, "");
    assert.equal(result.content.length, 2);
    assert.equal(result.category, "events");
  }
  for (const data of [{ content: ["Body"] }, { title: "Title", content: "   " }]) {
    assert.throws(() => validateSubmissionData("news", data, { final: true }), { code: "INCOMPLETE_SUBMISSION" });
  }
});

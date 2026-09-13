import assert from "node:assert/strict";
import test from "node:test";

import PizZip from "pizzip";

import {
  DOCX_CONTENT_TYPE,
  DocumentValidationError,
  generateExpenseReportDocument,
  generateInvoiceDocument,
  generateSubmissionDocument,
} from "../src/documents.js";
import { validateSubmissionData } from "../src/validation.js";

const FORBIDDEN_INVOICE_TEXT = ["TÄITMISE ABI", "KUSTUTA ENNE SAATMIST", "AAAA-JRK"];
const FORBIDDEN_EXPENSE_TEXT = [
  "NÄIDISDOKUMENT",
  "TÄITMISE JUHIS",
  "Kuluarvestuse reeglid",
  "Sisesta",
  "Näiteks",
  "Kirjuta täpne",
  "MTÜ PÄDEVA ORGANI OTSUS",
  "KES VÕTAB OTSUSE VASTU",
  "ENNE MAKSET KONTROLLI",
  "Kontrollitud allikad",
  "Dokumendimall",
];

function documentParts(buffer) {
  const zip = new PizZip(buffer);
  const names = Object.keys(zip.files).filter((name) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(name));
  return {
    zip,
    xml: names.map((name) => zip.file(name).asText()).join("\n"),
    documentXml: zip.file("word/document.xml").asText(),
  };
}

function decodeXmlText(xml) {
  return xml
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function assertForbiddenAbsent(text, forbidden) {
  for (const marker of forbidden) {
    assert.equal(text.includes(marker), false, `Unexpected template guidance in output: ${marker}`);
  }
}

function expenseData(overrides = {}) {
  return {
    documentNumber: "KA-QA-2026",
    documentDate: "2026-09-12",
    recipientName: "Õie Testkasutaja",
    activityName: "Õppepäev",
    whereWhen: "12.09.2026 Jõhvis",
    activitiesAndRole: "Juhendasin töötuba.",
    necessity: "Materjalid olid õppepäevaks vajalikud.",
    result: "Õppepäev toimus.",
    items: [{ description: "Õppematerjalid", date: "2026-09-11", documentReference: "QA-1", grossAmount: 12.75 }],
    ...overrides,
  };
}

function assertFinanceConfirmation(text, requestedTotal) {
  assert.ok(text.includes("6. MTÜ kinnitus ja finantsjuhi allkiri"));
  assert.ok(text.includes(`Kinnitan esitatud kuluaruande kontrollimise ja taotletud ${requestedTotal} hüvitamise.`));
  const financeText = text.slice(text.indexOf("6. MTÜ kinnitus ja finantsjuhi allkiri"));
  for (const expected of ["Egor Stepanov", "finantsjuht", "Allkirjastatakse digitaalselt", "Digitaalallkirja ajatempel"]) {
    assert.ok(financeText.includes(expected), `Finance signature is missing: ${expected}`);
  }
  assert.ok(financeText.includes("Käesolev dokument allkirjastatakse digitaalselt ning jõustub pärast viimase nõutava digitaalallkirja andmist."));
  assert.ok(financeText.includes("Allkirjastamise kuupäev ja kellaaeg tulenevad digitaalallkirja ajatemplist."));
}

test("invoice output preserves the branded template and recalculates all totals", async () => {
  const result = await generateInvoiceDocument({
    invoiceNumber: "2026-099",
    invoiceDate: "2026-08-29",
    dueDate: "2026-09-12",
    transactionTime: "29.08.2026",
    projectReference: "PROJEKT & LEPING",
    buyer: {
      name: "OÜ Näide <turvaline>",
      registryCode: "11223344",
      address: "Pargi 5, Narva",
      contact: "Anne Õun",
    },
    items: [
      { description: "Töötuba", quantity: 2, unit: "päev", unitPrice: 12.5, lineTotal: 999_999 },
      { description: "Materjal", quantity: 1, unit: "tk", unitPrice: 5.25 },
    ],
    subtotal: 999_999,
    total: 999_999,
    referenceNumber: "20260990",
  });

  assert.equal(result.filename, "arve-2026-099.docx");
  assert.equal(result.contentType, DOCX_CONTENT_TYPE);
  assert.ok(Buffer.isBuffer(result.buffer));
  const { zip, xml, documentXml } = documentParts(result.buffer);
  const text = decodeXmlText(xml);

  assert.match(text, /OÜ Näide <turvaline>/);
  assert.match(text, /PROJEKT & LEPING/);
  assert.match(text, /25,00 €/);
  assert.match(text, /5,25 €/);
  assert.match(text, /30,25 €/);
  assert.equal(text.includes("999 999"), false, "client-computed totals leaked into the invoice");
  assertForbiddenAbsent(text, FORBIDDEN_INVOICE_TEXT);
  assert.equal((documentXml.match(/<w:sectPr\b/g) || []).length, 1, "sample cover section was not removed");
  assert.ok(Object.keys(zip.files).some((name) => /^word\/media\//.test(name)), "source logo is missing");
  assert.equal(documentXml.includes("{invoiceNumber}"), false);
  assert.equal(documentXml.includes("<turvaline>"), false, "plain text was inserted as raw XML");
});

test("expense output contains actual values and attachments but no sample instructions or decision page", async () => {
  const result = await generateExpenseReportDocument({
    documentNumber: "KA-2026-099",
    documentDate: "2026-08-29",
    recipient: {
      name: "Jüri Põld",
      role: "vabatahtlik",
      email: "juri@example.ee",
      accountHolder: "Jüri Põld",
      iban: "EE101010101010101010",
    },
    activityName: "Noorte arengupäev",
    expenseType: "transport ja materjalid",
    locationPeriodRoute: "Narva–Jõhvi–Narva, 28.08.2026",
    fundingSource: "Tegevuseelarve 2026",
    whereWhen: "28.08.2026 Jõhvis.",
    activitiesAndRole: "Juhendasin rühmatööd ja korraldasin osalejate transporti.",
    necessity: "Kulu oli vajalik MTÜ noortele suunatud tegevuse läbiviimiseks.",
    result: "Osales 18 noort ja valmis tegevuskava.",
    participants: "18 noort ja kaks vabatahtlikku.",
    items: [
      {
        description: "Bussipiletid",
        date: "2026-08-28",
        documentReference: "pilet.pdf",
        grossAmount: 40,
        requestedAmount: 35,
        excludedAmount: 5,
      },
      {
        description: "Materjalid",
        date: "2026-08-28",
        documentReference: "tsekk.jpg",
        grossAmount: 10.2,
      },
    ],
    attachments: [{ originalName: "pilet.pdf" }, { fileName: "tsekk.jpg" }],
    requestedTotal: 999_999,
    signatureStatus: "Digitaalselt allkirjastatud",
    signatureDate: "2026-08-29",
  });

  assert.equal(result.filename, "kuluaruanne-KA-2026-099.docx");
  assert.equal(result.contentType, DOCX_CONTENT_TYPE);
  const { xml, documentXml } = documentParts(result.buffer);
  const text = decodeXmlText(xml);

  for (const expected of [
    "Jüri Põld",
    "Noorte arengupäev",
    "Bussipiletid",
    "Materjalid",
    "50,20 €",
    "45,20 €",
    "5,00 €",
    "pilet.pdf",
    "tsekk.jpg",
    "Lehekülg",
  ]) {
    assert.ok(text.includes(expected), `Expected value missing: ${expected}`);
  }
  assert.equal(text.includes("999 999"), false, "client-computed requested total leaked into the report");
  assertFinanceConfirmation(text, "45,20 €");
  assert.ok(text.includes("kulud kokku 45,20 € arvelduskontole EE101010101010101010."));
  const applicantSignature = text.slice(text.indexOf("4. Hüvitise saaja allkiri"), text.indexOf("5. Lisad"));
  assert.ok(applicantSignature.includes("Digitaalselt allkirjastatud"));
  assert.ok(applicantSignature.includes("29.08.2026"));
  assertForbiddenAbsent(text, FORBIDDEN_EXPENSE_TEXT);
  assert.equal(documentXml.includes("2F75B5"), false, "blue italic example styling remained in body values");
  assert.equal(documentXml.includes("{#items}"), false);
  assert.equal(documentXml.includes("{/attachments}"), false);
});

test("current UI expense data remains generator-valid after final normalization", async () => {
  const normalized = validateSubmissionData("expense", {
    project: "Noorte arengupäev",
    person: "Mari Maasikas",
    date: "2026-08-29",
    location: "Narva",
    activity: "Korraldasin noortele töötoa.",
    purpose: "Kulu oli töötoa läbiviimiseks vajalik.",
    result: "Töötoas osales 18 noort.",
    items: [{
      date: "2026-08-28",
      documentNumber: "TSEKK-1",
      vendor: "Näide OÜ",
      description: "Töötoa materjalid",
      amount: 12.345,
      // Existing production drafts can contain these former schema defaults.
      originalTotal: 0,
      totalEUR: 0,
    }],
  }, { final: true });

  assert.equal(normalized.items[0].totalEUR, 12.35);
  assert.equal(normalized.items[0].requestedEUR, 12.35);
  const result = await generateExpenseReportDocument(normalized, {
    submission: { id: "60a25fad-becd-4942-b0f6-979f71bb9960" },
    attachments: [{ originalName: "tsekk.pdf" }],
    reimbursementRecipient: { name: "Sofia Germ", email: "sofia@noortetugi.ee" },
  });
  assert.ok(result.buffer.length > 0);
  const text = decodeXmlText(documentParts(result.buffer).xml);
  assert.match(text, /12,35 €/);
  assert.match(text, /Sofia Germ/);
  assert.match(text, /sofia@noortetugi\.ee/);
  assert.doesNotMatch(text, /Mari Maasikas/);
});

test("accepted foreign-currency and reimbursement aliases render consistently", async () => {
  const normalized = validateSubmissionData("expense", {
    project: "Rahvusvaheline noortekohtumine",
    person: "Mari Maasikas",
    date: "2026-08-29",
    location: "Helsingi",
    activity: "Korraldasin kohtumise.",
    purpose: "Kulu oli vajalik osalemiseks.",
    result: "Kohtumine toimus edukalt.",
    items: [{
      date: "2026-08-28",
      sourceDocument: "receipt.pdf",
      vendor: "Example Oy",
      description: "Materjalid",
      currency: "USD",
      originalTotal: 100,
      totalEUR: 92,
      requestedEUR: 90,
      ineligibleEUR: 1,
      previouslyReimbursedEUR: 1,
    }],
  }, { final: true });

  const result = await generateExpenseReportDocument(normalized);
  const text = decodeXmlText(documentParts(result.buffer).xml);
  assert.match(text, /100 USD \/ 92,00 €/);
  assert.match(text, /90,00 €/);
  assert.match(text, /2,00 €/);
  assert.match(text, /receipt\.pdf/);
  assertFinanceConfirmation(text, "90,00 €");
});

test("new expense signature blocks use digital signing placeholders without implying an approval date", async () => {
  const result = await generateExpenseReportDocument(expenseData({
    recipientRole: "",
    contactAccountIban: "",
    expenseType: null,
    locationPeriodRoute: "",
    fundingSource: "",
    participants: "",
    iban: "",
    attachments: [],
    signatureStatus: "",
    signatureDate: "",
  }));
  const { xml, documentXml } = documentParts(result.buffer);
  const text = decodeXmlText(xml);
  assertFinanceConfirmation(text, "12,75 €");
  assert.equal(text.split("Allkirjastatakse digitaalselt").length - 1, 2);
  assert.equal(text.split("Digitaalallkirja ajatempel").length - 1, 2);
  const applicantSignature = text.slice(text.indexOf("4. Hüvitise saaja allkiri"), text.indexOf("5. Lisad"));
  assert.ok(applicantSignature.includes("Õie Testkasutaja"));
  assert.ok(applicantSignature.includes("Digitaalallkirja ajatempel"));
  assert.equal(applicantSignature.includes("12.09.2026"), false, "document date must not stand in for a signing date");
  assert.ok(text.includes("Lisad puuduvad"));
  assert.ok(text.includes("arvelduskontole —."));
  assert.doesNotMatch(text, /undefined|null|\{[\/#]?[A-Za-z][A-Za-z0-9]*\}/);
  assert.equal((documentXml.match(/<w:sectPr\b/g) || []).length, 1);
});

test("expense generation preserves every mapped value and safely escapes Estonian and XML characters", async () => {
  const result = await generateExpenseReportDocument(expenseData({
    documentNumber: "KA-ÕÄÖÜŠŽ",
    documentDate: "2026-09-03",
    recipient: {
      name: 'Õie Ääre <õ ä ö ü š ž> & "test"',
      role: "Töötoa juhendaja & osaleja",
      email: "qa@example.invalid",
      phone: "+372 000 0000",
      accountHolder: "Õie Ääre",
      iban: "EE000000000000000000",
    },
    activityName: "Õppimine <üheskoos> & sõprus",
    expenseType: "Töövahendid ja söök",
    locationPeriodRoute: "Jõhvi–Võru, 01.–03.09.2026",
    fundingSource: "Sünteetiline QA eelarverida",
    whereWhen: "01.09.2026\r\nJõhvi õppehoones",
    activitiesAndRole: "Juhendasin rühmatööd & selgitasin <eesmärke>.",
    necessity: "Töövahendid võimaldasid osaleda kõigil.",
    result: "Õppijad lõid ühise näituse: õ ä ö ü š ž.",
    participants: "Kümme õppijat ja üks juhendaja.",
    items: [{
      provider: "Žürii & Õppimine OÜ",
      description: "Paber <A4> & värvid",
      expenseDate: "2026-09-01",
      sourceDocumentNumber: "ÕÄÖÜŠŽ-01",
      grossAmount: 24.6,
      requestedAmount: 22.35,
      excludedAmount: 2.25,
    }],
    attachments: ["õäöüšž <alus> & makse.pdf", { name: "töötoa-tšekk.png" }],
  }));
  const { xml, documentXml } = documentParts(result.buffer);
  const text = decodeXmlText(xml);
  for (const expected of [
    "KA-ÕÄÖÜŠŽ / 03.09.2026", 'Õie Ääre <õ ä ö ü š ž> & "test"',
    "Töötoa juhendaja & osaleja", "qa@example.invalid", "+372 000 0000",
    "Kontoomanik: Õie Ääre", "IBAN: EE000000000000000000",
    "Õppimine <üheskoos> & sõprus", "Töövahendid ja söök", "Jõhvi–Võru, 01.–03.09.2026",
    "Sünteetiline QA eelarverida", "01.09.2026\nJõhvi õppehoones",
    "Juhendasin rühmatööd & selgitasin <eesmärke>.", "Töövahendid võimaldasid osaleda kõigil.",
    "Õppijad lõid ühise näituse: õ ä ö ü š ž.", "Kümme õppijat ja üks juhendaja.",
    "Žürii & Õppimine OÜ — Paber <A4> & värvid", "ÕÄÖÜŠŽ-01", "01.09.2026",
    "24,60 €", "22,35 €", "2,25 €", "õäöüšž <alus> & makse.pdf", "töötoa-tšekk.png",
  ]) assert.ok(text.includes(expected), `Expected mapped value missing: ${expected}`);
  assert.ok(documentXml.includes("&lt;A4&gt; &amp; värvid"));
  assert.equal(documentXml.includes("<A4>"), false);
  assertFinanceConfirmation(text, "22,35 €");
  assertForbiddenAbsent(text, FORBIDDEN_EXPENSE_TEXT);
});

test("saved signature metadata is retained only in the applicant signature block", async () => {
  const result = await generateExpenseReportDocument(expenseData(), {
    signatureStatus: "Digitaalselt allkirjastatud",
    signatureDate: "2026-09-13",
  });
  const text = decodeXmlText(documentParts(result.buffer).xml);
  const applicantSignature = text.slice(text.indexOf("4. Hüvitise saaja allkiri"), text.indexOf("5. Lisad"));
  assert.ok(applicantSignature.includes("Digitaalselt allkirjastatud"));
  assert.ok(applicantSignature.includes("13.09.2026"));
  assert.equal(text.split("Digitaalselt allkirjastatud").length - 1, 1);
  assertFinanceConfirmation(text, "12,75 €");
});

test("supported expense aliases produce the same gross, requested and excluded totals throughout the new template", async (t) => {
  const cases = [
    { grossAmountEur: 40, requestedAmount: 32, excludedAmount: 8 },
    { grossAmount: 40, reimbursementAmount: 32, nonReimbursableAmount: 8 },
    { totalAmount: 40, requestedEUR: 32, previouslyReimbursedAmount: 8 },
    { totalEUR: 40, requestedEUR: 32, ineligibleEUR: 3, previouslyReimbursedEUR: 5 },
    { originalTotal: 40, amount: 32 },
    { currency: "USD", originalAmount: 50, grossAmountEur: 40, reimbursementAmount: 32 },
  ];
  for (const [index, amounts] of cases.entries()) {
    await t.test(`amount alias ${index + 1}`, async () => {
      const result = await generateExpenseReportDocument(expenseData({
        requestedTotal: 999_999,
        grossTotal: 999_999,
        excludedTotal: 999_999,
        items: [{ description: "Õppevahendid", date: "2026-09-11", documentReference: "QA-ALIAS", ...amounts }],
      }));
      const text = decodeXmlText(documentParts(result.buffer).xml);
      assert.ok(text.includes("40,00 €"));
      assert.ok(text.includes("8,00 €"));
      assert.ok(text.includes("kulud kokku 32,00 € arvelduskontole"));
      assertFinanceConfirmation(text, "32,00 €");
      assert.equal(text.includes("999 999"), false);
      if (amounts.currency) assert.ok(text.includes("50 USD / 40,00 €"));
    });
  }
});

test("maximum supported expense field lengths and fifty rows survive validation and DOCX rendering", async () => {
  const longText = (prefix, length) => `${prefix} ${"õäöüšž & <tekst> ".repeat(length)}`.slice(0, length - 1) + "X";
  const normalized = validateSubmissionData("expense", {
    documentNumber: "K".repeat(100),
    documentDate: "2026-09-12",
    project: longText("Projekt", 240),
    person: longText("Nimi", 200),
    claimantRole: longText("Roll", 160),
    date: "2026-09-12",
    location: longText("Koht", 500),
    period: longText("Periood", 240),
    route: longText("Marsruut", 500),
    activity: longText("Tegevus", 4_000),
    purpose: longText("Vajadus", 4_000),
    result: longText("Tulemus", 4_000),
    participants: longText("Osalejad", 2_000),
    whereWhen: longText("KusJaMillal", 2_000),
    expenseCategory: longText("Kululiik", 240),
    fundingSource: longText("Rahastus", 240),
    accountHolder: longText("Kontoomanik", 200),
    phone: "+" + "0".repeat(59),
    iban: "EE" + "0".repeat(32),
    items: Array.from({ length: 50 }, (_, index) => ({
      date: "2026-09-11",
      sourceDocument: longText(`Alus${index + 1}`, 240),
      vendor: longText(`Hankija${index + 1}`, 240),
      description: longText(`Kirjeldus${index + 1}`, 500),
      totalEUR: 12.75,
      requestedEUR: 10.5,
      ineligibleEUR: 2.25,
    })),
  }, { final: true });
  const attachment = longText("õäöüšž tõend", 251) + ".pdf";
  const result = await generateExpenseReportDocument(normalized, { attachments: [attachment] });
  const { xml, documentXml } = documentParts(result.buffer);
  const text = decodeXmlText(xml);
  for (const value of [
    normalized.documentNumber, normalized.project, normalized.person, normalized.claimantRole,
    normalized.location, normalized.period, normalized.route, normalized.activity, normalized.purpose,
    normalized.result, normalized.participants, normalized.whereWhen, normalized.expenseCategory,
    normalized.fundingSource, normalized.accountHolder, normalized.phone, normalized.iban, attachment,
    ...normalized.items.flatMap((item) => [item.vendor, item.description, item.sourceDocument]),
  ]) assert.ok(text.includes(value), `Long value missing: ${value.slice(0, 25)} (${value.length} chars)`);
  assertFinanceConfirmation(text, "525,00 €");
  assert.ok(text.includes("637,50 €"));
  assert.ok(text.includes("112,50 €"));
  assert.doesNotMatch(documentXml, /\{[#/]?(?:items|attachments|requestedTotal|financeApproverName)\}/);
  assert.equal(documentXml.includes("<tekst>"), false);
});

test("dispatch accepts Estonian and English type names", async () => {
  const invoiceData = {
    invoiceNumber: "2026-001",
    invoiceDate: "2026-08-29",
    dueDate: "2026-09-01",
    buyerName: "OÜ Ostja",
    items: [{ description: "Teenus", quantity: 1, unitPrice: 1 }],
  };
  const [estonian, english] = await Promise.all([
    generateSubmissionDocument("arve", invoiceData),
    generateSubmissionDocument("invoice", invoiceData),
  ]);
  assert.equal(estonian.filename, english.filename);
  await assert.rejects(() => generateSubmissionDocument("unknown", {}), DocumentValidationError);
});

test("expense generator rejects line-item totals that cannot reconcile", async () => {
  await assert.rejects(
    () =>
      generateExpenseReportDocument({
        documentNumber: "KA-1",
        documentDate: "2026-08-29",
        recipientName: "Test User",
        iban: "EE101010101010101010",
        activityName: "Test",
        whereWhen: "Test",
        activitiesAndRole: "Test",
        necessity: "Test",
        result: "Test",
        items: [
          {
            description: "Impossible cost",
            date: "2026-08-29",
            documentReference: "proof.pdf",
            grossAmount: 10,
            requestedAmount: 8,
            excludedAmount: 5,
          },
        ],
      }),
    DocumentValidationError,
  );
});

test("all supported invoice field lengths survive final validation and document generation", async () => {
  const normalized = validateSubmissionData("invoice", {
    invoiceNumber: "I".repeat(100),
    invoiceDate: "2026-08-29",
    dueDate: "2026-09-01",
    client: "OÜ Ostja",
    registrationCode: "R".repeat(100),
    address: "A".repeat(500),
    project: "P".repeat(240),
    referenceNumber: "V".repeat(100),
    transactionPeriod: "T".repeat(240),
    additionalInfo: "L".repeat(2_000),
    items: [{ description: "Teenus", quantity: 3, unit: "U".repeat(60), unitPrice: 12.345 }]
  }, { final: true });
  const result = await generateInvoiceDocument(normalized);
  const text = decodeXmlText(documentParts(result.buffer).xml);
  assert.equal(normalized.items[0].unitPrice, 12.35);
  assert.equal(normalized.amount, 37.05);
  assert.match(text, /37,05 €/);
  for (const expected of [
    normalized.invoiceNumber, normalized.registryCode, normalized.address,
    normalized.project, normalized.referenceNumber, normalized.transactionPeriod,
    normalized.additionalInfo, normalized.items[0].unit
  ]) assert.ok(text.includes(expected), `Missing supported invoice value with length ${expected.length} and prefix ${expected.slice(0, 1)}`);
});

test("supported expense role, category and period fields appear in the report", async () => {
  const normalized = validateSubmissionData("expense", {
    project: "Test project",
    person: "Test Person",
    date: "2026-08-29",
    location: "Narva",
    period: "August 2026",
    route: "Narva-Jõhvi",
    claimantRole: "Project volunteer",
    expenseCategory: "Transport costs",
    activity: "Workshop",
    purpose: "Materials",
    result: "Completed",
    items: [{ date: "2026-08-29", documentNumber: "D1", vendor: "Vendor", description: "Supplies", amount: 10 }]
  }, { final: true });
  const result = await generateExpenseReportDocument(normalized);
  const text = decodeXmlText(documentParts(result.buffer).xml);
  for (const expected of ["Project volunteer", "Transport costs", "August 2026", "Narva-Jõhvi"]) {
    assert.ok(text.includes(expected));
  }
});

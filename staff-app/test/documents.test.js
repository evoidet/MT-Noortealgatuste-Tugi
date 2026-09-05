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
  });
  assert.ok(result.buffer.length > 0);
  assert.match(decodeXmlText(documentParts(result.buffer).xml), /12,35 €/);
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

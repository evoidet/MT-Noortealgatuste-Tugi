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

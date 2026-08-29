import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { generateExpenseReportDocument, generateInvoiceDocument } from "../documents.js";

const outputDirectory = path.resolve(process.argv[2] || path.join(os.tmpdir(), "noortetugi-document-qa"));
await mkdir(outputDirectory, { recursive: true });

const invoice = await generateInvoiceDocument({
  invoiceNumber: "2026-017",
  invoiceDate: "2026-08-29",
  dueDate: "2026-09-12",
  transactionTime: "26.–28.08.2026",
  projectReference: "NT-2026 / noorte töötuba",
  buyer: {
    name: "Ida-Virumaa Noortekeskus",
    registryCode: "12345678",
    address: "Keskväljak 1, 30321 Kohtla-Järve",
    contact: "Maria Tamm, maria@example.ee",
  },
  items: [
    { description: "Noorte töötoa ettevalmistamine ja läbiviimine", quantity: 2, unit: "päev", unitPrice: 145.5 },
    { description: "Õppematerjalide komplekt", quantity: 12, unit: "tk", unitPrice: 8.25 },
  ],
  referenceNumber: "20260170",
});

const expense = await generateExpenseReportDocument(
  {
    documentNumber: "KA-2026-014",
    documentDate: "2026-08-29",
    recipient: {
      name: "Katrin Saar",
      role: "vabatahtlik projektikoordinaator",
      email: "katrin.saar@example.ee",
      phone: "+372 5555 0101",
      accountHolder: "Katrin Saar",
      iban: "EE381010220123456789",
    },
    activityName: "Ida-Virumaa noorte osaluslabor",
    expenseType: "transport ja õppematerjalid",
    locationPeriodRoute: "Narva–Kohtla-Järve–Narva, 26.–28.08.2026",
    fundingSource: "Noorte osaluse eelarverida 2026",
    whereWhen: "26.–28.08.2026 Kohtla-Järvel ja Narvas.",
    activitiesAndRole:
      "Valmistasin ette noorte osaluslabori töötoa, koordineerisin osalejate transporti ning juhendasin rühmatööd.",
    necessity:
      "Tegevus toetas MTÜ eesmärki suurendada Ida-Virumaa noorte osalust ning kulud olid töötoa läbiviimiseks vajalikud.",
    result:
      "Töötoas osales 24 noort, valmis kolm tegevuskava ja lepiti kokku kaks järelkohtumist.",
    participants: "24 noort vanuses 15–19 ning 3 vabatahtlikku juhendajat.",
    items: [
      {
        description: "Bussipiletid Narva–Kohtla-Järve–Narva",
        date: "2026-08-26",
        documentReference: "piletid-2608.pdf",
        grossAmount: 38.4,
        requestedAmount: 38.4,
      },
      {
        description: "Töötoa markerid ja märkmepaber",
        date: "2026-08-27",
        documentReference: "tsekk-8841.jpg",
        grossAmount: 26.75,
        requestedAmount: 22,
        excludedAmount: 4.75,
      },
    ],
    attachments: ["piletid-2608.pdf", "tsekk-8841.jpg", "maksekinnitus.pdf"],
    signatureStatus: "Digitaalselt allkirjastatud",
    signatureDate: "2026-08-29",
  },
  {},
);

const invoicePath = path.join(outputDirectory, invoice.filename);
const expensePath = path.join(outputDirectory, expense.filename);
await Promise.all([writeFile(invoicePath, invoice.buffer), writeFile(expensePath, expense.buffer)]);

console.log(invoicePath);
console.log(expensePath);

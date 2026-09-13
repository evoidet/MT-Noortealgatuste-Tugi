import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

import {
  DocumentValidationError, cleanText, firstDefined, formatDate, formatMoney,
  normalizeExpense, parseDecimal, toCents,
} from "../public/document-values.js";

export { DocumentValidationError } from "../public/document-values.js";

export const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = path.resolve(MODULE_DIRECTORY, "../private/templates/documents");
const TEMPLATE_PATHS = Object.freeze({
  invoice: path.join(TEMPLATE_ROOT, "arve", "arve.docx"),
  expense: path.join(TEMPLATE_ROOT, "kuluaruanne", "kuluaruanne.docx"),
});

const templateCache = new Map();

export class DocumentTemplateUnavailableError extends Error {
  constructor(kind, cause = undefined) {
    super(`The ${kind} document template is unavailable.`, { cause });
    this.name = "DocumentTemplateUnavailableError";
    this.code = "DOCUMENT_TEMPLATE_UNAVAILABLE";
    this.kind = kind;
  }
}

function formatQuantity(value) {
  const number = parseDecimal(value, { field: "item.quantity", min: 0.0001, max: 1_000_000 });
  return new Intl.NumberFormat("et-EE", { maximumFractionDigits: 4, useGrouping: false }).format(number);
}

function safeFilenamePart(value, fallback) {
  const cleaned = cleanText(value, { fallback, maxLength: 100 })
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/[. ]+$/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return cleaned || fallback;
}

async function loadTemplate(kind) {
  if (!templateCache.has(kind)) {
    const templatePath = TEMPLATE_PATHS[kind];
    if (!templatePath) {
      throw new Error(`Unknown document template kind: ${kind}`);
    }
    const pending = readFile(templatePath).catch((error) => {
      templateCache.delete(kind);
      throw new DocumentTemplateUnavailableError(kind, error);
    });
    templateCache.set(kind, pending);
  }
  const template = await templateCache.get(kind);
  return Buffer.from(template);
}

async function renderTemplate(kind, values) {
  try {
    const template = await loadTemplate(kind);
    const zip = new PizZip(template);
    const document = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => "",
      errorLogging: false,
    });
    document.render(values);
    return document.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
      mimeType: DOCX_CONTENT_TYPE,
    });
  } catch (error) {
    if (error instanceof DocumentTemplateUnavailableError) throw error;
    templateCache.delete(kind);
    throw new DocumentTemplateUnavailableError(kind, error);
  }
}

function normalizeInvoice(data = {}) {
  const buyer = data.buyer && typeof data.buyer === "object" ? data.buyer : {};
  const rawItems = firstDefined(data.items, data.lineItems);
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 100) {
    throw new DocumentValidationError("Invoice must contain between 1 and 100 line items", {
      field: "items",
      reason: "invalid_item_count",
    });
  }

  const items = rawItems.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new DocumentValidationError(`Invoice item ${index + 1} is invalid`, {
        field: `items[${index}]`,
        reason: "invalid_item",
      });
    }
    const quantityValue = firstDefined(item.quantity, item.amount, 1);
    const quantity = parseDecimal(quantityValue, {
      field: `items[${index}].quantity`,
      min: 0.0001,
      max: 1_000_000,
    });
    const unitPriceCents = toCents(firstDefined(item.unitPrice, item.price), {
      field: `items[${index}].unitPrice`,
      min: 0,
      max: 100_000_000,
    });
    const lineTotalCents = Math.round(quantity * unitPriceCents);
    return {
      number: String(index + 1),
      description: cleanText(item.description, {
        required: true,
        field: `items[${index}].description`,
        maxLength: 500,
      }),
      quantity: formatQuantity(quantityValue),
      unit: cleanText(firstDefined(item.unit, item.measurementUnit), { fallback: "tk", maxLength: 60 }),
      unitPrice: formatMoney(unitPriceCents),
      lineTotal: formatMoney(lineTotalCents),
      lineTotalCents,
    };
  });

  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const vatRate = parseDecimal(firstDefined(data.vatRate, 0), {
    field: "vatRate",
    min: 0,
    max: 100,
  });
  const vatCents = Math.round((subtotalCents * vatRate) / 100);
  const totalCents = subtotalCents + vatCents;
  const invoiceNumber = cleanText(firstDefined(data.invoiceNumber, data.number), {
    required: true,
    field: "invoiceNumber",
    maxLength: 100,
  });
  const currency = cleanText(firstDefined(data.currency, "EUR"), { maxLength: 3 }).toUpperCase();
  if (currency !== "EUR") {
    throw new DocumentValidationError("Invoice template supports EUR only", {
      field: "currency",
      reason: "unsupported_currency",
    });
  }

  return {
    values: {
      invoiceNumber,
      invoiceDate: formatDate(data.invoiceDate, { required: true, field: "invoiceDate" }),
      dueDate: formatDate(firstDefined(data.dueDate, data.paymentDueDate), { required: true, field: "dueDate" }),
      currency,
      transactionTime: cleanText(firstDefined(data.transactionTime, data.transactionPeriod, data.servicePeriod, data.transactionDate), {
        maxLength: 240,
      }),
      projectReference: cleanText(firstDefined(data.projectReference, data.contractReference, data.projectCode, data.project), {
        maxLength: 240,
      }),
      buyerName: cleanText(firstDefined(buyer.name, data.buyerName, data.clientName, data.client), {
        required: true,
        field: "buyer.name",
        maxLength: 250,
      }),
      buyerRegistryCode: cleanText(firstDefined(
        buyer.registryCode,
        data.buyerRegistryCode,
        data.registryCode,
        data.registrationCode
      ), { maxLength: 100 }),
      buyerAddress: cleanText(firstDefined(buyer.address, data.buyerAddress, data.address), { maxLength: 500 }),
      buyerContact: cleanText(firstDefined(buyer.contact, buyer.contactPerson, data.buyerContact), { maxLength: 250 }),
      items: items.map(({ lineTotalCents: _lineTotalCents, ...item }) => item),
      subtotal: formatMoney(subtotalCents),
      vatText: vatRate === 0 ? "Ei lisandu" : `${String(vatRate).replace(".", ",")}% (${formatMoney(vatCents)})`,
      total: formatMoney(totalCents),
      paymentDescription: cleanText(firstDefined(
        data.paymentDescription,
        data.additionalInfo,
        `Arve ${invoiceNumber}`
      ), { maxLength: 2_000 }),
      additionalInfo: cleanText(data.additionalInfo, { maxLength: 2_000 }),
      referenceNumber: cleanText(data.referenceNumber, { maxLength: 100 }),
    },
    invoiceNumber,
  };
}

export async function generateInvoiceDocument(data, meta = {}) {
  void meta;
  const normalized = normalizeInvoice(data);
  return {
    buffer: await renderTemplate("invoice", normalized.values),
    filename: `arve-${safeFilenamePart(normalized.invoiceNumber, "dokument")}.docx`,
    contentType: DOCX_CONTENT_TYPE,
  };
}

export async function generateExpenseReportDocument(data, meta = {}) {
  const normalized = normalizeExpense(data, meta);
  return {
    buffer: await renderTemplate("expense", normalized.values),
    filename: `kuluaruanne-${safeFilenamePart(normalized.documentNumber, "dokument")}.docx`,
    contentType: DOCX_CONTENT_TYPE,
  };
}

export async function generateSubmissionDocument(type, data, meta = {}) {
  const normalizedType = String(type || "").toLowerCase().replace(/[\s_-]/g, "");
  if (["invoice", "arve"].includes(normalizedType)) {
    return generateInvoiceDocument(data, meta);
  }
  if (["expense", "expensereport", "kulu", "kuluaruanne"].includes(normalizedType)) {
    return generateExpenseReportDocument(data, meta);
  }
  throw new DocumentValidationError(`Unsupported document type: ${type || "(empty)"}`, {
    field: "type",
    reason: "unsupported_type",
  });
}

export function getDocumentTemplateAvailability() {
  return Object.fromEntries(
    Object.entries(TEMPLATE_PATHS).map(([kind, templatePath]) => [kind, existsSync(templatePath)])
  );
}

export const __documentTestUtils = Object.freeze({
  cleanText,
  formatMoney,
  normalizeExpense,
  normalizeInvoice,
  templatePaths: TEMPLATE_PATHS,
});

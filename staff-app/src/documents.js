import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

export const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = path.resolve(MODULE_DIRECTORY, "../private/templates/documents");
const TEMPLATE_PATHS = Object.freeze({
  invoice: path.join(TEMPLATE_ROOT, "arve", "arve.docx"),
  expense: path.join(TEMPLATE_ROOT, "kuluaruanne", "kuluaruanne.docx"),
});

const templateCache = new Map();

export class DocumentValidationError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = "DocumentValidationError";
    this.code = "DOCUMENT_VALIDATION_ERROR";
    this.details = details;
  }
}

export class DocumentTemplateUnavailableError extends Error {
  constructor(kind, cause = undefined) {
    super(`The ${kind} document template is unavailable.`, { cause });
    this.name = "DocumentTemplateUnavailableError";
    this.code = "DOCUMENT_TEMPLATE_UNAVAILABLE";
    this.kind = kind;
  }
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function cleanText(value, { fallback = "—", maxLength = 2_000, required = false, field = "value" } = {}) {
  const source = value === undefined || value === null ? "" : String(value);
  const cleaned = source
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!cleaned) {
    if (required) {
      throw new DocumentValidationError(`${field} is required`, { field, reason: "required" });
    }
    return fallback;
  }

  if (cleaned.length > maxLength) {
    throw new DocumentValidationError(`${field} is too long`, { field, reason: "too_long", maxLength });
  }

  return cleaned;
}

/**
 * @param {unknown} value
 * @param {{field?: string, min?: number, max?: number, required?: boolean}} [options]
 */
function parseDecimal(value, { field, min = 0, max = 1_000_000_000, required = true } = {}) {
  if ((value === undefined || value === null || value === "") && !required) {
    return undefined;
  }
  const normalized = typeof value === "string" ? value.replace(/\s/g, "").replace(",", ".") : value;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new DocumentValidationError(`${field} must be a finite number between ${min} and ${max}`, {
      field,
      reason: "invalid_number",
      min,
      max,
    });
  }
  return number;
}

function toCents(value, options) {
  return Math.round(parseDecimal(value, options) * 100);
}

function formatMoney(cents) {
  const sign = cents < 0 ? "−" : "";
  const absolute = Math.abs(cents);
  const euros = Math.floor(absolute / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${euros},${String(absolute % 100).padStart(2, "0")} €`;
}

function formatQuantity(value) {
  const number = parseDecimal(value, { field: "item.quantity", min: 0.0001, max: 1_000_000 });
  return new Intl.NumberFormat("et-EE", { maximumFractionDigits: 4, useGrouping: false }).format(number);
}

function formatDate(value, { required = false, field = "date" } = {}) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getDate()).padStart(2, "0")}.${String(value.getMonth() + 1).padStart(2, "0")}.${value.getFullYear()}`;
  }
  const text = cleanText(value, { fallback: "—", required, field, maxLength: 80 });
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : text;
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

function normalizeExpense(data = {}, meta = {}) {
  const recipient = data.recipient && typeof data.recipient === "object" ? data.recipient : {};
  const rawItems = firstDefined(data.items, data.expenses);
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 100) {
    throw new DocumentValidationError("Expense report must contain between 1 and 100 cost items", {
      field: "items",
      reason: "invalid_item_count",
    });
  }

  const items = rawItems.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new DocumentValidationError(`Expense item ${index + 1} is invalid`, {
        field: `items[${index}]`,
        reason: "invalid_item",
      });
    }
    const grossCents = toCents(
      firstDefined(
        item.grossAmountEur,
        item.grossAmount,
        item.totalAmount,
        item.totalEUR,
        item.originalTotal,
        item.amount
      ),
      { field: `items[${index}].grossAmount`, min: 0, max: 100_000_000 },
    );
    const requestedCents = toCents(firstDefined(
      item.requestedAmount,
      item.reimbursementAmount,
      item.requestedEUR,
      item.amount,
      grossCents / 100
    ), {
      field: `items[${index}].requestedAmount`,
      min: 0,
      max: 100_000_000,
    });
    const defaultExcluded = Math.max(0, grossCents - requestedCents) / 100;
    const schemaExcluded = Number(item.ineligibleEUR || 0) + Number(item.previouslyReimbursedEUR || 0);
    const excludedCents = toCents(
      firstDefined(
        item.excludedAmount,
        item.nonReimbursableAmount,
        item.previouslyReimbursedAmount,
        schemaExcluded > 0 ? schemaExcluded : undefined,
        defaultExcluded
      ),
      { field: `items[${index}].excludedAmount`, min: 0, max: 100_000_000 },
    );
    if (requestedCents > grossCents || requestedCents + excludedCents > grossCents) {
      throw new DocumentValidationError(
        `Expense item ${index + 1} requested and excluded amounts cannot exceed its gross amount`,
        { field: `items[${index}].amount`, reason: "amount_reconciliation" },
      );
    }

    const currency = cleanText(firstDefined(item.currency, "EUR"), {
      field: `items[${index}].currency`,
      maxLength: 3,
    }).toUpperCase();
    let grossAmount = formatMoney(grossCents);
    if (currency !== "EUR") {
      const originalAmount = parseDecimal(firstDefined(item.originalAmount, item.originalTotal), {
        field: `items[${index}].originalAmount`,
        min: 0,
        max: 1_000_000_000,
      });
      const originalText = new Intl.NumberFormat("et-EE", { maximumFractionDigits: 2 }).format(originalAmount);
      grossAmount = `${originalText} ${currency} / ${formatMoney(grossCents)}`;
    }

    const combinedDescription = [item.vendor || item.provider, item.description]
      .map((entry) => String(entry || "").trim())
      .filter((entry, position, entries) => entry && entries.indexOf(entry) === position)
      .join(" — ");

    return {
      description: cleanText(firstDefined(combinedDescription, item.description, item.vendor), {
        required: true,
        field: `items[${index}].description`,
        maxLength: 750,
      }),
      date: formatDate(firstDefined(item.date, item.expenseDate, item.period), {
        required: true,
        field: `items[${index}].date`,
      }),
      documentReference: cleanText(firstDefined(
        item.documentReference,
        item.sourceDocumentNumber,
        item.sourceDocument,
        item.documentNumber,
        item.fileName
      ), {
        required: true,
        field: `items[${index}].documentReference`,
        maxLength: 250,
      }),
      grossAmount,
      requestedAmount: formatMoney(requestedCents),
      excludedAmount: formatMoney(excludedCents),
      grossCents,
      requestedCents,
      excludedCents,
    };
  });

  const grossTotalCents = items.reduce((sum, item) => sum + item.grossCents, 0);
  const requestedTotalCents = items.reduce((sum, item) => sum + item.requestedCents, 0);
  const excludedTotalCents = items.reduce((sum, item) => sum + item.excludedCents, 0);
  const recipientName = cleanText(firstDefined(
    recipient.name,
    data.recipientName,
    data.claimantName,
    data.person
  ), {
    required: true,
    field: "recipient.name",
    maxLength: 250,
  });
  const rawIban = firstDefined(recipient.iban, data.iban);
  const iban = cleanText(rawIban, {
    fallback: "—",
    field: "recipient.iban",
    maxLength: 80,
  }).toUpperCase();
  const generatedDocumentNumber = meta.submission?.id
    ? `KA-${String(meta.submission.id).slice(0, 8).toUpperCase()}`
    : undefined;
  const documentNumber = cleanText(
    firstDefined(data.documentNumber, data.number, generatedDocumentNumber),
    { fallback: "—", field: "documentNumber", maxLength: 100 }
  );
  const documentDate = formatDate(firstDefined(data.documentDate, data.date), {
    required: true,
    field: "documentDate",
  });

  const contactParts = [
    firstDefined(recipient.email, data.email),
    firstDefined(recipient.phone, data.phone),
    firstDefined(recipient.accountHolder, data.accountHolder)
      ? `Kontoomanik: ${cleanText(firstDefined(recipient.accountHolder, data.accountHolder), { maxLength: 250 })}`
      : undefined,
    rawIban ? `IBAN: ${iban}` : undefined,
  ].filter(Boolean);

  const rawAttachments = firstDefined(data.attachments, meta.attachments, []);
  if (!Array.isArray(rawAttachments) || rawAttachments.length > 100) {
    throw new DocumentValidationError("attachments must be an array with at most 100 entries", {
      field: "attachments",
      reason: "invalid_attachment_count",
    });
  }
  const attachments = rawAttachments.map((attachment, index) => ({
    name: cleanText(
      typeof attachment === "string"
        ? attachment
        : firstDefined(attachment?.originalName, attachment?.fileName, attachment?.name),
      { required: true, field: `attachments[${index}].name`, maxLength: 255 },
    ),
  }));
  if (attachments.length === 0) {
    attachments.push({ name: "Lisad puuduvad" });
  }

  return {
    values: {
      documentNumberAndDate: `${documentNumber} / ${documentDate}`,
      recipientName,
      recipientRole: cleanText(firstDefined(recipient.role, data.recipientRole, data.claimantRole, data.role), {
        field: "recipient.role",
        maxLength: 200,
      }),
      contactAccountIban: cleanText(firstDefined(data.contactAccountIban, contactParts.join("; ")), {
        field: "contactAccountIban",
        maxLength: 700,
      }),
      activityName: cleanText(firstDefined(data.project, data.activityName, data.activity, data.projectName), {
        required: true,
        field: "activityName",
        maxLength: 500,
      }),
      expenseType: cleanText(firstDefined(data.expenseType, data.costType, data.expenseCategory), {
        field: "expenseType",
        maxLength: 300,
      }),
      locationPeriodRoute: cleanText(firstDefined(
        data.locationPeriodRoute,
        data.locationAndPeriod,
        [data.location, data.period, data.route].filter(Boolean).join(" — ")
      ), {
        field: "locationPeriodRoute",
        maxLength: 1_250,
      }),
      fundingSource: cleanText(firstDefined(data.fundingSource, data.budgetLine), {
        field: "fundingSource",
        maxLength: 300,
      }),
      whereWhen: cleanText(firstDefined(
        data.whereWhen,
        data.locationAndDates,
        [data.date, data.location].filter(Boolean).join(" — ")
      ), {
        required: true,
        field: "whereWhen",
        maxLength: 2_000,
      }),
      activitiesAndRole: cleanText(firstDefined(
        data.activitiesAndRole,
        data.activities,
        data.activityDescription,
        data.activity
      ), {
        required: true,
        field: "activitiesAndRole",
        maxLength: 4_000,
      }),
      necessity: cleanText(firstDefined(data.necessity, data.whyNecessary, data.goal, data.purpose), {
        required: true,
        field: "necessity",
        maxLength: 4_000,
      }),
      result: cleanText(firstDefined(data.result, data.outcome), {
        required: true,
        field: "result",
        maxLength: 4_000,
      }),
      participants: cleanText(firstDefined(data.participants, data.beneficiaries), {
        field: "participants",
        maxLength: 2_000,
      }),
      items: items.map(({ grossCents: _grossCents, requestedCents: _requestedCents, excludedCents: _excludedCents, ...item }) => item),
      grossTotal: formatMoney(grossTotalCents),
      requestedTotal: formatMoney(requestedTotalCents),
      excludedTotal: formatMoney(excludedTotalCents),
      iban,
      signatureStatus: cleanText(firstDefined(data.signatureStatus, meta.signatureStatus), {
        fallback: "Allkirjastamata",
        field: "signatureStatus",
        maxLength: 100,
      }),
      signatureDate: formatDate(firstDefined(data.signatureDate, meta.signatureDate), { field: "signatureDate" }),
      attachments,
    },
    documentNumber,
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

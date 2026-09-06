import { z } from "zod";

const optionalText = (maximum) => z.string().trim().max(maximum).optional().default("");
const requiredText = (maximum) => z.string().trim().min(1).max(maximum);
const isoDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });
const optionalDate = isoDate.optional().or(z.literal(""));
const money = z.coerce.number().finite().min(0).max(10_000_000);
const optionalMoney = z.union([money, z.literal(""), z.null()]).optional().transform((value) => value === "" || value === null || value === undefined ? 0 : value);
// Expense rows have several legacy monetary aliases. Preserve an omitted alias
// as omitted so document preparation cannot mistake a schema default of 0 for
// an explicitly supplied gross amount.
const optionalExpenseMoney = z.union([money, z.literal(""), z.null()]).optional()
  .transform((value) => value === "" || value === null || value === undefined ? undefined : value);
const identifier = z.string().trim().max(100).regex(/^[\p{L}\p{N} ._\-/]*$/u).optional().default("");

function isSafePublicImageUrl(value) {
  if (!value) return true;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isSafeExternalUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

const imagePositionToken = "(?:left|center|right|top|bottom|(?:100|[1-9]?\\d)%)";
const imagePositionPattern = new RegExp(`^${imagePositionToken}(?:\\s+${imagePositionToken})?$`);

const localizedNews = z.object({
  title: optionalText(180),
  excerpt: optionalText(600),
  imageAlt: optionalText(240),
  displayDate: optionalText(100),
  content: z.array(z.string().trim().max(6_000)).max(60).optional().default([])
}).strict();

const newsDraft = z.object({
  slug: z.string().trim().max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional().or(z.literal("")),
  language: z.enum(["et", "en", "ru"]).optional().default("et"),
  date: optionalDate,
  category: z.enum(["achievements", "events", "initiatives", "opportunities"]).optional().default("events"),
  title: optionalText(180),
  summary: optionalText(600),
  excerpt: optionalText(600),
  author: optionalText(160),
  authorRole: optionalText(160),
  content: z.union([
    z.string().trim().max(30_000),
    z.array(z.string().trim().max(6_000)).max(60)
  ]).optional().default([]),
  project: optionalText(160),
  registrationUrl: optionalText(2_048).refine(isSafeExternalUrl, { message: "Invalid registration URL." }),
  image: optionalText(500).refine(isSafePublicImageUrl, { message: "Unsafe image URL." }),
  imageAlt: optionalText(240),
  imagePosition: z.string().trim().max(60).regex(imagePositionPattern).optional().default("center center"),
  imageFit: z.enum(["cover", "contain"]).optional().default("cover"),
  featured: z.boolean().optional().default(false),
  placeholder: z.literal(false).optional().default(false),
  published: z.literal(false).optional().default(false),
  translations: z.object({
    et: localizedNews.optional(),
    en: localizedNews.optional(),
    ru: localizedNews.optional()
  }).strict().optional(),
  mainImageAttachmentId: z.string().uuid().optional().or(z.literal("")),
  additionalImageAttachmentIds: z.array(z.string().uuid()).max(24).optional().default([])
}).strict();

const expenseItem = z.object({
  description: optionalText(500),
  provider: optionalText(240),
  vendor: optionalText(240),
  date: optionalDate,
  expenseDate: optionalDate,
  documentNumber: optionalText(120),
  sourceDocument: optionalText(240),
  sourceDocumentNumber: optionalText(120),
  originalTotal: optionalExpenseMoney,
  currency: z.string().trim().toUpperCase().max(3).optional().default("EUR"),
  totalEUR: optionalExpenseMoney,
  requestedEUR: optionalExpenseMoney,
  ineligibleEUR: optionalExpenseMoney,
  previouslyReimbursedEUR: optionalExpenseMoney,
  amount: optionalExpenseMoney
}).strict();

const expenseDraft = z.object({
  reimbursementRecipientEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
  documentNumber: identifier,
  documentDate: optionalDate,
  project: optionalText(240),
  person: optionalText(200),
  claimantName: optionalText(200),
  personalCode: identifier,
  claimantRole: optionalText(160),
  date: optionalDate,
  location: optionalText(500),
  period: optionalText(240),
  route: optionalText(500),
  activity: optionalText(4_000),
  purpose: optionalText(4_000),
  goal: optionalText(4_000),
  result: optionalText(4_000),
  participants: optionalText(2_000),
  necessity: optionalText(4_000),
  whereWhen: optionalText(2_000),
  expenseCategory: optionalText(240),
  fundingSource: optionalText(240),
  budgetLine: optionalText(240),
  amount: optionalExpenseMoney,
  requestedTotalEUR: optionalExpenseMoney,
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  phone: optionalText(60),
  accountHolder: optionalText(200),
  iban: z.string().trim().toUpperCase().max(34).regex(/^[A-Z]{2}[0-9A-Z ]*$/).optional().or(z.literal("")),
  submittedTo: optionalText(200),
  signatureName: optionalText(200),
  signatureDate: optionalDate,
  items: z.array(expenseItem).max(50).optional().default([])
}).strict();

const invoiceItem = z.object({
  description: optionalText(500),
  quantity: z.coerce.number().finite().min(0.0001).max(1_000_000).optional().default(1),
  unit: optionalText(60),
  unitPrice: optionalMoney,
  amount: optionalMoney,
  total: optionalMoney
}).strict();

const invoiceDraft = z.object({
  invoiceNumber: identifier,
  client: optionalText(240),
  clientName: optionalText(240),
  registryCode: identifier,
  registrationCode: identifier,
  address: optionalText(500),
  buyerContact: optionalText(240),
  invoiceDate: optionalDate,
  dueDate: optionalDate,
  transactionPeriod: optionalText(240),
  description: optionalText(2_000),
  amount: optionalMoney,
  project: optionalText(240),
  referenceNumber: identifier,
  additionalInfo: optionalText(2_000),
  currency: z.enum(["EUR"]).optional().default("EUR"),
  vatAmount: optionalMoney,
  items: z.array(invoiceItem).max(50).optional().default([])
}).strict();

const schemas = Object.freeze({ news: newsDraft, expense: expenseDraft, invoice: invoiceDraft });

function paragraphs(value) {
  if (Array.isArray(value)) return value.map((entry) => entry.trim()).filter(Boolean);
  return String(value || "")
    .split(/\r?\n\s*\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function ensureFinal(type, data) {
  const missing = [];
  const requireValue = (key, value) => {
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
      missing.push(key);
    }
  };
  if (type === "news") {
    requireValue("slug", data.slug);
    requireValue("title", data.title);
    requireValue("date", data.date);
    requireValue("summary", data.summary || data.excerpt);
    requireValue("content", paragraphs(data.content));
    requireValue("author", data.author);
  } else if (type === "expense") {
    requireValue("project", data.project);
    requireValue("person", data.person || data.claimantName);
    requireValue("date", data.date);
    requireValue("location", data.location);
    requireValue("activity", data.activity);
    requireValue("goal", data.goal);
    requireValue("result", data.result);
    requireValue("items", data.items);
    data.items.forEach((item, index) => {
      requireValue(`items.${index}.date`, item.date || item.expenseDate);
      requireValue(
        `items.${index}.documentNumber`,
        item.documentNumber || item.sourceDocumentNumber || item.sourceDocument
      );
      requireValue(`items.${index}.vendor`, item.vendor || item.provider);
      requireValue(`items.${index}.description`, item.description);
      if (!(item.requestedEUR > 0 || item.amount > 0)) {
        missing.push(`items.${index}.amount`);
      }
    });
    if (!(data.requestedTotalEUR > 0 || data.amount > 0 || data.items.some((item) => item.requestedEUR > 0))) {
      missing.push("amount");
    }
  } else if (type === "invoice") {
    requireValue("invoiceNumber", data.invoiceNumber);
    requireValue("client", data.client || data.clientName);
    requireValue("registrationCode", data.registrationCode || data.registryCode);
    requireValue("address", data.address);
    requireValue("invoiceDate", data.invoiceDate);
    requireValue("dueDate", data.dueDate);
    requireValue("project", data.project);
    requireValue("items", data.items);
    data.items.forEach((item, index) => {
      requireValue(`items.${index}.description`, item.description);
      if (!(item.quantity > 0)) missing.push(`items.${index}.quantity`);
      if (!(item.unitPrice > 0)) missing.push(`items.${index}.unitPrice`);
    });
    if (!(data.amount > 0 || data.items.some((item) => item.amount > 0 || item.unitPrice > 0))) {
      missing.push("amount");
    }
    if (!data.description && data.items.every((item) => !item.description)) missing.push("description");
    if (data.invoiceDate && data.dueDate && data.dueDate < data.invoiceDate) {
      missing.push("dueDate");
    }
  }
  if (missing.length) {
    const error = new Error("Submission is incomplete.");
    error.code = "INCOMPLETE_SUBMISSION";
    error.fields = [...new Set(missing)];
    throw error;
  }
}

export function validateSubmissionData(type, input, { final = false } = {}) {
  const schema = schemas[type];
  if (!schema) {
    const error = new Error("Unsupported submission type.");
    error.code = "INVALID_SUBMISSION_TYPE";
    throw error;
  }
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const error = new Error("Submission data is invalid.");
    error.code = "VALIDATION_ERROR";
    error.issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code
    }));
    throw error;
  }
  if (type === "news") {
    result.data.content = paragraphs(result.data.content);
    if (!result.data.summary && result.data.excerpt) result.data.summary = result.data.excerpt;
  }
  if (type === "expense") {
    if (!result.data.goal && result.data.purpose) result.data.goal = result.data.purpose;
    if (result.data.items.length) {
      result.data.items = result.data.items.map((item) => {
        const requestedEUR = Number((item.requestedEUR || item.amount || 0).toFixed(2));
        // Old drafts can already contain synthetic zeroes for totalEUR and
        // originalTotal. Prefer the first positive gross alias, then the UI's
        // single amount field, and persist one canonical gross value.
        const grossSource = [item.totalEUR, item.originalTotal, item.amount, requestedEUR]
          .find((value) => Number(value) > 0) || 0;
        return {
          ...item,
          provider: item.provider || item.vendor,
          sourceDocumentNumber: item.sourceDocumentNumber || item.documentNumber || item.sourceDocument,
          totalEUR: Number(Number(grossSource).toFixed(2)),
          requestedEUR
        };
      });
      result.data.amount = Number(
        result.data.items.reduce((sum, item) => sum + item.requestedEUR, 0).toFixed(2)
      );
      result.data.requestedTotalEUR = result.data.amount;
    }
  }
  if (type === "invoice") {
    if (!result.data.registryCode && result.data.registrationCode) {
      result.data.registryCode = result.data.registrationCode;
    }
    if (result.data.items.length) {
      result.data.items = result.data.items.map((item) => {
        // Use the same cent-based calculation as the generated invoice so
        // fractional input cannot produce different saved and document totals.
        const unitPriceCents = Math.round(item.unitPrice * 100);
        const amount = Math.round(item.quantity * unitPriceCents) / 100;
        return { ...item, unitPrice: unitPriceCents / 100, amount, total: amount };
      });
      result.data.amount = result.data.items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100;
    }
  }
  if (final) ensureFinal(type, result.data);
  return result.data;
}

export const reviewSchema = z.object({
  decision: z.enum(["approve", "needs_changes", "reject"]),
  comment: z.string().trim().max(4_000).optional().default("")
}).strict().superRefine((value, context) => {
  if (["needs_changes", "reject"].includes(value.decision) && !value.comment) {
    context.addIssue({ code: "custom", path: ["comment"], message: "Comment is required." });
  }
});

export const aiRequestSchema = z.object({
  text: z.string().trim().min(1).max(8_000),
  field: z.enum([
    "news.title",
    "news.summary",
    "news.content",
    "expense.activity",
    "expense.goal",
    "expense.result",
    "expense.necessity",
    "expense.participants",
    "invoice.description",
    "invoice.additionalInfo"
  ]),
  mode: z.enum(["fix_language", "formal", "news"]),
  language: z.enum(["et", "en", "ru"])
}).strict();

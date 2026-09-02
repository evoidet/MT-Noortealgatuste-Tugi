import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import express from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import helmet from "helmet";
import { createAiAssistant } from "./ai.js";
import { createAuth } from "./auth.js";
import {
  generateSubmissionDocument,
  getDocumentTemplateAvailability
} from "./documents.js";
import { createMailService } from "./mail.js";
import { normalizeNewsLanguage, toPublicNewsItem } from "./news-publishing.js";
import {
  canCreateType,
  canEditSubmission,
  canReadAttachment,
  canReadSubmission,
  canReviewType,
  canSubmitSubmission,
  hasPermission,
  permissionsForUser,
  requirePermission
} from "./permissions.js";
import {
  createClientUploadGrant,
  createUploadMiddleware,
  deleteAttachmentPermanently,
  deleteStoredFile,
  downloadFilenameHeader,
  openPrivateAttachment,
  persistUploadedFileWithRecord,
  readPrivateAttachment,
  verifyClientUploadedFile
} from "./storage.js";
import { aiRequestSchema, reviewSchema, validateSubmissionData } from "./validation.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = resolve(sourceDirectory, "../public");
const adminHtmlPath = resolve(publicDirectory, "index.html");
const sharedSiteDirectory = resolve(sourceDirectory, "../..");
const sharedAssetsDirectory = resolve(sharedSiteDirectory, "assets");
const sharedPublicFiles = new Map([
  ["/style.css", resolve(sharedSiteDirectory, "style.css")],
  ["/news.css", resolve(sharedSiteDirectory, "news.css")],
  ["/translations.js", resolve(sharedSiteDirectory, "translations.js")],
  ["/i18n.js", resolve(sharedSiteDirectory, "i18n.js")]
]);

const statusForDecision = Object.freeze({
  approve: "APPROVED",
  needs_changes: "NEEDS_CHANGES",
  reject: "REJECTED"
});

const auditPrefix = Object.freeze({ news: "NEWS", expense: "EXPENSE", invoice: "INVOICE" });
const userValidationCodes = new Set([
  "VALIDATION_ERROR",
  "INCOMPLETE_SUBMISSION",
  "DOCUMENT_VALIDATION_ERROR",
  "PRIMARY_ATTACHMENT_REQUIRED"
]);
const validationFieldAliases = Object.freeze({
  documentDate: "date",
  "recipient.name": "person",
  activityName: "project",
  whereWhen: "location",
  activitiesAndRole: "activity",
  necessity: "goal"
});
const validationFieldLabels = Object.freeze({
  slug: "URL-i tunnus",
  title: "Pealkiri",
  date: "Aruande kuupäev",
  summary: "Kokkuvõte",
  content: "Sisu",
  author: "Autor",
  project: "Projekt",
  person: "Esitaja",
  location: "Koht",
  activity: "Tegevuse kirjeldus",
  goal: "Kulu eesmärk ja vajalikkus",
  result: "Tulemus",
  items: "Kuluread",
  amount: "Kogusumma",
  attachments: "Peamine kuludokument",
  invoiceNumber: "Arve number",
  client: "Klient",
  registrationCode: "Registrikood",
  address: "Aadress",
  invoiceDate: "Arve kuupäev",
  dueDate: "Maksetähtpäev",
  currency: "Valuuta"
});

function normalizedValidationField(value) {
  let field = String(value || "document")
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 180) || "document";
  field = validationFieldAliases[field] || field;
  const item = /^items\.(\d+)\.(.+)$/.exec(field);
  if (item) {
    const aliases = {
      expenseDate: "date",
      documentReference: "documentNumber",
      sourceDocument: "documentNumber",
      sourceDocumentNumber: "documentNumber",
      provider: "vendor",
      grossAmount: "amount",
      requestedAmount: "amount",
      excludedAmount: "amount"
    };
    field = `items.${item[1]}.${aliases[item[2]] || item[2]}`;
  }
  if (/^attachments\.\d+\.name$/.test(field)) field = "attachments";
  return field;
}

function validationReason(error, issue = {}) {
  if (typeof issue.reason === "string" && issue.reason) return issue.reason.slice(0, 80);
  if (typeof issue.code === "string" && issue.code) return issue.code.slice(0, 80);
  if (error?.code === "INCOMPLETE_SUBMISSION" || error?.code === "PRIMARY_ATTACHMENT_REQUIRED") {
    return "required";
  }
  return "invalid";
}

function rawValidationIssues(error) {
  if (error?.code === "PRIMARY_ATTACHMENT_REQUIRED") {
    return [{ field: "attachments", reason: "required" }];
  }
  if (error?.code === "DOCUMENT_VALIDATION_ERROR") {
    const details = error?.details;
    if (Array.isArray(details?.issues)) return details.issues;
    return details && typeof details === "object" ? [details] : [{ field: "document", reason: "invalid" }];
  }
  if (Array.isArray(error?.fields)) {
    return error.fields.map((field) => typeof field === "string" ? { field } : field);
  }
  if (Array.isArray(error?.issues)) return error.issues.map((issue) => ({ field: issue.path, ...issue }));
  return [];
}

function validationFieldLabel(field) {
  const item = /^items\.(\d+)\.(.+)$/.exec(field);
  if (item) {
    const number = Number(item[1]) + 1;
    const labels = {
      date: "kuupäev",
      documentNumber: "dokumendi number",
      vendor: "müüja või teenuseosutaja",
      description: "kirjeldus",
      amount: "summa"
    };
    return `Kulu ${number} ${labels[item[2]] || "väli"}`;
  }
  return validationFieldLabels[field] || field;
}

function userValidationMessage(field, reason) {
  const label = validationFieldLabel(field);
  if (field === "attachments") return "Palun lisa peamine kuludokument.";
  if (field === "items") return "Palun lisa vähemalt üks korrektne kulurida.";
  if (reason === "amount_reconciliation") {
    return `${label}: hüvitatav ja mittehüvitatav osa ei tohi kokku ületada kulu kogusummat.`;
  }
  if (field.endsWith("amount") || field === "amount") {
    return `Palun sisesta väljale „${label}“ nullist suurem korrektne summa.`;
  }
  if ((field.endsWith("date") || field.endsWith("Date")) && reason !== "required") {
    return `Palun sisesta väljale „${label}“ korrektne kuupäev.`;
  }
  if (reason === "required") return `Palun täida väli „${label}“.`;
  if (reason === "too_long" || reason === "too_big") return `Väli „${label}“ on liiga pikk.`;
  if (reason === "unsupported_currency") return "Dokumendis saab kasutada ainult toetatud valuutat.";
  return `Palun kontrolli välja „${label}“.`;
}

function userValidationIssues(error) {
  const seen = new Set();
  const issues = [];
  for (const issue of rawValidationIssues(error)) {
    const field = normalizedValidationField(issue?.field ?? issue?.path);
    const reason = validationReason(error, issue);
    const key = `${field}:${reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({ field, message: userValidationMessage(field, reason) });
  }
  return issues;
}

function safeDocumentValidationIssues(error) {
  if (error?.code !== "DOCUMENT_VALIDATION_ERROR") return [];
  return rawValidationIssues(error).map((issue) => ({
    field: String(issue?.field || "document").slice(0, 180),
    reason: validationReason(error, issue)
  }));
}

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

function safeSubmissionType(value) {
  return ["news", "expense", "invoice"].includes(value) ? value : null;
}

function submissionSummaryData(submission) {
  const data = submission?.data ?? {};
  if (submission?.type === "news") {
    return {
      slug: data.slug,
      title: data.title,
      date: data.date,
      category: data.category,
      author: data.author,
      featured: Boolean(data.featured)
    };
  }
  if (submission?.type === "expense") {
    return {
      project: data.project,
      person: data.person || data.claimantName,
      date: data.date,
      amount: data.requestedTotalEUR || data.amount || 0
    };
  }
  if (submission?.type === "invoice") {
    return {
      invoiceNumber: data.invoiceNumber,
      client: data.client || data.clientName,
      invoiceDate: data.invoiceDate,
      dueDate: data.dueDate,
      amount: data.amount || 0,
      currency: data.currency || "EUR"
    };
  }
  return {};
}

async function summarizeSubmission(submission, database, detailed = false) {
  const [storedAttachments, reviews] = await Promise.all([
    database.listAttachments(submission.id),
    database.listReviews(submission.id)
  ]);
  const attachments = storedAttachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.originalName,
    mimeType: attachment.mimeType,
    kind: attachment.kind,
    size: attachment.size,
    createdAt: attachment.createdAt,
    downloadUrl: `/api/staff/attachments/${attachment.id}/download`
  }));
  return {
    ...submission,
    data: detailed ? submission.data : submissionSummaryData(submission),
    attachments,
    reviews: detailed ? reviews : reviews.slice(0, 1)
  };
}

function validationResponse(response, error) {
  if (error?.code === "23505" && error?.constraint === "submissions_news_slug_unique") {
    response.status(409).json({ error: "NEWS_SLUG_CONFLICT" });
    return true;
  }
  const knownCodes = new Set([
    "INVALID_SUBMISSION_TYPE",
    "VALIDATION_ERROR",
    "INCOMPLETE_SUBMISSION",
    "PRIMARY_ATTACHMENT_REQUIRED",
    "FILE_REQUIRED",
    "FILE_TOO_LARGE",
    "FILE_TYPE_NOT_ALLOWED",
    "FILE_EXTENSION_MISMATCH",
    "FILE_SIZE_MISMATCH",
    "BLOB_NOT_CONFIGURED",
    "BLOB_NOT_FOUND",
    "BLOB_NOT_PRIVATE",
    "BLOB_PATH_INVALID",
    "BLOB_PATH_MISMATCH",
    "BLOB_READ_FAILED",
    "BLOB_INTEGRITY_FAILED",
    "BLOB_CLEANUP_REQUIRED",
    "INVALID_ATTACHMENT_STATE",
    "AI_UNAVAILABLE",
    "AI_EMPTY_RESPONSE",
    "AI_INCOMPLETE_RESPONSE",
    "AI_FACT_GUARD_REJECTED",
    "DOCUMENT_VALIDATION_ERROR",
    "DOCUMENT_TEMPLATE_UNAVAILABLE",
    "INVALID_WORKFLOW_STATE",
    "SUBMISSION_DELIVERY_FAILED",
    "SUBMISSION_IN_PROGRESS",
    "NEWS_SLUG_CONFLICT"
  ]);
  if (!knownCodes.has(error.code)) return false;
  const status = error.status || (userValidationCodes.has(error.code)
    ? 422
    : error.code === "SUBMISSION_DELIVERY_FAILED"
    ? 502
    : ["AI_EMPTY_RESPONSE", "AI_INCOMPLETE_RESPONSE"].includes(error.code)
    ? 502
    : ["AI_UNAVAILABLE", "DOCUMENT_TEMPLATE_UNAVAILABLE", "BLOB_INTEGRITY_FAILED"].includes(error.code)
    ? 503
    : ["INVALID_WORKFLOW_STATE", "NEWS_SLUG_CONFLICT"].includes(error.code)
      ? 409
      : 400);
  const payload = { error: error.code };
  if (userValidationCodes.has(error.code)) {
    payload.message = "Dokumendis on parandamist vajavaid välju.";
    payload.fields = userValidationIssues(error);
  } else {
    if (Array.isArray(error.fields)) payload.fields = error.fields;
    if (Array.isArray(error.issues)) payload.issues = error.issues;
  }
  response.status(status).json(payload);
  return true;
}

function createLimiter({ windowMs, limit, prefix }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator(request) {
      return `${prefix}:${request.user?.id ?? ipKeyGenerator(request.ip)}`;
    },
    handler(_request, response) {
      response.status(429).json({ error: "TOO_MANY_REQUESTS" });
    }
  });
}

function submissionDeliveryError(cause) {
  const error = new Error("The expense submission could not be delivered.", { cause });
  error.code = "SUBMISSION_DELIVERY_FAILED";
  error.status = 502;
  return error;
}

function safeOperationalError(error, fallback = "OPERATION_FAILED") {
  return {
    code: typeof error?.code === "string" ? error.code.slice(0, 80) : fallback,
    name: typeof error?.name === "string" ? error.name.slice(0, 80) : "Error",
    ...(typeof error?.command === "string" ? { command: error.command.slice(0, 40) } : {}),
    ...(Number.isSafeInteger(error?.responseCode) ? { responseCode: error.responseCode } : {})
  };
}

function expenseDeliveryKey(submission) {
  return `${Number(submission?.revision) || 0}:${String(submission?.updatedAt || "")}`;
}

async function reconcileBlobStorage({ config, database, limit = 25 }) {
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  const [abandoned, deletePending] = await Promise.all([
    database.listPendingAttachmentsBefore(cutoff, limit),
    database.listDeletePendingAttachments(limit)
  ]);
  let removed = 0;
  let remaining = 0;
  for (const attachment of [...abandoned, ...deletePending]) {
    // SQLite imports remain pending until the explicit Blob transfer script
    // assigns a pathname. Reconciliation must never discard those records.
    if (!attachment.blobPathname) continue;
    try {
      await deleteStoredFile({ config, attachment });
      await database.deleteAttachment(attachment.id);
      removed += 1;
    } catch {
      remaining += 1;
    }
  }
  return { removed, remaining };
}

export function createStaffApp({
  config,
  database,
  mailService = createMailService(config),
  aiAssistant = createAiAssistant(config),
  documentGenerator = generateSubmissionDocument,
  privateAttachmentReader = readPrivateAttachment
}) {
  const app = express();
  const auth = createAuth({ config, database });
  const ai = aiAssistant;
  const upload = createUploadMiddleware(config);
  const authLimiter = createLimiter({ windowMs: 15 * 60_000, limit: 30, prefix: "auth" });
  const mutationLimiter = createLimiter({ windowMs: 15 * 60_000, limit: 180, prefix: "write" });
  const uploadLimiter = createLimiter({ windowMs: 10 * 60_000, limit: 40, prefix: "upload" });
  const aiLimiter = createLimiter({ windowMs: 10 * 60_000, limit: 12, prefix: "ai" });
  const publicMediaLimiter = createLimiter({ windowMs: 15 * 60_000, limit: 300, prefix: "public-media" });
  const permissionContext = Object.freeze({ invoiceCreatorEmail: config.invoiceCreatorEmail });

  async function auditSafely(entry, logMessage) {
    try {
      await database.audit(entry);
      return true;
    } catch (error) {
      console.error(logMessage, safeOperationalError(error, "AUDIT_FAILED"));
      return false;
    }
  }

  function logExpenseStage(submissionId, stage, status, metadata = {}) {
    if (config.environment === "test") return;
    console.info("Expense submission stage:", { submissionId, stage, status, ...metadata });
  }

  async function prepareExpenseMailAttachments(submission, attachments) {
    let generated;
    try {
      generated = await documentGenerator("expense", submission.data, {
        submission,
        attachments,
        creator: { name: submission.creatorName, email: submission.creatorEmail }
      });
    } catch (error) {
      if (error && typeof error === "object") error.expenseStage = "document-generation";
      throw error;
    }
    const generatedBuffer = Buffer.isBuffer(generated?.buffer)
      ? generated.buffer
      : generated?.buffer
        ? Buffer.from(generated.buffer)
        : null;
    if (!generatedBuffer?.length || !generated?.filename || !generated?.contentType) {
      throw Object.assign(new Error("The generated expense document is invalid."), {
        code: "DOCUMENT_GENERATION_INVALID",
        expenseStage: "document-generation"
      });
    }
    logExpenseStage(submission.id, "document-generation", "complete");

    const mailAttachments = [{
      filename: generated.filename,
      contentType: generated.contentType,
      content: generatedBuffer
    }];
    for (const attachment of attachments) {
      const opened = await privateAttachmentReader({ config, attachment });
      if (!Buffer.isBuffer(opened?.buffer) || opened.buffer.length === 0) {
        throw Object.assign(new Error("A private attachment returned invalid content."), {
          code: "BLOB_READ_FAILED"
        });
      }
      mailAttachments.push({
        filename: attachment.originalName,
        contentType: attachment.mimeType,
        content: opened.buffer
      });
    }
    logExpenseStage(submission.id, "prepare", "complete", {
      attachmentCount: mailAttachments.length
    });
    return mailAttachments;
  }

  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", "https://blob.vercel-storage.com", "https://*.blob.vercel-storage.com"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        upgradeInsecureRequests: config.production ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.production ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    referrerPolicy: { policy: "no-referrer" }
  }));
  app.use((request, response, next) => {
    response.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
    if (request.path.startsWith("/admin") || request.path.startsWith("/api/staff")) {
      response.set("Cache-Control", "no-store, max-age=0");
      response.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    }
    next();
  });
  app.use(express.json({ limit: "256kb", strict: true }));
  app.use(auth.optionalSession);

  app.use("/assets", express.static(sharedAssetsDirectory, {
    dotfiles: "deny",
    etag: !config.production,
    fallthrough: false,
    index: false,
    maxAge: config.production ? "1h" : 0
  }));
  sharedPublicFiles.forEach((filePath, route) => {
    app.get(route, (_request, response) => response.sendFile(filePath));
  });

  app.get("/healthz", (_request, response) => response.json({ ok: true }));
  app.get("/api/staff/health", asyncRoute(async (_request, response) => {
    try {
      await database.healthCheck();
      response.json({ ok: true, database: "ok" });
    } catch {
      response.status(503).json({ ok: false, database: "unavailable" });
    }
  }));
  app.get("/api/staff/auth/google", authLimiter, asyncRoute(auth.beginGoogleLogin));
  app.get("/api/staff/auth/google/callback", authLimiter, asyncRoute(auth.completeGoogleLogin));
  app.get("/api/staff/session", asyncRoute(async (request, response) => {
    const payload = auth.sessionPayload(request);
    if (payload.authenticated) {
      payload.permissions = permissionsForUser(request.user, permissionContext);
      payload.aiAvailable = ai.available;
      payload.documentTemplates = getDocumentTemplateAvailability();
      if (request.user.role === "admin") {
        try {
          await reconcileBlobStorage({ config, database, limit: 10 });
        } catch {
          console.error("Blob reconciliation could not run during admin session bootstrap.");
        }
      }
    }
    response.json(payload);
  }));

  app.get("/api/staff/public/news", asyncRoute(async (request, response) => {
    const language = normalizeNewsLanguage(String(request.query.lang ?? "et"));
    const submissions = await database.listPublishedNews(100);
    const items = (await Promise.all(submissions.map(async (submission) =>
      toPublicNewsItem(submission, await database.listAttachments(submission.id), language)
    ))).filter((item) => item?.id && item?.title && item?.excerpt);
    response.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=300");
    response.json({ items });
  }));

  app.get(
    "/api/staff/public/news/:submissionId/attachments/:attachmentId",
    publicMediaLimiter,
    asyncRoute(async (request, response, next) => {
      const [submission, attachment] = await Promise.all([
        database.getSubmission(request.params.submissionId),
        database.getAttachment(request.params.attachmentId)
      ]);
      if (
        !submission ||
        submission.type !== "news" ||
        submission.status !== "PUBLISHED" ||
        !attachment ||
        attachment.submissionId !== submission.id
      ) {
        return response.status(404).json({ error: "NOT_FOUND" });
      }
      let opened;
      try {
        opened = await openPrivateAttachment({ config, attachment });
      } catch {
        return response.status(404).json({ error: "NOT_FOUND" });
      }
      if (!opened || opened.statusCode !== 200 || !opened.stream) {
        return response.status(404).json({ error: "NOT_FOUND" });
      }
      response.set({
        "Content-Type": attachment.mimeType,
        "Content-Length": String(opened.blob.size),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=3600, s-maxage=86400, immutable"
      });
      const stream = Readable.fromWeb(opened.stream);
      stream.once("error", next);
      stream.pipe(response);
    })
  );
  app.post("/api/staff/logout", auth.requireSession, auth.verifyCsrf, auth.logout);

  app.use("/api/staff", auth.requireSession);

  app.get("/api/staff/submissions", asyncRoute(async (request, response) => {
    const scope = request.query.scope === "review" ? "review" : "mine";
    const type = request.query.type ? safeSubmissionType(String(request.query.type)) : null;
    if (request.query.type && !type) return response.status(400).json({ error: "INVALID_SUBMISSION_TYPE" });
    const submissions = scope === "review"
      ? await database.listReviewableSubmissions(
          ["news", "expense", "invoice"].filter((entry) => canReviewType(request.user, entry)),
          { type }
        )
      : await database.listSubmissionsByCreator(request.user.id, { type });
    response.json({ items: await Promise.all(
      submissions.map((submission) => summarizeSubmission(submission, database))
    ) });
  }));

  app.post("/api/staff/submissions", mutationLimiter, auth.verifyCsrf, asyncRoute(async (request, response) => {
    const type = safeSubmissionType(request.body?.type);
    if (!type) return response.status(400).json({ error: "INVALID_SUBMISSION_TYPE" });
    if (!canCreateType(request.user, type, permissionContext)) {
      return response.status(403).json({ error: "FORBIDDEN" });
    }
    try {
      const data = validateSubmissionData(type, request.body?.data ?? {});
      const submission = await database.createSubmission({ type, creatorId: request.user.id, data });
      await database.audit({
        user: request.user,
        action: `${auditPrefix[type]}_CREATED`,
        targetType: type,
        targetId: submission.id,
        ipHash: auth.clientIpHash(request)
      });
      response.status(201).json({ item: await summarizeSubmission(submission, database, true) });
    } catch (error) {
      if (!validationResponse(response, error)) throw error;
    }
  }));

  app.get("/api/staff/submissions/:id", asyncRoute(async (request, response) => {
    const submission = await database.getSubmission(request.params.id);
    if (!submission) return response.status(404).json({ error: "NOT_FOUND" });
    if (!canReadSubmission(request.user, submission, permissionContext)) {
      return response.status(404).json({ error: "NOT_FOUND" });
    }
    response.json({ item: await summarizeSubmission(submission, database, true) });
  }));

  app.patch("/api/staff/submissions/:id", mutationLimiter, auth.verifyCsrf, asyncRoute(async (request, response) => {
    const submission = await database.getSubmission(request.params.id);
    if (!submission) return response.status(404).json({ error: "NOT_FOUND" });
    if (!canEditSubmission(request.user, submission, permissionContext)) {
      return response.status(403).json({ error: "FORBIDDEN" });
    }
    try {
      const data = validateSubmissionData(submission.type, request.body?.data ?? {});
      const updated = await database.updateSubmission({ id: submission.id, userId: request.user.id, data });
      await database.audit({
        user: request.user,
        action: `${auditPrefix[submission.type]}_UPDATED`,
        targetType: submission.type,
        targetId: submission.id,
        ipHash: auth.clientIpHash(request)
      });
      response.json({ item: await summarizeSubmission(updated, database, true) });
    } catch (error) {
      if (!validationResponse(response, error)) throw error;
    }
  }));

  app.post("/api/staff/submissions/:id/submit", mutationLimiter, auth.verifyCsrf, asyncRoute(async (request, response) => {
    const initial = await database.getSubmission(request.params.id);
    if (!initial) return response.status(404).json({ error: "NOT_FOUND" });
    const canOwnSubmit = initial.creatorId === request.user.id &&
      hasPermission(request.user, `${initial.type}:submit:own`, permissionContext);
    if (!canOwnSubmit) {
      return response.status(403).json({ error: "FORBIDDEN" });
    }
    try {
      const updated = await database.withSubmissionLock(initial.id, async () => {
        const submission = await database.getSubmission(initial.id);
        if (!submission) return null;
        const directNewsPublish = submission.type === "news" && canReviewType(request.user, "news");
        const finalStatus = submission.type === "invoice"
          ? "APPROVED"
          : directNewsPublish
            ? "PUBLISHED"
            : "SUBMITTED";

        // A retry after a completed request is a successful no-op. This also
        // prevents a lost HTTP response from causing another email.
        if (submission.status === finalStatus) return submission;
        if (!canSubmitSubmission(request.user, submission, permissionContext)) {
          throw Object.assign(new Error("The submission workflow state changed."), {
            code: "INVALID_WORKFLOW_STATE",
            status: 409
          });
        }

        if (submission.type === "expense") {
          logExpenseStage(submission.id, "prepare", "started");
        }
        let data;
        try {
          data = validateSubmissionData(submission.type, submission.data, { final: true });
          if (submission.type === "expense") {
            logExpenseStage(submission.id, "validate", "complete");
          }
        } catch (error) {
          if (submission.type === "expense") {
            console.error("Expense submission validation failed:", {
              submissionId: submission.id,
              stage: "validate",
              ...safeOperationalError(error, "VALIDATION_FAILED")
            });
          }
          throw error;
        }
        const attachments = await database.listAttachments(submission.id);
        if (submission.type === "expense" && !attachments.some((attachment) => attachment.kind === "primary")) {
          const error = new Error("A primary expense attachment is required.");
          error.code = "PRIMARY_ATTACHMENT_REQUIRED";
          error.status = 422;
          error.fields = ["attachments"];
          throw error;
        }

        const prepared = isDeepStrictEqual(submission.data, data)
          ? submission
          : await database.updateSubmission({
              id: submission.id,
              userId: request.user.id,
              data,
              event: "SUBMIT_VALIDATED"
            });
        if (!prepared) return null;

        if (prepared.type === "invoice") {
          // Never confirm an invoice that cannot produce its final document.
          try {
            await documentGenerator("invoice", prepared.data, {
              submission: prepared,
              attachments,
              creator: { name: prepared.creatorName, email: prepared.creatorEmail }
            });
          } catch (error) {
            const validationIssues = safeDocumentValidationIssues(error);
            console.error("Invoice final document generation failed:", {
              submissionId: prepared.id,
              stage: "prepare",
              ...safeOperationalError(error, "DOCUMENT_GENERATION_FAILED"),
              ...(validationIssues.length ? { validationIssues } : {})
            });
            throw error;
          }
        }

        if (prepared.type === "expense") {
          const deliveryKey = expenseDeliveryKey(prepared);
          let delivered = await database.hasExpenseDelivery(prepared.id, deliveryKey);
          if (!delivered) {
            let mailAttachments;
            try {
              mailAttachments = await prepareExpenseMailAttachments(prepared, attachments);
            } catch (error) {
              const validationIssues = safeDocumentValidationIssues(error);
              const stage = error?.expenseStage === "document-generation"
                ? "document-generation"
                : "prepare";
              console.error("Expense submission preparation failed:", {
                submissionId: prepared.id,
                stage,
                ...safeOperationalError(error),
                ...(validationIssues.length ? { validationIssues } : {})
              });
              await auditSafely({
                user: request.user,
                action: "EXPENSE_NOTIFICATION_FAILED",
                targetType: prepared.type,
                targetId: prepared.id,
                metadata: { stage, code: safeOperationalError(error).code, deliveryKey },
                ipHash: auth.clientIpHash(request)
              }, "Expense preparation failure could not be audited:");
              if (error?.code === "DOCUMENT_VALIDATION_ERROR") throw error;
              throw submissionDeliveryError(error);
            }

            const reviewUrl = new URL("/admin", config.baseUrl);
            reviewUrl.searchParams.set("submission", prepared.id);
            reviewUrl.searchParams.set("scope", "review");
            try {
              await mailService.sendExpenseSubmitted({
                submission: prepared,
                reviewUrl: reviewUrl.href,
                attachments: mailAttachments
              });
              delivered = true;
              logExpenseStage(prepared.id, "smtp", "complete");
            } catch (error) {
              console.error("Expense notification delivery failed:", {
                submissionId: prepared.id,
                stage: "smtp",
                ...safeOperationalError(error, "MAIL_DELIVERY_FAILED")
              });
              await auditSafely({
                user: request.user,
                action: "EXPENSE_NOTIFICATION_FAILED",
                targetType: prepared.type,
                targetId: prepared.id,
                metadata: {
                  stage: "smtp",
                  code: safeOperationalError(error, "MAIL_DELIVERY_FAILED").code,
                  deliveryKey
                },
                ipHash: auth.clientIpHash(request)
              }, "Expense notification failure could not be audited:");
              throw submissionDeliveryError(error);
            }

            if (delivered) {
              await auditSafely({
                user: request.user,
                action: "EXPENSE_NOTIFICATION_SENT",
                targetType: prepared.type,
                targetId: prepared.id,
                metadata: {
                  deliveryKey,
                  revision: prepared.revision,
                  attachmentCount: mailAttachments.length
                },
                ipHash: auth.clientIpHash(request)
              }, "Expense delivery marker could not be audited:");
            }
          }
        }

        let finalized;
        try {
          finalized = await database.setSubmissionStatus({
            id: prepared.id,
            status: finalStatus,
            userId: request.user.id,
            event: prepared.type === "invoice"
              ? "CONFIRMED"
              : directNewsPublish
                ? "PUBLISHED"
                : "SUBMITTED"
          });
        } catch (error) {
          console.error("Submission final status update failed:", {
            submissionId: prepared.id,
            stage: "finalize",
            ...safeOperationalError(error, "STATUS_UPDATE_FAILED")
          });
          throw error;
        }
        if (!finalized) return null;

        await auditSafely({
          user: request.user,
          action: prepared.type === "invoice"
            ? "INVOICE_CONFIRMED"
            : directNewsPublish
              ? "NEWS_PUBLISHED"
              : `${auditPrefix[prepared.type]}_SUBMITTED`,
          targetType: prepared.type,
          targetId: prepared.id,
          ipHash: auth.clientIpHash(request)
        }, "Submission completion could not be audited:");
        return finalized;
      });
      if (!updated) return response.status(404).json({ error: "NOT_FOUND" });
      response.json({ item: await summarizeSubmission(updated, database, true) });
    } catch (error) {
      if (!validationResponse(response, error)) throw error;
    }
  }));

  app.post("/api/staff/submissions/:id/review", mutationLimiter, auth.verifyCsrf, asyncRoute(async (request, response) => {
    const submission = await database.getSubmission(request.params.id);
    if (!submission) return response.status(404).json({ error: "NOT_FOUND" });
    if (!canReviewType(request.user, submission.type)) return response.status(403).json({ error: "FORBIDDEN" });
    if (submission.creatorId === request.user.id) {
      return response.status(403).json({ error: "SELF_REVIEW_FORBIDDEN" });
    }
    if (!["SUBMITTED", "UNDER_REVIEW"].includes(submission.status)) {
      return response.status(409).json({ error: "INVALID_WORKFLOW_STATE" });
    }
    const parsed = reviewSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: "VALIDATION_ERROR",
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code }))
      });
    }
    /** @type {string} */
    let nextStatus = statusForDecision[parsed.data.decision];
    if (submission.type === "news" && parsed.data.decision === "approve") nextStatus = "PUBLISHED";
    const updated = await database.addReview({
      submissionId: submission.id,
      reviewerId: request.user.id,
      decision: parsed.data.decision,
      comment: parsed.data.comment,
      nextStatus
    });
    const action = parsed.data.decision === "approve"
      ? `${auditPrefix[submission.type]}_APPROVED`
      : parsed.data.decision === "needs_changes"
        ? `${auditPrefix[submission.type]}_RETURNED`
        : `${auditPrefix[submission.type]}_REJECTED`;
    await database.audit({
      user: request.user,
      action,
      targetType: submission.type,
      targetId: submission.id,
      metadata: { decision: parsed.data.decision },
      ipHash: auth.clientIpHash(request)
    });
    response.json({ item: await summarizeSubmission(updated, database, true) });
  }));

  app.post(
    "/api/staff/submissions/:id/attachments",
    uploadLimiter,
    auth.verifyCsrf,
    (request, response, next) => upload(request, response, (error) => error ? next(error) : next()),
    asyncRoute(async (request, response) => {
      const submission = await database.getSubmission(request.params.id);
      if (!submission) return response.status(404).json({ error: "NOT_FOUND" });
      if (!canEditSubmission(request.user, submission, permissionContext)) {
        return response.status(403).json({ error: "FORBIDDEN" });
      }
      try {
        const kind = request.body?.kind === "primary" ? "primary" : "additional";
        const attachment = await persistUploadedFileWithRecord({
          config,
          submission,
          file: request.file,
          createRecord: (stored) => database.createAttachment({
            submissionId: submission.id,
            uploaderId: request.user.id,
            kind,
            ...stored
          })
        });
        await database.audit({
          user: request.user,
          action: `${auditPrefix[submission.type]}_ATTACHMENT_ADDED`,
          targetType: submission.type,
          targetId: submission.id,
          metadata: { attachmentId: attachment.id, mimeType: attachment.mimeType, size: attachment.size },
          ipHash: auth.clientIpHash(request)
        });
        response.status(201).json({
          attachment: {
            id: attachment.id,
            name: attachment.originalName,
            mimeType: attachment.mimeType,
            kind: attachment.kind,
            size: attachment.size,
            downloadUrl: `/api/staff/attachments/${attachment.id}/download`
          }
        });
      } catch (error) {
        if (!validationResponse(response, error)) throw error;
      }
    })
  );

  app.post(
    "/api/staff/submissions/:id/attachments/upload-intent",
    uploadLimiter,
    auth.verifyCsrf,
    asyncRoute(async (request, response) => {
      const submission = await database.getSubmission(request.params.id);
      if (!submission) return response.status(404).json({ error: "NOT_FOUND" });
      if (!canEditSubmission(request.user, submission, permissionContext)) {
        return response.status(403).json({ error: "FORBIDDEN" });
      }
      try {
        // Opportunistically finish durable cleanup left by interrupted uploads
        // or deletions. Failures remain retryable and do not block a new grant.
        try {
          await reconcileBlobStorage({ config, database });
        } catch {
          console.error("Blob reconciliation could not run.");
        }
        const grant = await createClientUploadGrant({
          config,
          submission,
          originalName: request.body?.originalName,
          mimeType: request.body?.mimeType,
          size: request.body?.size
        });
        const attachment = await database.createPendingAttachment({
          submissionId: submission.id,
          uploaderId: request.user.id,
          blobPathname: grant.pathname,
          originalName: grant.originalName,
          mimeType: grant.mimeType,
          size: grant.size,
          kind: request.body?.kind === "primary" ? "primary" : "additional"
        });
        response.status(201).json({
          upload: {
            attachmentId: attachment.id,
            uploadUrl: grant.uploadUrl,
            method: grant.method,
            headers: grant.headers,
            expiresAt: grant.expiresAt
          }
        });
      } catch (error) {
        if (!validationResponse(response, error)) throw error;
      }
    })
  );

  app.post(
    "/api/staff/submissions/:id/attachments/:attachmentId/complete",
    uploadLimiter,
    auth.verifyCsrf,
    asyncRoute(async (request, response) => {
      const [submission, pending] = await Promise.all([
        database.getSubmission(request.params.id),
        database.getAttachment(request.params.attachmentId, { includePending: true })
      ]);
      if (!submission || !pending || pending.submissionId !== submission.id) {
        return response.status(404).json({ error: "NOT_FOUND" });
      }
      if (
        !canEditSubmission(request.user, submission, permissionContext) ||
        (pending.uploaderId !== request.user.id && request.user.role !== "admin")
      ) {
        return response.status(403).json({ error: "FORBIDDEN" });
      }
      if (pending.storageStatus === "ready") {
        return response.json({
          attachment: {
            id: pending.id,
            name: pending.originalName,
            mimeType: pending.mimeType,
            kind: pending.kind,
            size: pending.size,
            downloadUrl: `/api/staff/attachments/${pending.id}/download`
          }
        });
      }
      if (pending.storageStatus !== "pending") {
        return response.status(409).json({ error: "INVALID_ATTACHMENT_STATE" });
      }
      try {
        const stored = await verifyClientUploadedFile({
          config,
          submission,
          attachment: pending
        });
        const attachment = await database.markAttachmentReady(pending.id, stored);
        if (!attachment) throw Object.assign(new Error("Attachment state changed."), {
          code: "INVALID_ATTACHMENT_STATE",
          status: 409
        });
        await database.audit({
          user: request.user,
          action: `${auditPrefix[submission.type]}_ATTACHMENT_ADDED`,
          targetType: submission.type,
          targetId: submission.id,
          metadata: { attachmentId: attachment.id, mimeType: attachment.mimeType, size: attachment.size },
          ipHash: auth.clientIpHash(request)
        });
        response.status(201).json({
          attachment: {
            id: attachment.id,
            name: attachment.originalName,
            mimeType: attachment.mimeType,
            kind: attachment.kind,
            size: attachment.size,
            downloadUrl: `/api/staff/attachments/${attachment.id}/download`
          }
        });
      } catch (error) {
        if (error?.code !== "BLOB_CLEANUP_REQUIRED") {
          try {
            if (pending.blobPathname) await deleteStoredFile({ config, attachment: pending });
            await database.deleteAttachment(pending.id);
          } catch {
            // The pending row remains durable for reconcileBlobStorage().
          }
        }
        if (!validationResponse(response, error)) throw error;
      }
    })
  );

  app.get("/api/staff/attachments/:id/download", asyncRoute(async (request, response, next) => {
    const attachment = await database.getAttachment(request.params.id);
    if (!attachment) return response.status(404).json({ error: "NOT_FOUND" });
    const submission = await database.getSubmission(attachment.submissionId);
    if (!submission || !canReadAttachment(request.user, submission, permissionContext)) {
      return response.status(404).json({ error: "NOT_FOUND" });
    }
    const opened = await openPrivateAttachment({ config, attachment });
    if (!opened || opened.statusCode !== 200 || !opened.stream) {
      return response.status(404).json({ error: "NOT_FOUND" });
    }
    const contentDisposition = downloadFilenameHeader(attachment.originalName);
    const inlineImage = request.query.inline === "1" && attachment.mimeType.startsWith("image/");
    response.set({
      "Content-Type": attachment.mimeType,
      "Content-Length": String(opened.blob.size),
      "Content-Disposition": inlineImage
        ? contentDisposition.replace(/^attachment;/, "inline;")
        : contentDisposition,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store"
    });
    const stream = Readable.fromWeb(opened.stream);
    stream.once("error", next);
    stream.pipe(response);
  }));

  app.delete("/api/staff/attachments/:id", mutationLimiter, auth.verifyCsrf, asyncRoute(async (request, response) => {
    const attachment = await database.getAttachment(request.params.id, { includePending: true });
    if (!attachment) return response.status(404).json({ error: "NOT_FOUND" });
    const submission = await database.getSubmission(attachment.submissionId);
    if (!submission || !canEditSubmission(request.user, submission, permissionContext)) {
      return response.status(404).json({ error: "NOT_FOUND" });
    }
    if (attachment.storageStatus === "ready") {
      await deleteAttachmentPermanently({
        config,
        attachment,
        markDeletePending: () => database.markAttachmentDeletePending(attachment.id),
        deleteRecord: () => database.deleteAttachment(attachment.id)
      });
    } else {
      if (attachment.blobPathname) await deleteStoredFile({ config, attachment });
      await database.deleteAttachment(attachment.id);
    }
    await database.audit({
      user: request.user,
      action: `${auditPrefix[submission.type]}_ATTACHMENT_DELETED`,
      targetType: submission.type,
      targetId: submission.id,
      metadata: { attachmentId: attachment.id },
      ipHash: auth.clientIpHash(request)
    });
    response.status(204).end();
  }));

  app.post("/api/staff/storage/reconcile", mutationLimiter, auth.verifyCsrf, asyncRoute(async (request, response) => {
    if (request.user.role !== "admin") return response.status(403).json({ error: "FORBIDDEN" });
    response.json(await reconcileBlobStorage({ config, database, limit: 100 }));
  }));

  app.get("/api/staff/submissions/:id/document", asyncRoute(async (request, response) => {
    const submission = await database.getSubmission(request.params.id);
    if (!submission || !canReadSubmission(request.user, submission, permissionContext)) {
      return response.status(404).json({ error: "NOT_FOUND" });
    }
    if (!["expense", "invoice"].includes(submission.type)) {
      return response.status(400).json({ error: "DOCUMENT_NOT_AVAILABLE" });
    }
    const attachments = (await database.listAttachments(submission.id)).map((entry) => ({
      id: entry.id,
      name: entry.originalName,
      mimeType: entry.mimeType
    }));
    try {
      const document = await documentGenerator(submission.type, submission.data, {
        submission,
        attachments,
        creator: { name: submission.creatorName, email: submission.creatorEmail }
      });
      response.set({
        "Content-Type": document.contentType,
        "Content-Disposition": downloadFilenameHeader(document.filename),
        "Cache-Control": "private, no-store"
      });
      response.send(document.buffer);
    } catch (error) {
      console.error("Staff document generation failed:", {
        submissionId: submission.id,
        type: submission.type,
        ...safeOperationalError(error, "DOCUMENT_GENERATION_FAILED")
      });
      if (!validationResponse(response, error)) throw error;
    }
  }));

  app.post("/api/staff/ai/improve", aiLimiter, auth.verifyCsrf, asyncRoute(async (request, response) => {
    const parsed = aiRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ error: "VALIDATION_ERROR" });
    }
    const submissionType = parsed.data.field.split(".")[0];
    if (!canCreateType(request.user, submissionType, permissionContext)) {
      return response.status(403).json({ error: "FORBIDDEN" });
    }
    try {
      const suggestion = await ai.improve(parsed.data);
      await database.audit({
        user: request.user,
        action: "AI_TEXT_IMPROVED",
        targetType: parsed.data.field.split(".")[0],
        metadata: { field: parsed.data.field, mode: parsed.data.mode, language: parsed.data.language },
        ipHash: auth.clientIpHash(request)
      });
      response.json({ suggestion });
    } catch (error) {
      if (!validationResponse(response, error)) throw error;
    }
  }));

  app.get("/api/staff/audit", requirePermission("audit:read"), asyncRoute(async (_request, response) => {
    response.json({ items: await database.listAudit() });
  }));

  app.get("/api/staff/export/news", requirePermission("news:export"), asyncRoute(async (_request, response) => {
    const submissions = (await database.listSubmissions())
      .filter((submission) => submission.type === "news" && submission.status === "READY_FOR_EXPORT");
    const items = await Promise.all(submissions.map(async (submission) => ({
        id: submission.id,
        approvedAt: submission.updatedAt,
        revision: submission.revision,
        data: submission.data,
        attachments: (await database.listAttachments(submission.id)).map((attachment) => ({
          id: attachment.id,
          name: attachment.originalName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          downloadUrl: `/api/staff/attachments/${attachment.id}/download`
        }))
      })));
    response.json({ schemaVersion: 1, exportedAt: new Date().toISOString(), items });
  }));

  app.use("/admin", express.static(publicDirectory, {
    dotfiles: "deny",
    etag: !config.production,
    fallthrough: true,
    index: false,
    maxAge: 0
  }));
  app.get(["/admin", "/admin/", "/admin/*path"], asyncRoute(async (_request, response) => {
    response.type("html").send(await readFile(adminHtmlPath, "utf8"));
  }));

  app.use((request, response) => response.status(404).json({ error: "NOT_FOUND" }));
  app.use((error, request, response, _next) => {
    if (response.headersSent) return;
    if (error?.code === "LIMIT_FILE_SIZE") {
      return response.status(413).json({ error: "FILE_TOO_LARGE" });
    }
    if (error?.name === "MulterError") {
      return response.status(400).json({ error: "UPLOAD_INVALID" });
    }
    if (validationResponse(response, error)) return;
    console.error("Staff app request failed:", {
      method: request.method,
      path: request.path,
      code: typeof error?.code === "string" ? error.code : "UNEXPECTED_ERROR"
    });
    response.status(500).json({ error: "REQUEST_FAILED" });
  });

  return { app, auth, ai, mailService };
}

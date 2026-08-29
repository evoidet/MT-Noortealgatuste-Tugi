import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import helmet from "helmet";
import { createAiAssistant } from "./ai.js";
import { createAuth } from "./auth.js";
import { generateSubmissionDocument } from "./documents.js";
import {
  canCreateType,
  canEditSubmission,
  canReadAttachment,
  canReadSubmission,
  canReviewType,
  canSubmitSubmission,
  hasPermission,
  permissionsForRole,
  requirePermission
} from "./permissions.js";
import {
  attachmentPath,
  createUploadMiddleware,
  downloadFilenameHeader,
  persistUploadedFile
} from "./storage.js";
import { aiRequestSchema, reviewSchema, validateSubmissionData } from "./validation.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = resolve(sourceDirectory, "../public");
const adminHtmlPath = resolve(publicDirectory, "index.html");

const statusForDecision = Object.freeze({
  approve: "APPROVED",
  needs_changes: "NEEDS_CHANGES",
  reject: "REJECTED"
});

const auditPrefix = Object.freeze({ news: "NEWS", expense: "EXPENSE", invoice: "INVOICE" });

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

function safeSubmissionType(value) {
  return ["news", "expense", "invoice"].includes(value) ? value : null;
}

function summarizeSubmission(submission, database, detailed = false) {
  const attachments = database.listAttachments(submission.id).map((attachment) => ({
    id: attachment.id,
    name: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    createdAt: attachment.createdAt,
    downloadUrl: `/api/staff/attachments/${attachment.id}/download`
  }));
  const reviews = database.listReviews(submission.id);
  return {
    ...submission,
    data: detailed ? submission.data : submission.data,
    attachments,
    reviews: detailed ? reviews : reviews.slice(0, 1)
  };
}

function validationResponse(response, error) {
  const knownCodes = new Set([
    "INVALID_SUBMISSION_TYPE",
    "VALIDATION_ERROR",
    "INCOMPLETE_SUBMISSION",
    "FILE_REQUIRED",
    "FILE_TYPE_NOT_ALLOWED",
    "FILE_EXTENSION_MISMATCH",
    "AI_UNAVAILABLE",
    "AI_EMPTY_RESPONSE",
    "AI_FACT_GUARD_REJECTED"
  ]);
  if (!knownCodes.has(error.code)) return false;
  response.status(error.code === "AI_UNAVAILABLE" ? 503 : 400).json({
    error: error.code,
    fields: error.fields,
    issues: error.issues
  });
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

export function createStaffApp({ config, database }) {
  const app = express();
  const auth = createAuth({ config, database });
  const ai = createAiAssistant(config);
  const upload = createUploadMiddleware(config);
  const authLimiter = createLimiter({ windowMs: 15 * 60_000, limit: 30, prefix: "auth" });
  const mutationLimiter = createLimiter({ windowMs: 15 * 60_000, limit: 180, prefix: "write" });
  const uploadLimiter = createLimiter({ windowMs: 10 * 60_000, limit: 40, prefix: "upload" });
  const aiLimiter = createLimiter({ windowMs: 10 * 60_000, limit: 12, prefix: "ai" });

  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
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
    referrerPolicy: { policy: "no-referrer" },
    permissionsPolicy: {
      features: {
        camera: [],
        geolocation: [],
        microphone: [],
        payment: [],
        usb: []
      }
    }
  }));
  app.use((request, response, next) => {
    if (request.path.startsWith("/admin") || request.path.startsWith("/api/staff")) {
      response.set("Cache-Control", "no-store, max-age=0");
      response.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    }
    next();
  });
  app.use(express.json({ limit: "256kb", strict: true }));
  app.use(auth.optionalSession);

  app.get("/healthz", (_request, response) => response.json({ ok: true }));
  app.get("/api/staff/auth/google", authLimiter, asyncRoute(auth.beginGoogleLogin));
  app.get("/api/staff/auth/google/callback", authLimiter, asyncRoute(auth.completeGoogleLogin));
  app.get("/api/staff/session", (request, response) => {
    const payload = auth.sessionPayload(request);
    if (payload.authenticated) {
      payload.permissions = permissionsForRole(request.user.role);
      payload.aiAvailable = ai.available;
    }
    response.json(payload);
  });
  app.post("/api/staff/logout", auth.requireSession, auth.verifyCsrf, auth.logout);

  app.use("/api/staff", auth.requireSession);

  app.get("/api/staff/submissions", (request, response) => {
    const scope = request.query.scope === "review" ? "review" : "mine";
    const type = request.query.type ? safeSubmissionType(String(request.query.type)) : null;
    if (request.query.type && !type) return response.status(400).json({ error: "INVALID_SUBMISSION_TYPE" });
    const submissions = database.listSubmissions()
      .filter((submission) => !type || submission.type === type)
      .filter((submission) => {
        if (scope === "review") {
          return canReviewType(request.user, submission.type) &&
            ["SUBMITTED", "UNDER_REVIEW"].includes(submission.status);
        }
        return submission.creatorId === request.user.id && canReadSubmission(request.user, submission);
      })
      .map((submission) => summarizeSubmission(submission, database));
    response.json({ items: submissions });
  });

  app.post("/api/staff/submissions", mutationLimiter, auth.verifyCsrf, (request, response) => {
    const type = safeSubmissionType(request.body?.type);
    if (!type) return response.status(400).json({ error: "INVALID_SUBMISSION_TYPE" });
    if (!canCreateType(request.user, type)) return response.status(403).json({ error: "FORBIDDEN" });
    try {
      const data = validateSubmissionData(type, request.body?.data ?? {});
      const submission = database.createSubmission({ type, creatorId: request.user.id, data });
      database.audit({
        user: request.user,
        action: `${auditPrefix[type]}_CREATED`,
        targetType: type,
        targetId: submission.id,
        ipHash: auth.clientIpHash(request)
      });
      response.status(201).json({ item: summarizeSubmission(submission, database, true) });
    } catch (error) {
      if (!validationResponse(response, error)) throw error;
    }
  });

  app.get("/api/staff/submissions/:id", (request, response) => {
    const submission = database.getSubmission(request.params.id);
    if (!submission) return response.status(404).json({ error: "NOT_FOUND" });
    if (!canReadSubmission(request.user, submission)) return response.status(404).json({ error: "NOT_FOUND" });
    response.json({ item: summarizeSubmission(submission, database, true) });
  });

  app.patch("/api/staff/submissions/:id", mutationLimiter, auth.verifyCsrf, (request, response) => {
    const submission = database.getSubmission(request.params.id);
    if (!submission) return response.status(404).json({ error: "NOT_FOUND" });
    if (!canEditSubmission(request.user, submission)) return response.status(403).json({ error: "FORBIDDEN" });
    try {
      const data = validateSubmissionData(submission.type, request.body?.data ?? {});
      const updated = database.updateSubmission({ id: submission.id, userId: request.user.id, data });
      database.audit({
        user: request.user,
        action: `${auditPrefix[submission.type]}_UPDATED`,
        targetType: submission.type,
        targetId: submission.id,
        ipHash: auth.clientIpHash(request)
      });
      response.json({ item: summarizeSubmission(updated, database, true) });
    } catch (error) {
      if (!validationResponse(response, error)) throw error;
    }
  });

  app.post("/api/staff/submissions/:id/submit", mutationLimiter, auth.verifyCsrf, (request, response) => {
    const submission = database.getSubmission(request.params.id);
    if (!submission) return response.status(404).json({ error: "NOT_FOUND" });
    if (!canSubmitSubmission(request.user, submission)) return response.status(403).json({ error: "FORBIDDEN" });
    try {
      const data = validateSubmissionData(submission.type, submission.data, { final: true });
      if (submission.type === "expense" && database.listAttachments(submission.id).length === 0) {
        return response.status(400).json({ error: "PRIMARY_ATTACHMENT_REQUIRED", fields: ["attachments"] });
      }
      database.updateSubmission({ id: submission.id, userId: request.user.id, data, event: "SUBMIT_VALIDATED" });
      const finalStatus = submission.type === "invoice" ? "APPROVED" : "SUBMITTED";
      const updated = database.setSubmissionStatus({
        id: submission.id,
        status: finalStatus,
        userId: request.user.id,
        event: submission.type === "invoice" ? "CONFIRMED" : "SUBMITTED"
      });
      database.audit({
        user: request.user,
        action: submission.type === "invoice" ? "INVOICE_CONFIRMED" : `${auditPrefix[submission.type]}_SUBMITTED`,
        targetType: submission.type,
        targetId: submission.id,
        ipHash: auth.clientIpHash(request)
      });
      response.json({ item: summarizeSubmission(updated, database, true) });
    } catch (error) {
      if (!validationResponse(response, error)) throw error;
    }
  });

  app.post("/api/staff/submissions/:id/review", mutationLimiter, auth.verifyCsrf, (request, response) => {
    const submission = database.getSubmission(request.params.id);
    if (!submission) return response.status(404).json({ error: "NOT_FOUND" });
    if (!canReviewType(request.user, submission.type)) return response.status(403).json({ error: "FORBIDDEN" });
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
    let nextStatus = statusForDecision[parsed.data.decision];
    if (submission.type === "news" && parsed.data.decision === "approve") nextStatus = "READY_FOR_EXPORT";
    const updated = database.addReview({
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
    database.audit({
      user: request.user,
      action,
      targetType: submission.type,
      targetId: submission.id,
      metadata: { decision: parsed.data.decision },
      ipHash: auth.clientIpHash(request)
    });
    response.json({ item: summarizeSubmission(updated, database, true) });
  });

  app.post(
    "/api/staff/submissions/:id/attachments",
    uploadLimiter,
    auth.verifyCsrf,
    (request, response, next) => upload(request, response, (error) => error ? next(error) : next()),
    asyncRoute(async (request, response) => {
      const submission = database.getSubmission(request.params.id);
      if (!submission) return response.status(404).json({ error: "NOT_FOUND" });
      if (!canEditSubmission(request.user, submission)) return response.status(403).json({ error: "FORBIDDEN" });
      try {
        const stored = await persistUploadedFile({ config, submission, file: request.file });
        const attachment = database.createAttachment({
          submissionId: submission.id,
          uploaderId: request.user.id,
          ...stored
        });
        database.audit({
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
            size: attachment.size,
            downloadUrl: `/api/staff/attachments/${attachment.id}/download`
          }
        });
      } catch (error) {
        if (!validationResponse(response, error)) throw error;
      }
    })
  );

  app.get("/api/staff/attachments/:id/download", asyncRoute(async (request, response) => {
    const attachment = database.getAttachment(request.params.id);
    if (!attachment) return response.status(404).json({ error: "NOT_FOUND" });
    const submission = database.getSubmission(attachment.submissionId);
    if (!submission || !canReadAttachment(request.user, submission)) {
      return response.status(404).json({ error: "NOT_FOUND" });
    }
    response.set({
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.size),
      "Content-Disposition": downloadFilenameHeader(attachment.originalName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store"
    });
    response.send(await readFile(attachmentPath(config, attachment)));
  }));

  app.get("/api/staff/submissions/:id/document", asyncRoute(async (request, response) => {
    const submission = database.getSubmission(request.params.id);
    if (!submission || !canReadSubmission(request.user, submission)) {
      return response.status(404).json({ error: "NOT_FOUND" });
    }
    if (!["expense", "invoice"].includes(submission.type)) {
      return response.status(400).json({ error: "DOCUMENT_NOT_AVAILABLE" });
    }
    const attachments = database.listAttachments(submission.id).map((entry) => ({
      id: entry.id,
      name: entry.originalName,
      mimeType: entry.mimeType
    }));
    const document = await generateSubmissionDocument(submission.type, submission.data, {
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
  }));

  app.post("/api/staff/ai/improve", aiLimiter, auth.verifyCsrf, asyncRoute(async (request, response) => {
    const parsed = aiRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ error: "VALIDATION_ERROR" });
    }
    try {
      const suggestion = await ai.improve(parsed.data);
      database.audit({
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

  app.get("/api/staff/audit", requirePermission("audit:read"), (request, response) => {
    response.json({ items: database.listAudit() });
  });

  app.get("/api/staff/export/news", requirePermission("news:export"), (request, response) => {
    const items = database.listSubmissions()
      .filter((submission) => submission.type === "news" && submission.status === "READY_FOR_EXPORT")
      .map((submission) => ({
        id: submission.id,
        approvedAt: submission.updatedAt,
        revision: submission.revision,
        data: submission.data,
        attachments: database.listAttachments(submission.id).map((attachment) => ({
          id: attachment.id,
          name: attachment.originalName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          downloadUrl: `/api/staff/attachments/${attachment.id}/download`
        }))
      }));
    response.json({ schemaVersion: 1, exportedAt: new Date().toISOString(), items });
  });

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
      message: error?.message || "unknown error"
    });
    response.status(500).json({ error: "REQUEST_FAILED" });
  });

  return { app, auth, ai };
}


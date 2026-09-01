import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createStaffApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { DOCX_CONTENT_TYPE, DocumentValidationError } from "../src/documents.js";

function testConfig() {
  return loadConfig({
    environment: "test",
    appUrl: "http://localhost:3100",
    googleCallbackUrl: "http://localhost:3100/api/staff/auth/google/callback",
    storageDatabaseUrl: "postgresql://unused.invalid/test",
    blobReadWriteToken: "unit-test-token",
    sessionSecret: "s".repeat(48),
    allowedGoogleDomain: "noortetugi.ee",
    allowedStaffEmails: [],
    adminEmails: [],
    googleClientId: "",
    googleClientSecret: "",
    openAiApiKey: "",
    smtpHost: "",
    smtpUser: "",
    smtpPassword: "",
    mailFrom: "",
    enableDevAuth: false
  });
}

function testDatabase() {
  return {
    async getSession() { return null; },
    async healthCheck() { return true; }
  };
}

const mailService = Object.freeze({
  available: false,
  async sendExpenseSubmitted() {}
});

function expenseData() {
  return {
    project: "Noorte arengupäev",
    person: "Mari Maasikas",
    date: "2026-08-29",
    location: "Narva",
    activity: "Korraldasin noortele töötoa.",
    purpose: "Kulu oli vajalik töötoa läbiviimiseks.",
    result: "Töötoas osales 18 noort.",
    items: [{
      date: "2026-08-28",
      documentNumber: "TSEKK-1",
      vendor: "Näide OÜ",
      description: "Töötoa materjalid",
      amount: 12.35,
    }],
  };
}

function expenseRouteDatabase(overrides = {}) {
  const user = {
    id: "user-1",
    email: "mari@noortetugi.ee",
    name: "Mari Maasikas",
    role: "member",
  };
  let submission = {
    id: "60a25fad-becd-4942-b0f6-979f71bb9960",
    type: "expense",
    creatorId: user.id,
    creatorEmail: user.email,
    creatorName: user.name,
    status: "DRAFT",
    data: expenseData(),
    createdAt: "2026-08-29T09:00:00.000Z",
    updatedAt: "2026-08-29T10:00:00.000Z",
    submittedAt: null,
    revision: 1,
  };
  const attachments = overrides.attachments || [{
    id: "attachment-primary",
    submissionId: submission.id,
    originalName: "tsekk.pdf",
    mimeType: "application/pdf",
    kind: "primary",
    size: 24,
    storageStatus: "ready",
  }];
  const operations = [];
  let delivered = false;
  let statusFailures = Number(overrides.statusFailures || 0);

  return {
    operations,
    get current() { return submission; },
    async getSession() { return { user }; },
    async getSubmission() { return submission; },
    async withSubmissionLock(_id, work) { return work(); },
    async listAttachments() { return attachments; },
    async listReviews() { return []; },
    async hasExpenseDelivery() {
      operations.push("delivery-check");
      return delivered;
    },
    async updateSubmission({ data }) {
      operations.push("data-update");
      submission = {
        ...submission,
        data,
        revision: submission.revision + 1,
        updatedAt: "2026-08-29T10:01:00.000Z",
      };
      return submission;
    },
    async setSubmissionStatus({ status }) {
      operations.push("status");
      if (statusFailures > 0) {
        statusFailures -= 1;
        throw Object.assign(new Error("status unavailable"), { code: "TEST_STATUS_FAILURE" });
      }
      submission = {
        ...submission,
        status,
        revision: submission.revision + 1,
        submittedAt: "2026-08-29T10:02:00.000Z",
      };
      return submission;
    },
    async audit(entry) {
      operations.push(`audit:${entry.action}`);
      if (entry.action === "EXPENSE_NOTIFICATION_SENT") delivered = true;
    },
  };
}

async function authenticatedSubmissionRequest(app, config, submissionId) {
  const cookie = `${config.cookieName}=test-session-token`;
  const session = await request(app).get("/api/staff/session").set("Cookie", cookie);
  assert.equal(session.status, 200);
  assert.equal(session.body.authenticated, true);
  return request(app)
    .post(`/api/staff/submissions/${submissionId}/submit`)
    .set("Cookie", cookie)
    .set("X-CSRF-Token", session.body.csrfToken)
    .send({});
}

test("public staff health checks Postgres without requiring a session", async () => {
  const { app } = createStaffApp({ config: testConfig(), database: testDatabase(), mailService });
  const response = await request(app).get("/api/staff/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, database: "ok" });
});

test("staff data routes require authentication and admin UI remains available", async () => {
  const { app } = createStaffApp({ config: testConfig(), database: testDatabase(), mailService });
  const denied = await request(app).get("/api/staff/submissions");
  assert.equal(denied.status, 401);
  assert.deepEqual(denied.body, { error: "AUTHENTICATION_REQUIRED" });

  const canonical = await request(app).get("/admin");
  assert.equal(canonical.status, 301);
  assert.equal(canonical.headers.location, "/admin/");

  const admin = await request(app).get("/admin/");
  assert.equal(admin.status, 200);
  assert.match(admin.headers["content-type"], /^text\/html/);
  assert.match(admin.text, /id="staffApp"/);
});

test("expense document validation returns safe field issues with HTTP 422", async () => {
  const config = testConfig();
  const database = expenseRouteDatabase();
  let mailCalls = 0;
  let attachmentReads = 0;
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...entries) => logs.push(entries);
  try {
    const { app } = createStaffApp({
      config,
      database,
      mailService: {
        async sendExpenseSubmitted() { mailCalls += 1; },
      },
      documentGenerator: async () => {
        throw new DocumentValidationError("amounts do not reconcile", {
          field: "items[0].amount",
          reason: "amount_reconciliation",
        });
      },
      privateAttachmentReader: async () => {
        attachmentReads += 1;
        return { buffer: Buffer.from("unexpected") };
      },
    });

    const response = await authenticatedSubmissionRequest(app, config, database.current.id);
    assert.equal(response.status, 422);
    assert.deepEqual(response.body, {
      error: "DOCUMENT_VALIDATION_ERROR",
      message: "Dokumendis on parandamist vajavaid välju.",
      fields: [{
        field: "items.0.amount",
        message: "Kulu 1 summa: hüvitatav ja mittehüvitatav osa ei tohi kokku ületada kulu kogusummat.",
      }],
    });
    assert.equal(mailCalls, 0);
    assert.equal(attachmentReads, 0);
    assert.equal(database.operations.includes("status"), false);
    const preparationLog = logs.find(([message]) => message === "Expense submission preparation failed:");
    assert.deepEqual(preparationLog?.[1]?.validationIssues, [{
      field: "items[0].amount",
      reason: "amount_reconciliation",
    }]);
  } finally {
    console.error = originalConsoleError;
  }
});

test("missing primary expense attachment is a field-level 422 error", async () => {
  const config = testConfig();
  const database = expenseRouteDatabase({ attachments: [] });
  let documentCalls = 0;
  const { app } = createStaffApp({
    config,
    database,
    mailService,
    documentGenerator: async () => {
      documentCalls += 1;
      return null;
    },
  });

  const response = await authenticatedSubmissionRequest(app, config, database.current.id);
  assert.equal(response.status, 422);
  assert.deepEqual(response.body.fields, [{
    field: "attachments",
    message: "Palun lisa peamine kuludokument.",
  }]);
  assert.equal(documentCalls, 0);
  assert.equal(database.operations.includes("status"), false);
});

test("successful expense submission sends generated and uploaded attachments before status changes", async () => {
  const config = testConfig();
  const database = expenseRouteDatabase({
    attachments: [
      {
        id: "attachment-primary",
        originalName: "tsekk.pdf",
        mimeType: "application/pdf",
        kind: "primary",
        size: 24,
      },
      {
        id: "attachment-additional",
        originalName: "selgitus.png",
        mimeType: "image/png",
        kind: "additional",
        size: 12,
      },
    ],
  });
  let sent;
  const { app } = createStaffApp({
    config,
    database,
    documentGenerator: async () => {
      database.operations.push("document");
      return {
        buffer: Buffer.from("generated document"),
        filename: "kuluaruanne-KA-TEST.docx",
        contentType: DOCX_CONTENT_TYPE,
      };
    },
    privateAttachmentReader: async ({ attachment }) => {
      database.operations.push(`blob:${attachment.id}`);
      return { buffer: Buffer.from(`content:${attachment.id}`) };
    },
    mailService: {
      async sendExpenseSubmitted(payload) {
        database.operations.push("mail");
        sent = payload;
      },
    },
  });

  const response = await authenticatedSubmissionRequest(app, config, database.current.id);
  assert.equal(response.status, 200);
  assert.equal(response.body.item.status, "SUBMITTED");
  assert.deepEqual(sent.attachments.map(({ filename, contentType, content }) => ({
    filename,
    contentType,
    size: content.length,
  })), [
    { filename: "kuluaruanne-KA-TEST.docx", contentType: DOCX_CONTENT_TYPE, size: 18 },
    { filename: "tsekk.pdf", contentType: "application/pdf", size: 26 },
    { filename: "selgitus.png", contentType: "image/png", size: 29 },
  ]);
  assert.ok(database.operations.indexOf("document") < database.operations.indexOf("mail"));
  assert.ok(database.operations.indexOf("blob:attachment-primary") < database.operations.indexOf("mail"));
  assert.ok(database.operations.indexOf("mail") < database.operations.indexOf("status"));
});

test("a missing private Blob leaves the expense draft unsubmitted and skips email", async () => {
  const config = testConfig();
  const database = expenseRouteDatabase();
  let mailCalls = 0;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const { app } = createStaffApp({
      config,
      database,
      documentGenerator: async () => ({
        buffer: Buffer.from("generated document"),
        filename: "kuluaruanne-KA-TEST.docx",
        contentType: DOCX_CONTENT_TYPE,
      }),
      privateAttachmentReader: async () => {
        throw Object.assign(new Error("missing Blob"), { code: "BLOB_NOT_FOUND" });
      },
      mailService: {
        async sendExpenseSubmitted() { mailCalls += 1; },
      },
    });

    const response = await authenticatedSubmissionRequest(app, config, database.current.id);
    assert.equal(response.status, 502);
    assert.equal(response.body.error, "SUBMISSION_DELIVERY_FAILED");
    assert.equal(mailCalls, 0);
    assert.equal(database.current.status, "DRAFT");
    assert.equal(database.operations.includes("status"), false);
  } finally {
    console.error = originalConsoleError;
  }
});

test("retry after email success and status failure does not send a duplicate", async () => {
  const config = testConfig();
  const database = expenseRouteDatabase({ statusFailures: 1 });
  let documentCalls = 0;
  let mailCalls = 0;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const { app } = createStaffApp({
      config,
      database,
      documentGenerator: async () => {
        documentCalls += 1;
        return {
          buffer: Buffer.from("generated document"),
          filename: "kuluaruanne-KA-TEST.docx",
          contentType: DOCX_CONTENT_TYPE,
        };
      },
      privateAttachmentReader: async () => ({ buffer: Buffer.from("%PDF-1.7 attachment") }),
      mailService: {
        async sendExpenseSubmitted() { mailCalls += 1; },
      },
    });

    const first = await authenticatedSubmissionRequest(app, config, database.current.id);
    assert.equal(first.status, 500);
    assert.equal(database.current.status, "DRAFT");
    const second = await authenticatedSubmissionRequest(app, config, database.current.id);
    assert.equal(second.status, 200);
    assert.equal(second.body.item.status, "SUBMITTED");
    assert.equal(documentCalls, 1);
    assert.equal(mailCalls, 1);
  } finally {
    console.error = originalConsoleError;
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createStaffApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { DOCX_CONTENT_TYPE, DocumentValidationError } from "../src/documents.js";
import { createMailService } from "../src/mail.js";

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
    async assertSubmissionSchema() {},
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
  let deliveryState = "ready";
  let statusFailures = Number(overrides.statusFailures || 0);

  return {
    operations,
    get current() { return submission; },
    async getSession() { return { user }; },
    async getSubmission() { return submission; },
    async withSubmissionLock(_id, work) { return work(); },
    async assertSubmissionSchema() {},
    async getExpenseDeliveryState() { return deliveryState; },
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
      if (entry.action === "EXPENSE_NOTIFICATION_STARTED") deliveryState = "uncertain";
      if (entry.action === "EXPENSE_NOTIFICATION_SENT") deliveryState = "sent";
      if (entry.action === "EXPENSE_NOTIFICATION_REJECTED") deliveryState = "ready";
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

test("successful expense submission without an OpenAI key sends generated and uploaded attachments before status changes", async () => {
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
  assert.equal(config.openAiApiKey, "");
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

test("final expense submission never invokes AI or rewrites user prose", async () => {
  const config = testConfig();
  const database = expenseRouteDatabase();
  const original = structuredClone(database.current.data);
  let aiCalls = 0;
  let documentData;
  let mailedData;
  const { app } = createStaffApp({
    config,
    database,
    aiAssistant: {
      available: true,
      async improve() {
        aiCalls += 1;
        throw new Error("Final submission must not request an AI suggestion.");
      },
      async correctExpense() {
        aiCalls += 1;
        throw new Error("Final submission must not invoke automatic AI correction.");
      }
    },
    documentGenerator: async (_type, data) => {
      database.operations.push("document");
      documentData = structuredClone(data);
      return {
        buffer: Buffer.from("generated document"),
        filename: "kuluaruanne-KA-TEST.docx",
        contentType: DOCX_CONTENT_TYPE
      };
    },
    privateAttachmentReader: async () => ({ buffer: Buffer.from("%PDF-1.7 attachment") }),
    mailService: {
      async sendExpenseSubmitted({ submission }) {
        database.operations.push("mail");
        mailedData = structuredClone(submission.data);
      }
    }
  });

  const response = await authenticatedSubmissionRequest(app, config, database.current.id);

  assert.equal(response.status, 200);
  assert.equal(aiCalls, 0);
  assert.equal(documentData.activity, original.activity);
  assert.equal(documentData.purpose, original.purpose);
  assert.equal(documentData.result, original.result);
  assert.equal(documentData.project, original.project);
  assert.equal(documentData.person, original.person);
  assert.equal(documentData.date, original.date);
  assert.equal(documentData.location, original.location);
  assert.equal(documentData.items[0].date, original.items[0].date);
  assert.equal(documentData.items[0].documentNumber, original.items[0].documentNumber);
  assert.equal(documentData.items[0].vendor, original.items[0].vendor);
  assert.equal(documentData.items[0].description, original.items[0].description);
  assert.equal(documentData.items[0].amount, original.items[0].amount);
  assert.deepEqual(mailedData, documentData);
  assert.deepEqual(database.current.data, documentData);
  assert.equal(database.operations.some((entry) => entry.includes("EXPENSE_AI_")), false);
  assert.ok(database.operations.indexOf("document") < database.operations.indexOf("mail"));
});

test("manual expense AI returns a suggestion without mutating the saved draft", async () => {
  const config = testConfig();
  const database = expenseRouteDatabase();
  const original = structuredClone(database.current.data);
  const aiRequests = [];
  const { app } = createStaffApp({
    config,
    database,
    aiAssistant: {
      available: true,
      async improve(input) {
        aiRequests.push(input);
        return "Korraldasin noortele keeleliselt parandatud töötoa.";
      }
    },
    mailService
  });
  const cookie = `${config.cookieName}=test-session-token`;
  const session = await request(app).get("/api/staff/session").set("Cookie", cookie);

  const response = await request(app)
    .post("/api/staff/ai/improve")
    .set("Cookie", cookie)
    .set("X-CSRF-Token", session.body.csrfToken)
    .send({
      text: original.activity,
      field: "expense.activity",
      mode: "fix_language",
      language: "et"
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.suggestion, "Korraldasin noortele keeleliselt parandatud töötoa.");
  assert.deepEqual(aiRequests, [{
    text: original.activity,
    field: "expense.activity",
    mode: "fix_language",
    language: "et"
  }]);
  assert.deepEqual(database.current.data, original);
  assert.equal(database.operations.includes("audit:AI_TEXT_IMPROVED"), true);
});

test("expense submission reaches a mocked Nodemailer transport with safe Gmail options", async () => {
  const config = testConfig();
  const database = expenseRouteDatabase();
  const smtpPassword = "unit-test-app-password";
  let transportOptions;
  const messages = [];
  const service = createMailService({
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    smtpRequireTls: false,
    smtpUser: "staff@noortetugi.ee",
    smtpPassword,
    mailConnectionTimeoutMs: 5_000,
    mailFrom: "MTÜ Noortealgatuste Tugi <staff@noortetugi.ee>",
    financeNotificationEmail: "finance@noortetugi.ee"
  }, {
    createTransport(options) {
      transportOptions = options;
      return {
        async sendMail(message) {
          messages.push(message);
          return { messageId: "mocked-message" };
        }
      };
    }
  });
  const { app } = createStaffApp({
    config,
    database,
    mailService: service,
    documentGenerator: async () => ({
      buffer: Buffer.from("generated document"),
      filename: "kuluaruanne-KA-TEST.docx",
      contentType: DOCX_CONTENT_TYPE
    }),
    privateAttachmentReader: async () => ({ buffer: Buffer.from("%PDF-1.7 attachment") })
  });

  const response = await authenticatedSubmissionRequest(app, config, database.current.id);

  assert.equal(response.status, 200);
  assert.deepEqual({
    host: transportOptions.host,
    port: transportOptions.port,
    secure: transportOptions.secure,
    requireTLS: transportOptions.requireTLS,
    user: transportOptions.auth.user,
    pass: transportOptions.auth.pass
  }, {
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    requireTLS: false,
    user: "staff@noortetugi.ee",
    pass: smtpPassword
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, "finance@noortetugi.ee");
  assert.equal(messages[0].attachments.length, 2);
});

test("SMTP authentication failure logging contains metadata but never credentials", async () => {
  const config = testConfig();
  const database = expenseRouteDatabase();
  const smtpPassword = "never-log-this-test-password";
  const service = createMailService({
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    smtpRequireTls: false,
    smtpUser: "staff@noortetugi.ee",
    smtpPassword,
    mailConnectionTimeoutMs: 5_000,
    mailFrom: "staff@noortetugi.ee",
    financeNotificationEmail: "finance@noortetugi.ee"
  }, {
    createTransport() {
      return {
        async sendMail() {
          throw Object.assign(new Error("Authentication failed"), {
            code: "EAUTH",
            command: "AUTH PLAIN",
            responseCode: 535,
            password: smtpPassword
          });
        }
      };
    }
  });
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...entries) => logs.push(entries);
  try {
    const { app } = createStaffApp({
      config,
      database,
      mailService: service,
      documentGenerator: async () => ({
        buffer: Buffer.from("generated document"),
        filename: "kuluaruanne-KA-TEST.docx",
        contentType: DOCX_CONTENT_TYPE
      }),
      privateAttachmentReader: async () => ({ buffer: Buffer.from("%PDF-1.7 attachment") })
    });

    const response = await authenticatedSubmissionRequest(app, config, database.current.id);

    assert.equal(response.status, 502);
    assert.equal(database.current.status, "DRAFT");
    const smtpLog = logs.find(([message]) => message === "Expense notification delivery failed:");
    assert.deepEqual(smtpLog?.[1], {
      submissionId: database.current.id,
      stage: "smtp",
      code: "EAUTH",
      name: "Error",
      command: "AUTH PLAIN",
      responseCode: 535
    });
    assert.equal(JSON.stringify(logs).includes(smtpPassword), false);
  } finally {
    console.error = originalConsoleError;
  }
});

function submissionApp(database, send) {
  const config = testConfig();
  const { app } = createStaffApp({ config, database,
    documentGenerator: async () => ({ buffer: Buffer.from("synthetic document"),
      filename: "expense.docx", contentType: DOCX_CONTENT_TYPE }),
    privateAttachmentReader: async () => ({ buffer: Buffer.from("synthetic attachment") }),
    mailService: { sendExpenseSubmitted: send }
  });
  return { app, config };
}

test("missing schema stops submission before document generation or SMTP and logs safe column", async (t) => {
  const database = expenseRouteDatabase();
  database.assertSubmissionSchema = async () => { throw Object.assign(
    new Error('column "published_at" does not exist'), { code: "42703", name: "error" }); };
  let sends = 0;
  const { app, config } = submissionApp(database, async () => { sends++; });
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  const response = await authenticatedSubmissionRequest(app, config, database.current.id);
  assert.equal(response.status, 503);
  assert.equal(response.body.error, "SUBMISSION_SCHEMA_NOT_READY");
  assert.equal(sends, 0);
  assert.equal(database.current.status, "DRAFT");
  assert.equal(logs[0][1].column, "published_at");
  assert.equal(logs[0][1].submissionId, database.current.id);
  assert.equal(JSON.stringify(response.body).includes("published_at"), false);
});

test("failed start marker sends no email; failed sent marker blocks retry after one delivery", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const failedAction of ["EXPENSE_NOTIFICATION_STARTED", "EXPENSE_NOTIFICATION_SENT"]) {
    const database = expenseRouteDatabase();
    const audit = database.audit;
    database.audit = async (entry) => {
      if (entry.action === failedAction) throw Object.assign(new Error("synthetic DB failure"), { code: "08006" });
      return audit(entry);
    };
    let sends = 0;
    const { app, config } = submissionApp(database, async () => { sends++; });
    assert.equal((await authenticatedSubmissionRequest(app, config, database.current.id)).status, 500);
    const retried = await authenticatedSubmissionRequest(app, config, database.current.id);
    assert.equal(retried.status, failedAction.endsWith("STARTED") ? 500 : 409);
    assert.equal(sends, failedAction.endsWith("STARTED") ? 0 : 1);
    assert.equal(database.current.status, "DRAFT");
  }
});

test("ambiguous SMTP error blocks resend; explicit authentication rejection is retryable", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const code of ["ETIMEDOUT", "EAUTH"]) {
    const database = expenseRouteDatabase();
    let sends = 0;
    const { app, config } = submissionApp(database, async () => {
      sends++;
      if (sends === 1) throw Object.assign(new Error("synthetic SMTP error"), { code, command: "DATA" });
    });
    assert.equal((await authenticatedSubmissionRequest(app, config, database.current.id)).status, 502);
    const retry = await authenticatedSubmissionRequest(app, config, database.current.id);
    assert.equal(retry.status, code === "EAUTH" ? 200 : 409);
    assert.equal(sends, code === "EAUTH" ? 2 : 1);
  }
});

test("delivered draft permits identical save then finalization, rejects changed data, and finished retries are no-ops", async (t) => {
  t.mock.method(console, "error", () => {});
  const database = expenseRouteDatabase({ statusFailures: 1 });
  let sends = 0;
  const { app, config } = submissionApp(database, async () => { sends++; });
  assert.equal((await authenticatedSubmissionRequest(app, config, database.current.id)).status, 500);
  const cookie = `${config.cookieName}=test-session-token`;
  const session = await request(app).get("/api/staff/session").set("Cookie", cookie);
  const save = (data) => request(app).patch(`/api/staff/submissions/${database.current.id}`)
    .set("Cookie", cookie).set("X-CSRF-Token", session.body.csrfToken).send({ data });
  const revision = database.current.revision;
  assert.equal((await save(database.current.data)).status, 200);
  assert.equal(database.current.revision, revision);
  assert.equal((await save({ ...database.current.data, project: "changed" })).status, 409);
  assert.equal((await authenticatedSubmissionRequest(app, config, database.current.id)).status, 200);
  const finalRevision = database.current.revision;
  assert.equal((await authenticatedSubmissionRequest(app, config, database.current.id)).status, 200);
  assert.equal(database.current.revision, finalRevision);
  assert.equal(sends, 1);
  assert.equal((await save({ ...database.current.data, project: "changed" })).status, 403);
});

test("oversized and malformed JSON return safe client errors", async () => {
  const { app } = createStaffApp({ config: testConfig(), database: testDatabase(), mailService });
  const malformed = await request(app).post("/api/staff/submissions").type("json").send('{"private":');
  assert.equal(malformed.status, 400);
  assert.deepEqual(malformed.body, { error: "INVALID_JSON" });
  const large = await request(app).post("/api/staff/submissions").send({ data: "x".repeat(270000) });
  assert.equal(large.status, 413);
  assert.deepEqual(large.body, { error: "REQUEST_TOO_LARGE" });
});

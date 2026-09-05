import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createStaffApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

function fixture({ auditFails = false, verifyFails = false, delivery = "ready", storageStatus = "pending" } = {}) {
  const config = loadConfig({
    environment: "test",
    appUrl: "http://localhost:3100",
    googleCallbackUrl: "http://localhost:3100/api/staff/auth/google/callback",
    storageDatabaseUrl: "postgresql://unused.invalid/test",
    blobReadWriteToken: "unit-test-token",
    sessionSecret: "s".repeat(48),
    allowedGoogleDomain: "example.test",
    financeNotificationEmail: "finance@example.test",
    invoiceCreatorEmail: "finance@example.test",
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
  const user = { id: "owner", name: "Test Staff", email: "staff@example.test", role: "member" };
  const submission = { id: "60a25fad-becd-4942-b0f6-979f71bb9960", creatorId: user.id, type: "expense", status: "DRAFT" };
  const attachment = {
    id: "attachment-1", submissionId: submission.id, uploaderId: user.id,
    originalName: "receipt.pdf", mimeType: "application/pdf", size: 24, kind: "primary", storageStatus
  };
  let locked = false;
  let verificationCalls = 0;
  let attachmentCount = 1;
  let deletes = 0;
  const database = {
    async getSession() { return { user }; },
    async getSubmission() { assert.ok(locked); return submission; },
    async getExpenseDeliveryState() { assert.ok(locked); return delivery; },
    async withSubmissionLock(id, work) {
      assert.equal(id, submission.id);
      assert.equal(locked, false);
      locked = true;
      try { return await work(); } finally { locked = false; }
    },
    async getAttachment() { assert.ok(locked); return attachment; },
    async listAttachments() { assert.ok(locked); return Array.from({ length: attachmentCount }, () => attachment); },
    async markAttachmentReady() { assert.ok(locked); attachment.storageStatus = "ready"; return attachment; },
    async deleteAttachment() { deletes += 1; },
    async audit() {
      assert.ok(locked);
      if (auditFails) throw Object.assign(new Error("audit unavailable"), { code: "TEST_AUDIT_ERROR" });
    }
  };
  const { app } = createStaffApp({
    config, database,
    mailService: { available: false, async sendExpenseSubmitted() { assert.fail("No live email in tests"); } },
    async clientUploadedFileVerifier() {
      assert.ok(locked);
      verificationCalls += 1;
      if (verifyFails) throw Object.assign(new Error("Blob read unavailable"), { code: "BLOB_READ_FAILED", status: 503 });
      return { size: attachment.size };
    }
  });
  return {
    config, app, attachment, submission,
    set attachmentCount(value) { attachmentCount = value; },
    get verificationCalls() { return verificationCalls; },
    get deletes() { return deletes; }
  };
}

async function authenticatedPost(context, path) {
  const cookie = `${context.config.cookieName}=test-session-token`;
  const session = await request(context.app).get("/api/staff/session").set("Cookie", cookie);
  assert.equal(session.status, 200);
  return request(context.app).post(path).set("Cookie", cookie).set("X-CSRF-Token", session.body.csrfToken).send({});
}

function completePath(context) {
  return `/api/staff/submissions/${context.submission.id}/attachments/${context.attachment.id}/complete`;
}

test("completion retains a ready attachment and succeeds if its audit write fails", async () => {
  const context = fixture({ auditFails: true });
  const response = await authenticatedPost(context, completePath(context));
  assert.equal(response.status, 201);
  assert.equal(context.attachment.storageStatus, "ready");
  assert.equal(context.deletes, 0);
  const retry = await authenticatedPost(context, completePath(context));
  assert.equal(retry.status, 200);
  assert.equal(context.verificationCalls, 1);
});

test("transient completion failure leaves the pending upload available for retry", async () => {
  const context = fixture({ verifyFails: true });
  const response = await authenticatedPost(context, completePath(context));
  assert.equal(response.status, 503);
  assert.equal(context.attachment.storageStatus, "pending");
  assert.equal(context.deletes, 0);
});

test("completion cannot attach an upload from another submission", async () => {
  const context = fixture();
  context.attachment.submissionId = "another-submission";
  const response = await authenticatedPost(context, completePath(context));
  assert.equal(response.status, 404);
  assert.equal(context.verificationCalls, 0);
});

test("delivery recovery blocks attachment mutation before Blob verification", async () => {
  const context = fixture({ delivery: "sent" });
  const response = await authenticatedPost(context, completePath(context));
  assert.equal(response.status, 409);
  assert.equal(response.body.error, "SUBMISSION_DELIVERY_PENDING");
  assert.equal(context.verificationCalls, 0);
});

test("the attachment count cap is enforced under the submission lock before upload", async () => {
  const context = fixture();
  context.attachmentCount = 100;
  const response = await authenticatedPost(context, `/api/staff/submissions/${context.submission.id}/attachments`);
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "FILE_COUNT_LIMIT");
});

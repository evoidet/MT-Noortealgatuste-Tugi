import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import request from "supertest";
import { createStaffApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/database.js";
import { loadMigrations } from "../scripts/db-migrate.mjs";

async function fixture(t, versions = ["001", "002", "003", "004"]) {
  const engine = new PGlite();
  t.after(() => engine.close());
  const migrations = await loadMigrations();
  await engine.exec(`CREATE TABLE schema_migrations (
    version TEXT PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL)`);
  async function migrate(version) {
    const migration = migrations.find((entry) => entry.version === version);
    await engine.exec("BEGIN");
    try {
      await engine.exec(migration.sql);
      await engine.query(`INSERT INTO schema_migrations VALUES ($1,$2,$3)
        ON CONFLICT (version) DO NOTHING`, [migration.version, migration.name, migration.checksum]);
      await engine.exec("COMMIT");
    } catch (error) {
      await engine.exec("ROLLBACK");
      throw error;
    }
  }
  for (const version of versions) await migrate(version);
  const client = { query: (sql, params) => engine.query(sql, params), release() {} };
  const database = openDatabase(null, { pool: {
    query: client.query, async connect() { return client; }, async end() {}
  } });
  const user = await database.upsertUser({ googleSubject: "synthetic-subject",
    email: "fixture@example.test", name: "Synthetic Staff", role: "member" });
  return { engine, database, user, migrate };
}

test("PostgreSQL reproduces published_at 42703; pending migrations repair without data loss", async (t) => {
  const { engine, database, user, migrate } = await fixture(t, ["001", "002"]);
  const draft = await database.createSubmission({ type: "expense", creatorId: user.id,
    data: { project: "Preserve this synthetic draft" } });
  await assert.rejects(database.setSubmissionStatus({ id: draft.id, status: "SUBMITTED",
    userId: user.id, event: "SUBMITTED" }), (error) => {
    assert.equal(error.code, "42703");
    assert.match(error.message, /published_at/);
    return true;
  });
  assert.equal((await database.getSubmission(draft.id)).status, "DRAFT");
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM revisions")).rows[0].count, 1);
  await migrate("003");
  await migrate("004");
  await database.assertSubmissionSchema();
  const finalized = await database.setSubmissionStatus({ id: draft.id, status: "SUBMITTED",
    userId: user.id, event: "SUBMITTED" });
  assert.equal(finalized.status, "SUBMITTED");
  assert.ok(finalized.submittedAt);
  assert.equal(finalized.publishedAt, null);
  assert.deepEqual(finalized.data, draft.data);
  assert.equal(finalized.revision, 2);
  await assert.rejects(database.updateSubmission({ id: draft.id, userId: user.id, data: {} }),
    { code: "INVALID_WORKFLOW_STATE" });
  await migrate("004");
  assert.deepEqual(await database.getSubmission(draft.id), finalized);
});

test("repair migration restores schema drift and all final states preserve timestamps", async (t) => {
  const { engine, database, user, migrate } = await fixture(t);
  // Simulate a drifted installation that claims 003 but lacks its column/index.
  await engine.exec("DROP INDEX submissions_published_news_idx; ALTER TABLE submissions DROP COLUMN published_at");
  await assert.rejects(database.assertSubmissionSchema(), { code: "42703" });
  await migrate("004");
  await database.assertSubmissionSchema();
  for (const [type, status] of [["invoice", "APPROVED"], ["news", "PUBLISHED"]]) {
    const draft = await database.createSubmission({ type, creatorId: user.id, data: { slug: "fixture-news" } });
    const updated = await database.updateSubmission({ id: draft.id, userId: user.id, data: { slug: "fixture-news", title: "Saved draft" } });
    assert.equal(updated.data.title, "Saved draft");
    assert.equal((await database.getSubmission(draft.id)).revision, 2);
    const final = await database.setSubmissionStatus({ id: draft.id, status, userId: user.id, event: status });
    assert.ok(final.submittedAt);
    assert.equal(Boolean(final.publishedAt), type === "news");
  }
  const reviewable = await database.createSubmission({ type: "news", creatorId: user.id,
    data: { slug: "reviewable-news" } });
  await database.setSubmissionStatus({ id: reviewable.id, status: "SUBMITTED", userId: user.id, event: "SUBMITTED" });
  const reviewed = await database.addReview({ submissionId: reviewable.id, reviewerId: user.id,
    decision: "approve", comment: "Synthetic review", nextStatus: "PUBLISHED" });
  assert.ok(reviewed.publishedAt);
});

test("attachment constraints, delivery markers and review cycles remain consistent", async (t) => {
  const { engine, database, user } = await fixture(t);
  const draft = await database.createSubmission({ type: "expense", creatorId: user.id, data: {} });
  const attachment = await database.createPendingAttachment({ submissionId: draft.id, uploaderId: user.id,
    kind: "primary", originalName: "synthetic.pdf", mimeType: "application/pdf", size: 10,
    blobPathname: `staff/${draft.id}/synthetic.pdf` });
  assert.equal((await database.listAttachments(draft.id)).length, 0);
  await assert.rejects(database.createPendingAttachment({ submissionId: draft.id, uploaderId: user.id,
    kind: "primary", originalName: "second.pdf", mimeType: "application/pdf", size: 10 }),
    { code: "23505", constraint: "attachments_one_primary_per_submission" });
  await database.markAttachmentReady(attachment.id, { blobPathname: attachment.blobPathname,
    blobUrl: "https://synthetic.private.blob.vercel-storage.com/synthetic.pdf",
    mimeType: "application/pdf", size: 10, sha256: "a".repeat(64) });
  assert.equal((await database.listAttachments(draft.id))[0].storageStatus, "ready");
  assert.equal(await database.getExpenseDeliveryState(draft.id), "ready");
  const entry = { user, targetType: "expense", targetId: draft.id, metadata: { deliveryKey: "1:fixture" } };
  await database.audit({ ...entry, action: "EXPENSE_NOTIFICATION_STARTED" });
  assert.equal(await database.getExpenseDeliveryState(draft.id), "uncertain");
  await database.audit({ ...entry, action: "EXPENSE_NOTIFICATION_SENT" });
  assert.equal(await database.getExpenseDeliveryState(draft.id, "1:fixture"), "sent");
  await database.setSubmissionStatus({ id: draft.id, status: "SUBMITTED", userId: user.id, event: "SUBMITTED" });
  await database.addReview({ submissionId: draft.id, reviewerId: user.id,
    decision: "needs_changes", comment: "Synthetic review", nextStatus: "NEEDS_CHANGES" });
  assert.equal(await database.getExpenseDeliveryState(draft.id), "ready");
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM attachments")).rows[0].count, 1);
});

test("HTTP session, draft persistence, ownership, real DOCX preparation and finalization against PostgreSQL", async (t) => {
  const { database, user } = await fixture(t);
  // PGlite is single-connection. Cross-connection lock contention is covered in
  // database.test.js; use a sequential lock adapter for this SQL/HTTP workflow.
  database.withSubmissionLock = async (_id, work) => work();
  const config = loadConfig({ environment: "test", appUrl: "http://localhost:3100",
    googleCallbackUrl: "http://localhost:3100/api/staff/auth/google/callback",
    allowedGoogleDomain: "example.test", allowedStaffEmails: [], adminEmails: [],
    financeNotificationEmail: "finance@example.test", storageDatabaseUrl: "postgresql://unused.invalid/test",
    sessionSecret: "synthetic-session-secret-for-test-only-1234567890", blobReadWriteToken: "",
    googleClientId: "", googleClientSecret: "", openAiApiKey: "",
    smtpHost: "", smtpUser: "", smtpPassword: "", mailFrom: "", enableDevAuth: false });
  async function sessionCookie(forUser, token) {
    await database.createSession({ tokenHash: createHash("sha256").update(token).digest("base64url"),
      userId: forUser.id, expiresAt: new Date(Date.now() + 3600000).toISOString(), userAgentHash: null, ipHash: null });
    return `${config.cookieName}=${token}`;
  }
  const cookie = await sessionCookie(user, "synthetic-owner-session");
  const other = await database.upsertUser({ googleSubject: "synthetic-other", email: "other@example.test", name: "Other" });
  const otherCookie = await sessionCookie(other, "synthetic-other-session");
  const sent = [];
  const { app } = createStaffApp({ config, database,
    privateAttachmentReader: async () => ({ buffer: Buffer.from("synthetic private PDF") }),
    mailService: { async sendExpenseSubmitted(message) { sent.push(message); } }
  });
  const session = await request(app).get("/api/staff/session").set("Cookie", cookie);
  assert.equal(session.body.authenticated, true);
  const write = (method, path, data) => request(app)[method](path).set("Cookie", cookie)
    .set("X-CSRF-Token", session.body.csrfToken).send(data);
  assert.equal((await request(app).post("/api/staff/submissions").set("Cookie", cookie)
    .send({ type: "expense" })).status, 403);
  const created = await write("post", "/api/staff/submissions", { type: "expense", data: {} });
  assert.equal(created.status, 201);
  const id = created.body.item.id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  const data = { project: "Synthetic workshop", person: "Synthetic Staff", date: "2026-09-01",
    location: "Tallinn", activity: "Hosted a workshop.", purpose: "Materials for the workshop.",
    result: "Ten participants completed the activity.", items: [{ date: "2026-09-01",
      documentNumber: "SYN-001", vendor: "Synthetic supplier", description: "Materials", amount: 12.35 }] };
  assert.equal((await write("patch", `/api/staff/submissions/${id}`, { data })).status, 200);
  const reopened = await request(app).get(`/api/staff/submissions/${id}`).set("Cookie", cookie);
  assert.equal(reopened.body.item.data.project, data.project);
  assert.equal((await request(app).get(`/api/staff/submissions/${id}`).set("Cookie", otherCookie)).status, 404);
  await database.createAttachment({ submissionId: id, uploaderId: user.id, originalName: "synthetic.pdf",
    mimeType: "application/pdf", kind: "primary", size: 21, storageName: "synthetic-local",
    sha256: "a".repeat(64) });
  const submitted = await write("post", `/api/staff/submissions/${id}/submit`, {});
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.item.status, "SUBMITTED");
  assert.ok(submitted.body.item.submittedAt);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].attachments[0].content.subarray(0, 2).toString(), "PK");
  assert.equal(sent[0].attachments.length, 2);
  assert.equal((await write("post", `/api/staff/submissions/${id}/submit`, {})).status, 200);
  assert.equal(sent.length, 1);
  assert.equal((await write("patch", `/api/staff/submissions/${id}`, { data })).status, 403);
  assert.equal((await request(app).get(`/api/staff/submissions/${id}`).set("Cookie", cookie)).body.item.status, "SUBMITTED");
});

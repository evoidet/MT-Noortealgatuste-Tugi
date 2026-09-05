import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import request from "supertest";
import { createStaffApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/database.js";
import { loadMigrations } from "../scripts/db-migrate.mjs";
import { renderSubmissionPreview } from "../public/previews.js";

test("data repair is ordered between immutable migrations 002 and 003", async () => {
  const migrations = await loadMigrations();
  assert.deepEqual(migrations.map((migration) => migration.version),
    ["001", "002", "002a", "003", "004", "005", "006"]);
});

async function fixture(t, versions = ["001", "002", "002a", "003", "004", "005", "006"]) {
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

test("old drafts save and finalize without the unrelated news column; migrations preserve data", async (t) => {
  const { engine, database, user, migrate } = await fixture(t, ["001", "002"]);
  const draft = await database.createSubmission({ type: "expense", creatorId: user.id,
    data: { project: "Preserve this synthetic draft" } });
  await assert.rejects(engine.query("UPDATE submissions SET published_at = CASE WHEN status = 'PUBLISHED' THEN NOW() ELSE published_at END WHERE id = $1", [draft.id]), (error) => {
    assert.equal(error.code, "42703");
    assert.match(error.message, /published_at/);
    return true;
  });
  assert.equal((await database.getSubmission(draft.id)).status, "DRAFT");
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM revisions")).rows[0].count, 1);
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
  for (const version of ["002a", "003", "004", "005", "005"]) await migrate(version);
  assert.deepEqual(await database.getSubmission(draft.id), finalized);
});

test("primary-attachment repair preserves rows and deterministically keeps the effective primary", async (t) => {
  const { engine, database, user, migrate } = await fixture(t, ["001", "002"]);
  const draft = await database.createSubmission({ type: "news", creatorId: user.id, data: {} });
  const rows = [
    ["pending-oldest", "pending", "2026-01-01T00:00:00.000Z"],
    ["ready-first", "ready", "2026-01-02T00:00:00.000Z"],
    ["ready-second", "ready", "2026-01-03T00:00:00.000Z"]
  ];
  for (const [id, storageStatus, createdAt] of rows) {
    await engine.query(`INSERT INTO attachments (
      id, submission_id, uploader_id, storage_name, storage_status,
      blob_pathname, blob_url, original_name, mime_type, kind, size_bytes,
      sha256, created_at, storage_updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'image/png', 'primary', 10,
      $9, $10, $10)`, [id, draft.id, user.id,
      storageStatus === "ready" ? `storage-${id}` : null,
      storageStatus, `staff/${draft.id}/${id}.png`,
      storageStatus === "ready" ? `https://synthetic.invalid/${id}.png` : null,
      `${id}.png`, id.padEnd(64, "0"), createdAt]);
  }
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM attachments")).rows[0].count, 3);
  await assert.rejects(migrate("003"), {
    code: "23505", constraint: "attachments_one_primary_per_submission"
  });
  assert.equal((await engine.query(`SELECT count(*)::int AS count
    FROM information_schema.columns WHERE table_name = 'submissions'
      AND column_name = 'published_at'`)).rows[0].count, 0);
  assert.equal((await engine.query(`SELECT count(*)::int AS count FROM schema_migrations
    WHERE version = '003'`)).rows[0].count, 0);
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM attachments")).rows[0].count, 3);
  await migrate("002a");
  await migrate("002a");
  await migrate("003");
  const repaired = (await engine.query(`SELECT id, kind, storage_status FROM attachments
    ORDER BY created_at, id`)).rows;
  assert.deepEqual(repaired.map((row) => [row.id, row.kind]), [
    ["pending-oldest", "additional"],
    ["ready-first", "primary"],
    ["ready-second", "additional"]
  ]);
  assert.equal(repaired.length, 3);
  assert.equal((await database.listAttachments(draft.id))[0].id, "ready-first");
  await assert.rejects(database.createPendingAttachment({ submissionId: draft.id, uploaderId: user.id,
    kind: "primary", originalName: "blocked.png", mimeType: "image/png", size: 10 }),
    { code: "23505", constraint: "attachments_one_primary_per_submission" });
});

test("repair migration restores schema drift and all final states preserve timestamps", async (t) => {
  const { engine, database, user, migrate } = await fixture(t);
  // Simulate a drifted installation that claims 003 but lacks its column/index.
  await engine.exec("DROP INDEX submissions_published_news_idx; ALTER TABLE submissions DROP COLUMN published_at");
  await database.assertSubmissionSchema();
  await assert.rejects(database.assertNewsPublicationSchema(), {
    code: "42703", table: "submissions", operation: "news_publish"
  });
  await migrate("005");
  await migrate("005");
  await database.assertNewsPublicationSchema();
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

test("HTTP expense flow prepares real DOCX, sends once and finalizes without published_at", async (t) => {
  const { engine, database, user } = await fixture(t);
  await engine.exec("DROP INDEX submissions_published_news_idx; ALTER TABLE submissions DROP COLUMN published_at");
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

test("Workspace member news draft, preview, submit and admin publication use the public news model", async (t) => {
  const { engine, database } = await fixture(t);
  database.withSubmissionLock = async (_id, work) => work();
  const owner = await database.upsertUser({ googleSubject: "news-owner", email: "writer@noortetugi.ee", name: "Writer" });
  const admin = await database.upsertUser({ googleSubject: "news-admin", email: "reviewer@noortetugi.ee", name: "Reviewer", role: "admin" });
  const outsider = await database.upsertUser({ googleSubject: "news-other", email: "other@noortetugi.ee", name: "Other" });
  const config = loadConfig({ environment: "test", appUrl: "http://localhost:3100",
    googleCallbackUrl: "http://localhost:3100/api/staff/auth/google/callback",
    allowedGoogleDomain: "noortetugi.ee", allowedStaffEmails: [], adminEmails: ["reviewer@noortetugi.ee"],
    storageDatabaseUrl: "postgresql://unused.invalid/test", sessionSecret: "synthetic-session-secret-for-test-only-1234567890",
    blobReadWriteToken: "", googleClientId: "", googleClientSecret: "", openAiApiKey: "",
    smtpHost: "", smtpUser: "", smtpPassword: "", mailFrom: "", enableDevAuth: false });
  const { app } = createStaffApp({
    config,
    database,
    driveArchiveService: {
      enabled: true,
      async archiveExpense() { assert.fail("News must not use the expense Drive archive"); }
    },
    mailService: {
      async sendExpenseSubmitted() { assert.fail("News must not send finance mail"); }
    }
  });
  async function client(user) {
    const token = `synthetic-${user.id}`;
    await database.createSession({ tokenHash: createHash("sha256").update(token).digest("base64url"),
      userId: user.id, expiresAt: new Date(Date.now() + 3600000).toISOString(), userAgentHash: null, ipHash: null });
    const cookie = `${config.cookieName}=${token}`;
    const session = await request(app).get("/api/staff/session").set("Cookie", cookie);
    return { session: session.body, get: (path) => request(app).get(path).set("Cookie", cookie),
      write: (method, path, data) => request(app)[method](path).set("Cookie", cookie)
        .set("X-CSRF-Token", session.body.csrfToken).send(data) };
  }
  const writer = await client(owner);
  const reviewer = await client(admin);
  const other = await client(outsider);
  assert.ok(writer.session.permissions.includes("news:create"));
  assert.ok(!writer.session.permissions.includes("news:review"));
  assert.equal((await request(app).post("/api/staff/submissions").send({ type: "news" })).status, 401);
  const created = await writer.write("post", "/api/staff/submissions", { type: "news", data: {} });
  assert.equal(created.status, 201);
  const id = created.body.item.id;
  const path = `/api/staff/submissions/${id}`;
  const data = { slug: "synthetic-news", date: "2026-09-05", title: "Noorte uudis",
    summary: "Ühine töötuba", content: ["Pikk uudise tekst."], author: "Writer",
    translations: { en: { title: "Youth news", excerpt: "A workshop", content: ["Workshop story."] } } };
  assert.equal((await writer.write("patch", path, { data })).status, 200);
  const reopened = await writer.get(path);
  assert.equal(reopened.body.item.data.title, data.title);
  assert.equal((await other.get(path)).status, 404);
  assert.equal((await other.write("patch", path, { data })).status, 403);
  assert.equal((await writer.write("post", "/api/staff/submissions", { type: "invoice" })).status, 403);
  assert.equal((await writer.get("/api/staff/audit")).status, 403);
  assert.equal((await writer.get("/api/staff/export/news")).status, 403);
  const expense = await database.createSubmission({ type: "expense", creatorId: outsider.id, data: {} });
  await database.setSubmissionStatus({ id: expense.id, status: "SUBMITTED", userId: outsider.id, event: "SUBMITTED" });
  assert.equal((await writer.write("post", `/api/staff/submissions/${expense.id}/review`, { decision: "approve" })).status, 403);
  const image = await database.createAttachment({ submissionId: id, uploaderId: owner.id, originalName: "synthetic.png",
    mimeType: "image/png", kind: "primary", size: 10, storageName: "synthetic-image", sha256: "a".repeat(64) });
  const publicImagePath = `/api/staff/public/news/${id}/attachments/${image.id}`;
  assert.equal((await request(app).get(publicImagePath)).status, 404);
  assert.equal((await request(app).get("/api/staff/public/news")).body.items.length, 0);
  // The same escaped renderer is used by the browser preview.
  globalThis.window = { I18N: { t: (key) => key, locale: () => "et-EE" } };
  try {
    const html = renderSubmissionPreview("news", reopened.body.item.data);
    assert.match(html, /Noorte uudis/);
    assert.match(html, /Pikk uudise tekst/);
  } finally { delete globalThis.window; }
  const submitted = await writer.write("post", `${path}/submit`, {});
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.item.status, "SUBMITTED");
  assert.equal(submitted.body.item.publishedAt, null);
  assert.equal((await request(app).get("/api/staff/public/news")).body.items.length, 0);
  assert.equal((await writer.write("post", `${path}/review`, { decision: "approve" })).status, 403);
  assert.equal((await writer.write("patch", path, { data })).status, 403);
  // Publication preflight fails before changing a review or status; repair is repeatable.
  await engine.exec("DROP INDEX submissions_published_news_idx; ALTER TABLE submissions DROP COLUMN published_at");
  assert.equal((await reviewer.write("post", `${path}/review`, { decision: "approve" })).status, 503);
  assert.equal((await database.getSubmission(id)).status, "SUBMITTED");
  assert.equal((await database.listReviews(id)).length, 0);
  const migration = (await loadMigrations()).find((entry) => entry.version === "005");
  await engine.exec(migration.sql);
  await engine.exec(migration.sql);
  const published = await reviewer.write("post", `${path}/review`, { decision: "approve" });
  assert.equal(published.status, 200);
  assert.equal(published.body.item.status, "PUBLISHED");
  assert.ok(published.body.item.publishedAt);
  const feed = await request(app).get("/api/staff/public/news?lang=et");
  assert.equal(feed.body.items[0].id, data.slug);
  assert.equal(feed.body.items[0].title, data.title);
  assert.equal(feed.body.items[0].image, publicImagePath);
  assert.equal((await request(app).get("/api/staff/public/news?lang=en")).body.items[0].title, "Youth news");
});

test("Drive archive migration stores retry state without changing submissions or attachments", async (t) => {
  const { engine, database } = await fixture(t);
  const user = await database.upsertUser({ googleSubject: "drive-schema-user",
    email: "archive@noortetugi.ee", name: "Archive User", role: "member" });
  const submission = await database.createSubmission({ type: "expense", creatorId: user.id, data: {} });
  const before = await database.getSubmission(submission.id);

  await database.assertDriveArchiveSchema();
  const failed = await database.recordDriveArchive({
    submissionId: submission.id,
    status: "failed",
    errorCode: "DRIVE_TEMPORARY_FAILURE"
  });
  assert.equal(failed.status, "failed");
  const complete = await database.recordDriveArchive({
    submissionId: submission.id,
    parentFolderId: "personal-folder-12345",
    folderId: "archive-folder-123456",
    folderUrl: "https://drive.google.com/drive/folders/archive-folder-123456",
    status: "complete",
    archivedAt: "2026-09-05T12:00:00.000Z"
  });
  assert.equal(complete.status, "complete");
  assert.equal((await database.getDriveArchive(submission.id)).folderId, "archive-folder-123456");
  assert.deepEqual(await database.getSubmission(submission.id), before);
  const indexes = await engine.query(`SELECT indexname FROM pg_indexes
    WHERE indexname = 'submission_drive_archives_status_idx'`);
  assert.equal(indexes.rows.length, 1);
});

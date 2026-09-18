import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import request from "supertest";
import { newsWorkflowFixture } from "./helpers/news-workflow-fixture.mjs";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl+X58AAAAASUVORK5CYII=",
  "base64"
);
const article = { title: "Noorte töötuba", content: ["Noored osalesid ühises töötoas."] };

async function fixture(t) {
  const value = await newsWorkflowFixture();
  t.after(() => value.close());
  async function authenticated(role) {
    const cookie = `${value.config.cookieName}=synthetic-${role}`;
    const session = await request(value.app).get("/api/staff/session").set("Cookie", cookie);
    assert.equal(session.status, 200);
    assert.equal(session.body.authenticated, true);
    return {
      write(method, path, body = {}, idempotencyKey) {
        const operation = request(value.app)[method](path).set("Cookie", cookie)
          .set("X-CSRF-Token", session.body.csrfToken);
        if (idempotencyKey !== undefined) operation.set("Idempotency-Key", idempotencyKey);
        return operation.send(body);
      },
      get(path) { return request(value.app).get(path).set("Cookie", cookie); }
    };
  }
  return { ...value, writer: await authenticated("writer"), reviewer: await authenticated("reviewer") };
}

async function draft(actor, data = article, idempotencyKey) {
  const response = await actor.write("post", "/api/staff/submissions", { type: "news", data }, idempotencyKey);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.item;
}

test("News HTTP create replays are durable, ownership scoped and do not reset saved or submitted data", async (t) => {
  const { app, writer, reviewer, reader, engine } = await fixture(t);
  const key = randomUUID();
  const created = await draft(writer, article, key.toUpperCase());
  assert.equal(created.id, key);
  const path = `/api/staff/submissions/${created.id}`;
  const edited = { ...article, title: "Saved title", content: ["Saved article body"] };
  assert.equal((await writer.write("patch", path, { data: edited })).status, 200);
  const [first, second] = await Promise.all([
    writer.write("post", "/api/staff/submissions", { type: "news", data: article }, key),
    writer.write("post", "/api/staff/submissions", { type: "news", data: article }, key)
  ]);
  for (const response of [first, second]) {
    assert.equal(response.status, 201);
    assert.equal(response.body.replayed, true);
    assert.equal(response.body.item.id, created.id);
    assert.equal(response.body.item.data.title, edited.title);
    assert.equal(response.body.item.revision, 2);
  }
  const conflicting = await reviewer.write("post", "/api/staff/submissions", { type: "news", data: article }, key);
  assert.equal(conflicting.status, 409);
  assert.equal(conflicting.body.error, "IDEMPOTENCY_KEY_CONFLICT");
  assert.equal((await writer.write("post", "/api/staff/submissions", { type: "news", data: article }, "bad-key")).status, 400);
  assert.equal((await request(app).post("/api/staff/submissions").send({ type: "news", data: article })).status, 401);
  const submitted = await writer.write("post", `${path}/submit`);
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.item.status, "SUBMITTED");
  const repeated = await writer.write("post", "/api/staff/submissions", { type: "news", data: article }, key);
  assert.equal(repeated.status, 201);
  assert.equal(repeated.body.item.status, "SUBMITTED");
  assert.equal(repeated.body.item.revision, submitted.body.item.revision);
  assert.equal((await reader.getSubmission(created.id)).data.title, edited.title);
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM submissions")).rows[0].count, 1);
});

test("News image intent replays normalize filenames, preserve Blob paths and recover completed uploads", async (t) => {
  const { app, reviewer, reader, state, makeApp, engine } = await fixture(t);
  const adminPage = await request(app).get("/admin/");
  assert.match(adminPage.headers["content-security-policy"], /img-src 'self' https: data: blob:/);
  const created = await draft(reviewer);
  const path = `/api/staff/submissions/${created.id}`;
  const key = randomUUID();
  const metadata = { kind: "primary", originalName: `C:\\fakepath\\${"📷".repeat(120)}.png`,
    mimeType: "image/png", size: png.length };
  const first = await reviewer.write("post", `${path}/attachments/upload-intent`, metadata, key);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.upload.attachmentId, key);
  const pending = await reader.getAttachment(key, { includePending: true });
  assert.equal(pending.storageStatus, "pending");
  assert.ok(pending.originalName.length <= 180);
  assert.ok(pending.originalName.endsWith(".png"));
  assert.equal(pending.originalName.includes("fakepath"), false);
  const replay = await reviewer.write("post", `${path}/attachments/upload-intent`, metadata, key.toUpperCase());
  assert.equal(replay.status, 201);
  assert.equal(replay.body.upload.attachmentId, key);
  assert.equal(replay.body.upload.uploadUrl, first.body.upload.uploadUrl);
  assert.equal((await reviewer.write("post", `${path}/attachments/upload-intent`,
    { ...metadata, size: png.length + 1 }, key)).status, 409);
  assert.equal((await reviewer.write("post", `${path}/attachments/upload-intent`, metadata, "not-a-uuid")).status, 400);
  assert.equal((await reviewer.write("post", `${path}/attachments/upload-intent`,
    { kind: "additional", originalName: "document.pdf", mimeType: "application/pdf", size: 100 }, randomUUID())).status, 400);
  state.blobs.set(pending.blobPathname, png);
  const completed = await reviewer.write("post", `${path}/attachments/${key}/complete`);
  assert.equal(completed.status, 201, JSON.stringify(completed.body));
  assert.equal(completed.body.attachment.mimeType, "image/png");
  const readyGrant = await reviewer.write("post", `${path}/attachments/upload-intent`, metadata, key);
  assert.equal(readyGrant.status, 200);
  assert.deepEqual(readyGrant.body.upload, { attachmentId: key, status: "ready" });
  assert.equal((await reviewer.write("post", `${path}/attachments/${key}/complete`)).status, 200);
  const publicImage = `/api/staff/public/news/${created.id}/attachments/${key}`;
  assert.equal((await request(app).get(publicImage)).status, 404);
  assert.equal((await reviewer.write("patch", path, { data: { ...article, mainImageAttachmentId: key } })).status, 200);
  const published = await reviewer.write("post", `${path}/submit`);
  assert.equal(published.status, 200);
  assert.equal(published.body.item.status, "PUBLISHED");
  // A fresh app instance reads the persisted database/Blob records. Public
  // images never depend on an in-memory form object or a temporary pathname.
  const freshApp = makeApp();
  const item = await request(freshApp).get(`/api/staff/public/news/${published.body.item.data.slug}`);
  assert.equal(item.status, 200);
  assert.equal(item.body.item.image, publicImage);
  const imageResponse = await request(freshApp).get(publicImage);
  assert.equal(imageResponse.status, 200);
  assert.match(imageResponse.headers["content-type"], /^image\/png/);
  assert.deepEqual(imageResponse.body, png);
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM attachments")).rows[0].count, 1);
});

test("News rejects missing, pending or foreign image references and revalidates reviewer approval", async (t) => {
  const { reviewer, writer, database, reader, users, engine } = await fixture(t);
  const created = await draft(reviewer);
  const path = `/api/staff/submissions/${created.id}`;
  const pending = await database.createPendingAttachment({ submissionId: created.id, uploaderId: users.reviewer.id,
    kind: "primary", originalName: "pending.png", mimeType: "image/png", size: png.length,
    blobPathname: `staff-attachments/${"a".repeat(64)}.png` });
  const foreign = await draft(writer);
  const foreignImage = await database.createAttachment({ submissionId: foreign.id, uploaderId: users.writer.id,
    kind: "primary", originalName: "foreign.png", mimeType: "image/png", size: png.length,
    blobPathname: `staff-attachments/${"b".repeat(64)}.png`,
    blobUrl: `https://synthetic.private.blob.vercel-storage.com/staff-attachments/${"b".repeat(64)}.png` });
  const additional = await database.createAttachment({ submissionId: created.id, uploaderId: users.reviewer.id,
    kind: "additional", originalName: "additional.png", mimeType: "image/png", size: png.length,
    blobPathname: `staff-attachments/${"c".repeat(64)}.png`,
    blobUrl: `https://synthetic.private.blob.vercel-storage.com/staff-attachments/${"c".repeat(64)}.png` });
  for (const id of [randomUUID(), pending.id, foreignImage.id, additional.id]) {
    assert.equal((await reviewer.write("patch", path, { data: { ...article, mainImageAttachmentId: id } })).status, 200);
    const response = await reviewer.write("post", `${path}/submit`);
    assert.equal(response.status, 422, JSON.stringify(response.body));
    assert.equal(response.body.error, "VALIDATION_ERROR");
    assert.equal((await reader.getSubmission(created.id)).status, "DRAFT");
  }
  const submitted = await writer.write("post", `/api/staff/submissions/${foreign.id}/submit`);
  assert.equal(submitted.status, 200);
  // Simulate an incomplete older submission: approval must validate the
  // actual persisted content rather than trusting an earlier submit result.
  await engine.query("UPDATE submissions SET data_json = $2::jsonb WHERE id = $1", [foreign.id, JSON.stringify({ title: "Missing body" })]);
  const invalidBody = await reviewer.write("post", `/api/staff/submissions/${foreign.id}/review`, { decision: "approve" });
  assert.equal(invalidBody.status, 422, JSON.stringify(invalidBody.body));
  assert.equal(invalidBody.body.error, "INCOMPLETE_SUBMISSION");
  await engine.query("UPDATE submissions SET data_json = $2::jsonb WHERE id = $1", [foreign.id,
    JSON.stringify({ ...article, mainImageAttachmentId: pending.id })]);
  const invalidImage = await reviewer.write("post", `/api/staff/submissions/${foreign.id}/review`, { decision: "approve" });
  assert.equal(invalidImage.status, 422);
  assert.equal(invalidImage.body.error, "VALIDATION_ERROR");
  assert.equal((await reader.getSubmission(foreign.id)).status, "SUBMITTED");
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM reviews")).rows[0].count, 0);
});

test("News finalization failure retains the draft and a retry publishes exactly once", async (t) => {
  const { reviewer, reader, state, engine, app } = await fixture(t);
  const created = await draft(reviewer);
  const path = `/api/staff/submissions/${created.id}`;
  state.failFinalization = true;
  const failed = await reviewer.write("post", `${path}/submit`);
  assert.equal(failed.status, 500);
  assert.equal(failed.body.error, "REQUEST_FAILED");
  const saved = await reader.getSubmission(created.id);
  assert.equal(saved.status, "DRAFT");
  assert.deepEqual(saved.data.content, article.content);
  assert.equal((await request(app).get(`/api/staff/public/news/${saved.data.slug}`)).status, 404);
  const retry = await reviewer.write("post", `${path}/submit`);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.item.status, "PUBLISHED");
  const revision = retry.body.item.revision;
  const repeated = await reviewer.write("post", `${path}/submit`);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.item.revision, revision);
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM submissions WHERE status = 'PUBLISHED'")).rows[0].count, 1);
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM revisions WHERE event = 'PUBLISHED'")).rows[0].count, 1);
  const publicItem = await request(app).get(`/api/staff/public/news/${saved.data.slug}`);
  assert.equal(publicItem.status, 200);
  assert.equal(publicItem.body.item.title, article.title);
  assert.deepEqual(publicItem.body.item.content, article.content);
});

test("public News API pages past 25 articles and resolves older slugs without exposing drafts", async (t) => {
  const { app, engine, users, writer } = await fixture(t);
  await engine.query(`INSERT INTO submissions (id, type, creator_id, status, data_json, created_at, updated_at, published_at)
    SELECT 'published-' || value, 'news', $1, 'PUBLISHED',
      jsonb_build_object('slug', 'public-' || value, 'title', 'Article ' || value,
        'content', jsonb_build_array('Article text'), 'featured', CASE WHEN value = 1 THEN 'legacy-value' ELSE 'false' END),
      NOW(), NOW(), NOW() - value * INTERVAL '1 minute' FROM generate_series(1, 28) AS value`, [users.writer.id]);
  const unpublished = await draft(writer, { ...article, slug: "unpublished" });
  const first = await request(app).get("/api/staff/public/news");
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 25);
  assert.equal(first.body.nextOffset, 25);
  assert.equal(first.headers["cache-control"], "no-store");
  const second = await request(app).get(`/api/staff/public/news?offset=${first.body.nextOffset}`);
  assert.equal(second.status, 200);
  assert.equal(second.body.items.length, 3);
  assert.equal(second.body.nextOffset, null);
  assert.equal(new Set([...first.body.items, ...second.body.items].map((item) => item.id)).size, 28);
  const old = await request(app).get("/api/staff/public/news/public-28");
  assert.equal(old.status, 200);
  assert.equal(old.headers["cache-control"], "no-store");
  assert.equal(old.body.item.title, "Article 28");
  assert.equal(old.body.item.excerpt, "");
  for (const slug of ["unpublished", `news-${unpublished.id}`, "does-not-exist", "INVALID_SLUG"]) {
    assert.equal((await request(app).get(`/api/staff/public/news/${slug}`)).status, 404);
  }
  for (const offset of ["-1", "1.5", "invalid", "1000001"]) {
    const invalid = await request(app).get(`/api/staff/public/news?offset=${offset}`);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, "INVALID_OFFSET");
  }
});

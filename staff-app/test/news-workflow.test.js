import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import request from "supertest";
import { createStaffApp } from "../src/app.js";
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

test("News drafts accept temporary invalid URLs and final submit identifies the exact field", async (t) => {
  const { reviewer, engine, reader } = await fixture(t);
  const created = await draft(reviewer);
  const path = `/api/staff/submissions/${created.id}`;
  for (const [field, message] of [
    ["registrationUrl", "Registration URL is invalid."], ["image", "Image URL is invalid."]
  ]) {
    const data = { ...article, [field]: "https://user:password@example.org/private" };
    const createResponse = await reviewer.write("post", "/api/staff/submissions", { type: "news", data });
    const patchResponse = await reviewer.write("patch", path, { data });
    assert.equal(createResponse.status, 201, JSON.stringify(createResponse.body));
    assert.equal(patchResponse.status, 200, JSON.stringify(patchResponse.body));
    // An older persisted draft is revalidated at final submission as well.
    await engine.query("UPDATE submissions SET data_json = $2::jsonb WHERE id = $1", [created.id, JSON.stringify(data)]);
    const responses = [await reviewer.write("post", `${path}/submit`)];
    for (const response of responses) {
      assert.equal(response.status, 422, JSON.stringify(response.body));
      assert.equal(response.body.ok, false);
      assert.equal(response.body.error, "VALIDATION_ERROR");
      assert.equal(response.body.field, field);
      assert.equal(response.body.message, message);
      assert.deepEqual(response.body.fields, [{ field, message }]);
      assert.equal(JSON.stringify(response.body).includes("password"), false);
      assert.equal(JSON.stringify(response.body).includes("stack"), false);
    }
    assert.equal((await reader.getSubmission(created.id)).status, "DRAFT");
  }
  const bothDraft = await reviewer.write("post", "/api/staff/submissions", {
    type: "news", data: { ...article, registrationUrl: "bad registration", image: "bad image" }
  });
  assert.equal(bothDraft.status, 201);
  const both = await reviewer.write("post", `/api/staff/submissions/${bothDraft.body.item.id}/submit`);
  assert.deepEqual(both.body.fields, [
    { field: "registrationUrl", message: "Registration URL is invalid." },
    { field: "image", message: "Image URL is invalid." }
  ]);
});

test("News saves uploaded image URLs automatically with Google Forms links or no registration link", async (t) => {
  const { app, reviewer, reader, state } = await fixture(t);
  for (const registrationUrl of [
    "  https://forms.gle/XXXXXXXX  ",
    "https://docs.google.com/forms/d/e/XXXXXXXX/viewform",
    "   "
  ]) {
    const created = await draft(reviewer, { ...article, registrationUrl });
    const path = `/api/staff/submissions/${created.id}`;
    const intent = await reviewer.write("post", `${path}/attachments/upload-intent`, {
      originalName: "url-test.png", mimeType: "image/png", size: png.length, kind: "primary"
    });
    assert.equal(intent.status, 201, JSON.stringify(intent.body));
    const imageId = intent.body.upload.attachmentId;
    const pending = await reader.getAttachment(imageId, { includePending: true });
    state.blobs.set(pending.blobPathname, png);
    const complete = await reviewer.write("post", `${path}/attachments/${imageId}/complete`);
    assert.equal(complete.status, 201, JSON.stringify(complete.body));
    const savedImage = await reader.getAttachment(imageId);
    assert.equal(savedImage.storageStatus, "ready");
    assert.match(savedImage.blobUrl, /^https:\/\/synthetic\.private\.blob\.vercel-storage\.com\//);
    const published = await reviewer.write("post", `${path}/submit`);
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.equal(published.body.item.status, "PUBLISHED");
    const savedArticle = await reader.getSubmission(created.id);
    assert.equal(savedArticle.data.registrationUrl, registrationUrl.trim());
    const publicArticle = state.publishedNews.find((item) => item.submissionId === created.id);
    assert.equal(publicArticle.registrationUrl, registrationUrl.trim());
    assert.equal(new URL(publicArticle.image).pathname, `/api/staff/public/news/${created.id}/attachments/${imageId}`);
    assert.equal(JSON.stringify(publicArticle).includes("private.blob"), false);
    const publicImage = await request(app).get(new URL(publicArticle.image).pathname);
    assert.equal(publicImage.status, 200);
    assert.deepEqual(publicImage.body, png);
  }
});

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
  assert.equal(submitted.body.item.status, "PUBLISHED");
  const repeated = await writer.write("post", "/api/staff/submissions", { type: "news", data: article }, key);
  assert.equal(repeated.status, 201);
  assert.equal(repeated.body.item.status, "PUBLISHED");
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
  const missingBlob = await reviewer.write("post", `${path}/attachments/${key}/complete`);
  assert.equal(missingBlob.status, 404);
  assert.equal(missingBlob.body.error, "BLOB_NOT_FOUND");
  assert.equal(missingBlob.body.stage, "upload");
  assert.equal(missingBlob.body.field, "image");
  assert.equal(missingBlob.body.message, "Image upload failed.");
  assert.equal((await reader.getAttachment(key, { includePending: true })).storageStatus, "pending");
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
  const item = state.publishedNews.find((entry) => entry.submissionId === created.id);
  assert.equal(new URL(item.image).pathname, publicImage);
  const imageResponse = await request(freshApp).get(publicImage);
  assert.equal(imageResponse.status, 200);
  assert.match(imageResponse.headers["content-type"], /^image\/png/);
  assert.deepEqual(imageResponse.body, png);
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM attachments")).rows[0].count, 1);
});

test("News rejects missing, pending or foreign image references", async (t) => {
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
  assert.equal((await reader.getSubmission(foreign.id)).status, "DRAFT");
});

test("News finalization failure retains the draft and an idempotent retry finalizes the same repository article", async (t) => {
  const { reviewer, reader, state, engine, app } = await fixture(t);
  const created = await draft(reviewer);
  const path = `/api/staff/submissions/${created.id}`;
  state.failFinalization = true;
  const failed = await reviewer.write("post", `${path}/submit`);
  assert.equal(failed.status, 500);
  assert.equal(failed.body.error, "NEWS_SUBMIT_FAILED");
  assert.equal(failed.body.stage, "database");
  const saved = await reader.getSubmission(created.id);
  assert.equal(saved.status, "DRAFT");
  assert.deepEqual(saved.data.content, article.content);
  assert.equal(state.publishedNews.length, 1);
  const retry = await reviewer.write("post", `${path}/submit`);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.item.status, "PUBLISHED");
  const revision = retry.body.item.revision;
  const repeated = await reviewer.write("post", `${path}/submit`);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.item.revision, revision);
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM submissions WHERE status = 'PUBLISHED'")).rows[0].count, 1);
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM revisions WHERE event = 'PUBLISHED'")).rows[0].count, 1);
  assert.equal(state.publishedNews.length, 1);
  assert.equal(state.publishedNews[0].title, article.title);
  assert.deepEqual(state.publishedNews[0].content, article.content);
});

test("an authorized published edit updates the same UUID and remains idempotent", async (t) => {
  const { reviewer, reader, state } = await fixture(t);
  const created = await draft(reviewer, { ...article, slug: "same-article" });
  const path = `/api/staff/submissions/${created.id}`;
  assert.equal((await reviewer.write("post", `${path}/submit`)).status, 200);
  const edited = { ...article, slug: "same-article", links: [
    { label: "Rohkem infot", url: "https://drive.google.com/file/d/example/view" },
    { label: "Registreeru", url: "https://forms.gle/example" }
  ] };
  const saved = await reviewer.write("patch", path, { data: edited });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.item.status, "PUBLISHED");
  assert.equal(saved.body.item.data.publicationPending, true);
  const republished = await reviewer.write("post", `${path}/submit`);
  assert.equal(republished.status, 200, JSON.stringify(republished.body));
  assert.equal(republished.body.item.id, created.id);
  assert.equal(republished.body.item.data.publicationPending, false);
  assert.equal(state.publishedNews.length, 1);
  assert.equal(state.publishedNews[0].submissionId, created.id);
  assert.equal(state.publishedNews[0].id, "same-article");
  assert.deepEqual(state.publishedNews[0].links, edited.links);
  const revision = republished.body.item.revision;
  assert.equal((await reviewer.write("post", `${path}/submit`)).body.item.revision, revision);
  assert.equal((await reader.getSubmission(created.id)).status, "PUBLISHED");
});

test("Detect to Protect keeps its identity while replacing the standalone URL with two CTAs", async (t) => {
  const { reviewer, state } = await fixture(t);
  const drive = "https://drive.google.com/file/d/13RPUWnFmn0ZCOxL1NhGIVkXiEGU0gB8B/view?usp=sharing";
  const created = await draft(reviewer, {
    title: "Detect to Protect", slug: "detect-to-protect", image: "https://example.org/detect.jpg",
    content: ["Meil on suur rõõm teatada, et meie esimene Erasmus+ projekt „Detect to Protect“ on alanud.", drive]
  });
  const response = await reviewer.write("post", `/api/staff/submissions/${created.id}/submit`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const item = state.publishedNews[0];
  assert.equal(item.submissionId, created.id);
  assert.equal(item.id, "detect-to-protect");
  assert.equal(new URL(item.image).pathname, "/detect.jpg");
  assert.equal(item.content.includes(drive), false);
  assert.deepEqual(item.links, [
    { label: "Rohkem infot", url: drive },
    { label: "Registreeru", url: "https://docs.google.com/forms/d/e/1FAIpQLSdplr-1qJB0OuEBsfPKmByK4zJK_UitA9sOHVQdI9G78t0_mA/viewform" }
  ]);
  assert.equal(state.publishedNews.length, 1);
});

test("GitHub publication failure is safe, specific and leaves the news draft retryable", async (t) => {
  const { reviewer, reader, state } = await fixture(t);
  const created = await draft(reviewer);
  state.failPublish = true;
  const failed = await reviewer.write("post", `/api/staff/submissions/${created.id}/submit`);
  assert.equal(failed.status, 503);
  assert.equal(failed.body.error, "GITHUB_PUBLISH_FAILED");
  assert.equal(failed.body.stage, "github");
  assert.doesNotMatch(JSON.stringify(failed.body), /Synthetic|stack/);
  assert.equal((await reader.getSubmission(created.id)).status, "DRAFT");
  assert.equal(state.publishedNews.length, 0);
  state.failPublish = false;
  const retry = await reviewer.write("post", `/api/staff/submissions/${created.id}/submit`);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.item.status, "PUBLISHED");
  assert.equal(state.publishedNews.length, 1);
});

test("News response dependencies are read before committing create, save and submit", async (t) => {
  const { reviewer, database, reader, engine } = await fixture(t);
  let committed = false;
  const reviews = database.listReviews.bind(database);
  const attachments = database.listAttachments.bind(database);
  database.listReviews = async (...args) => {
    if (committed) throw Object.assign(new Error("Post-commit read unavailable"), { code: "ECONNRESET" });
    return reviews(...args);
  };
  database.listAttachments = async (...args) => {
    if (committed) throw Object.assign(new Error("Post-commit read unavailable"), { code: "ECONNRESET" });
    return attachments(...args);
  };
  for (const method of ["createSubmission", "updateSubmission", "setSubmissionStatus"]) {
    const original = database[method].bind(database);
    database[method] = async (...args) => {
      const result = await original(...args);
      committed = true;
      return result;
    };
  }
  const created = await draft(reviewer);
  const path = `/api/staff/submissions/${created.id}`;
  const image = await database.createAttachment({ submissionId: created.id, uploaderId: created.creatorId,
    kind: "primary", originalName: "photo.png", mimeType: "image/png", size: png.length,
    blobPathname: `staff-attachments/${"e".repeat(64)}.png`,
    blobUrl: `https://synthetic.private.blob.vercel-storage.com/staff-attachments/${"e".repeat(64)}.png` });
  committed = false;
  const edited = { ...article, title: "Saved response survives", mainImageAttachmentId: image.id,
    slug: "response-survives", date: "2026-09-18" };
  const saved = await reviewer.write("patch", path, { data: edited });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.item.attachments[0].id, image.id);
  committed = false;
  const submitted = await reviewer.write("post", `${path}/submit`);
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  assert.equal(submitted.body.item.status, "PUBLISHED");
  assert.equal(submitted.body.item.attachments[0].id, image.id);
  assert.equal((await reader.getSubmission(created.id)).status, "PUBLISHED");
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM submissions")).rows[0].count, 1);
});

test("News response preparation fails before a status change and reports a safe stage", async (t) => {
  const { reviewer, database, reader } = await fixture(t);
  const created = await draft(reviewer);
  const original = database.listReviews;
  database.listReviews = async () => {
    throw Object.assign(new Error("sensitive diagnostic must not be returned"), { code: "ECONNRESET" });
  };
  const failed = await reviewer.write("post", `/api/staff/submissions/${created.id}/submit`);
  assert.equal(failed.status, 500);
  assert.equal(failed.body.error, "NEWS_SUBMIT_FAILED");
  assert.equal(failed.body.ok, false);
  assert.equal(failed.body.stage, "response");
  assert.ok(failed.body.message);
  assert.doesNotMatch(JSON.stringify(failed.body), /sensitive|ECONNRESET/);
  assert.equal((await reader.getSubmission(created.id)).status, "DRAFT");
  database.listReviews = original;
  assert.equal((await reviewer.write("post", `/api/staff/submissions/${created.id}/submit`)).status, 200);
});

test("News database and upload-grant failures expose safe stage-specific errors and retain retryable drafts", async (t) => {
  const { reviewer, database, reader, config, engine } = await fixture(t);
  const created = await draft(reviewer);
  const failure = () => { throw Object.assign(new Error("private provider diagnostic"), { code: "ECONNRESET" }); };
  const create = database.createSubmission;
  database.createSubmission = async () => failure();
  const createFailed = await reviewer.write("post", "/api/staff/submissions", { type: "news", data: article });
  database.createSubmission = create;
  assert.equal(createFailed.status, 500);
  assert.equal(createFailed.body.error, "NEWS_CREATE_FAILED");
  assert.equal(createFailed.body.stage, "database");
  const update = database.updateSubmission;
  database.updateSubmission = async () => failure();
  const saveFailed = await reviewer.write("patch", `/api/staff/submissions/${created.id}`, {
    data: { ...article, title: "An unsaved change" }
  });
  database.updateSubmission = update;
  assert.equal(saveFailed.status, 500);
  assert.equal(saveFailed.body.error, "NEWS_SAVE_FAILED");
  assert.equal(saveFailed.body.stage, "database");
  assert.equal((await reader.getSubmission(created.id)).data.title, article.title);

  const { app } = createStaffApp({ config, database, clientUploadGrantCreator: async () => failure() });
  const cookie = `${config.cookieName}=synthetic-reviewer`;
  const session = await request(app).get("/api/staff/session").set("Cookie", cookie);
  const uploadFailed = await request(app).post(`/api/staff/submissions/${created.id}/attachments/upload-intent`)
    .set("Cookie", cookie).set("X-CSRF-Token", session.body.csrfToken)
    .send({ originalName: "photo.png", mimeType: "image/png", kind: "primary", size: png.length });
  assert.equal(uploadFailed.status, 502);
  assert.equal(uploadFailed.body.error, "NEWS_IMAGE_UPLOAD_FAILED");
  assert.equal(uploadFailed.body.stage, "upload");
  for (const response of [createFailed, saveFailed, uploadFailed]) {
    assert.equal(response.body.ok, false);
    assert.ok(response.body.message);
    assert.doesNotMatch(JSON.stringify(response.body), /private provider|ECONNRESET/);
  }
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM submissions")).rows[0].count, 1);
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM attachments")).rows[0].count, 0);
  assert.equal((await reviewer.write("post", `/api/staff/submissions/${created.id}/submit`)).status, 200);
});

test("obsolete database-backed public News content endpoints are removed", async (t) => {
  const { app } = await fixture(t);
  assert.equal((await request(app).get("/api/staff/public/news")).status, 401);
  assert.equal((await request(app).get("/api/staff/public/news/old-slug")).status, 401);
});

test("first publication imports legacy PUBLISHED rows, excludes drafts, and preserves image URLs", async (t) => {
  const { reviewer, database, users, state } = await fixture(t);
  const previous = await database.createSubmission({ type: "news", creatorId: users.reviewer.id,
    data: { ...article, slug: "previous-publication", image: "https://example.org/old.png" } });
  await database.setSubmissionStatus({ id: previous.id, userId: users.reviewer.id, status: "PUBLISHED", event: "PUBLISHED" });
  const unpublished = await draft(reviewer, { ...article, slug: "unpublished-draft" });
  const current = await draft(reviewer);
  const result = await reviewer.write("post", `/api/staff/submissions/${current.id}/submit`);
  assert.equal(result.status, 200);
  assert.equal(state.publishCalls, 1);
  assert.equal(state.publishedNews.length, 2);
  assert.equal(state.publishedNews.find((item) => item.submissionId === previous.id).image, "https://example.org/old.png");
  assert.ok(!state.publishedNews.some((item) => item.submissionId === unpublished.id));
});

test("reconciliation reads all published news beyond the ordinary staff listing limit", async (t) => {
  const { reviewer, engine, users, state } = await fixture(t);
  await engine.query(`INSERT INTO submissions (id, type, creator_id, status, data_json, created_at, updated_at, published_at)
    SELECT lpad(value::text, 8, '0') || '-1111-4111-8111-111111111111', 'news', $1, 'PUBLISHED',
      jsonb_build_object('slug', 'preserved-' || value, 'title', 'Existing article ' || value,
        'content', jsonb_build_array('Existing content')), NOW(), NOW(), NOW()
    FROM generate_series(1, 300) AS value`, [users.reviewer.id]);
  const current = await draft(reviewer);
  assert.equal((await reviewer.write("post", `/api/staff/submissions/${current.id}/submit`)).status, 200);
  assert.equal(state.publishedNews.length, 301);
  assert.equal(new Set(state.publishedNews.map((item) => item.submissionId)).size, 301);
});

test("PUBLISHED row missing from GitHub reconciles, survives provider failure, and retries without revisions or commits", async (t) => {
  const { reviewer, database, users, state, reader } = await fixture(t);
  const previous = await database.createSubmission({ type: "news", creatorId: users.reviewer.id,
    data: { ...article, slug: "reconcile-previous" } });
  await database.setSubmissionStatus({ id: previous.id, userId: users.reviewer.id, status: "PUBLISHED", event: "PUBLISHED" });
  const original = await reader.getSubmission(previous.id);
  state.failPublish = true;
  const path = `/api/staff/submissions/${previous.id}/submit`;
  const failed = await reviewer.write("post", path);
  assert.equal(failed.status, 503);
  assert.equal(failed.body.error, "GITHUB_PUBLISH_FAILED");
  assert.equal(state.publishedNews.length, 0);
  state.failPublish = false;
  assert.equal((await reviewer.write("post", path)).status, 200);
  assert.equal((await reviewer.write("post", path)).status, 200);
  assert.equal(state.publishCalls, 1);
  assert.equal(state.publishedNews.length, 1);
  assert.equal((await reader.getSubmission(previous.id)).revision, original.revision);
});

test("legacy static slug collision leaves the draft retryable and the original article untouched", async (t) => {
  const { reviewer, reader, state } = await fixture(t);
  const created = await draft(reviewer, { ...article, slug: "ida-virumaa-noorte-tunnustusgala-toimub-taas" });
  const path = `/api/staff/submissions/${created.id}`;
  const failed = await reviewer.write("post", `${path}/submit`);
  assert.equal(failed.status, 409);
  assert.equal(failed.body.error, "NEWS_SLUG_CONFLICT");
  assert.equal(state.publishCalls, 0);
  assert.equal((await reader.getSubmission(created.id)).status, "DRAFT");
  await reviewer.write("patch", path, { data: { ...article, slug: "distinct-article-slug" } });
  assert.equal((await reviewer.write("post", `${path}/submit`)).status, 200);
  assert.equal(state.publishedNews[0].id, "distinct-article-slug");
});

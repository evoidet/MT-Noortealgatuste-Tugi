import assert from "node:assert/strict";
import test from "node:test";
import { toPublicNewsItem } from "../src/news-publishing.js";

function published(data) {
  return { id: "fixture", type: "news", status: "PUBLISHED", data,
    publishedAt: "2026-09-16T12:00:00.000Z" };
}

test("legacy string content, empty slug and invalid optional metadata remain readable", () => {
  const item = toPublicNewsItem(published({ title: "Legacy news", content: "First paragraph\n\nSecond paragraph",
    slug: "  ", date: "2026-02-30", featured: "false" }));
  assert.equal(item.id, "news-fixture");
  assert.deepEqual(item.content, ["First paragraph", "Second paragraph"]);
  assert.equal(item.excerpt, "");
  assert.equal(item.category, "events");
  assert.equal(item.date, "2026-09-16");
  assert.equal(item.featured, false);
  assert.equal(toPublicNewsItem({ ...published({}), status: "SUBMITTED" }), null);
});

test("the source language is not replaced by an Estonian fallback translation", () => {
  const submission = published({ language: "en", title: "English original", content: ["English story"],
    translations: { et: { title: "Eestikeelne tõlge", content: ["Eestikeelne sisu"] } } });
  assert.equal(toPublicNewsItem(submission, [], "en").title, "English original");
  assert.deepEqual(toPublicNewsItem(submission, [], "en").content, ["English story"]);
  assert.equal(toPublicNewsItem(submission, [], "et").title, "Eestikeelne tõlge");
  assert.equal(toPublicNewsItem(submission, [], "ru").title, "Eestikeelne tõlge");
  const edited = published({ language: "et", title: "Uus pealkiri", content: ["Uus sisu"],
    translations: { et: { title: "Vana pealkiri", content: ["Vana sisu"] } } });
  assert.equal(toPublicNewsItem(edited, [], "et").title, "Uus pealkiri");
  assert.deepEqual(toPublicNewsItem(edited, [], "et").content, ["Uus sisu"]);
  assert.equal(toPublicNewsItem(edited, [], "ru").title, "Uus pealkiri");
});

test("ready private Blob images expose permanent public application routes only", () => {
  const item = toPublicNewsItem(published({ title: "Photo story", content: ["Body"],
    author: "Mari", authorRole: "Editor", project: "Youth programme", date: "2026-09-10",
    category: "initiatives", registrationUrl: "https://example.test/register", summary: "Summary" }), [
    { id: "unfinished", kind: "additional", storageStatus: "pending" },
    { id: "primary", kind: "primary", storageStatus: "ready", blobUrl: "private Blob URL" },
    { id: "original", kind: "additional", storageStatus: "ready", blobUrl: "private Blob URL" },
    { id: "second", kind: "additional", storageStatus: "ready", blobUrl: "private Blob URL" }
  ]);
  assert.equal(item.image, "/api/staff/public/news/fixture/attachments/primary");
  assert.equal(item.originalImage, "/api/staff/public/news/fixture/attachments/original");
  assert.deepEqual(item.additionalImages, ["/api/staff/public/news/fixture/attachments/original",
    "/api/staff/public/news/fixture/attachments/second"]);
  assert.equal(item.excerpt, "Summary");
  assert.equal(item.author, "Mari");
  assert.equal(item.authorRole, "Editor");
  assert.equal(item.project, "Youth programme");
  assert.equal(item.registrationUrl, "https://example.test/register");
  assert.equal(item.date, "2026-09-10");
  assert.equal(item.category, "initiatives");
});

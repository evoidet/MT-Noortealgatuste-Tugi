import assert from "node:assert/strict";
import test from "node:test";
import { renderSubmissionPreview } from "../public/previews.js";

function browser(t) {
  const previous = globalThis.window;
  globalThis.window = {
    location: { origin: "https://staff.example.test" },
    I18N: { locale: () => "en", t: (key, values = {}) => values.author || key }
  };
  t.after(() => { globalThis.window = previous; });
}

test("minimum news preview displays title and body without a missing-summary paragraph", (t) => {
  browser(t);
  const html = renderSubmissionPreview("news", { title: "Minimum article", content: ["Actual article body"] });
  assert.match(html, /<h1>Minimum article<\/h1>/);
  assert.match(html, /<p>Actual article body<\/p>/);
  assert.doesNotMatch(html, /<p>staff.common.notProvided<\/p>/);
});

test("full news preview includes supplied metadata and the persistent primary image", (t) => {
  browser(t);
  const html = renderSubmissionPreview("news", {
    title: "Full article", summary: "Summary", content: ["Article body"], date: "2026-09-16",
    category: "events", author: "Writer", authorRole: "Coordinator", project: "Youth project",
    registrationUrl: "https://example.test/register", image: "https://example.test/old-image.png",
    imageAlt: "Persistent hero", imageFit: "contain", imagePosition: "center center"
  }, { attachments: [{ id: "hero", originalName: "hero.png", kind: "primary", mimeType: "image/png" }] });
  for (const value of ["Summary", "Writer · Coordinator", "Youth project", "https://example.test/register",
    'src="/api/staff/attachments/hero/download?inline=1"', 'alt="Persistent hero"', "news-image-contain"]) {
    assert.ok(html.includes(value), value);
  }
  assert.doesNotMatch(html, /old-image\.png/);
});

test("preview keeps existing gallery images when another image was just added", (t) => {
  browser(t);
  const html = renderSubmissionPreview("news", {
    title: "Gallery", content: ["Body"], _additionalImagePreviews: ["blob:https://staff.example.test/new-image"]
  }, { attachments: [
    { id: "old", kind: "additional", mimeType: "image/png", originalName: "old.png" },
    { id: "new", kind: "additional", mimeType: "image/png", originalName: "new.png" }
  ] });
  assert.match(html, /src="\/api\/staff\/attachments\/old\/download\?inline=1"/);
  assert.match(html, /src="\/api\/staff\/attachments\/new\/download\?inline=1"/);
  assert.doesNotMatch(html, /blob:/);
});

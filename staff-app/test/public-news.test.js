import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { toPublicNewsItem } from "../src/news-publishing.js";

async function catalogueWindow(fetch, language = "ru", overrides = {}) {
  const source = await readFile(new URL("../../news-data.js", import.meta.url), "utf8");
  const window = { fetch, AbortSignal, I18N: { getLanguage: () => language,
    t: (key) => key, localizeNewsItems: (items) => items }, ...overrides };
  vm.runInNewContext(source, { window, URLSearchParams });
  await window.NEWS_READY;
  return window;
}

async function catalogue(fetch, language = "ru", overrides = {}) {
  const window = await catalogueWindow(fetch, language, overrides);
  return window.NEWS_ITEMS;
}

test("public catalogue merges only published API articles in the requested language", async () => {
  let requested;
  const items = await catalogue(async (url, options) => {
    requested = url;
    assert.equal(options.credentials, "omit");
    return { ok: true, json: async () => ({ items: [
      { id: "published-fixture", published: true, title: "Новость", excerpt: "Описание", content: ["Текст"] },
      { id: "ida-virumaa-noorte-tunnustusgala-toimub-taas", published: true, title: "Updated static article", excerpt: "Updated", content: ["Updated"] },
      { id: "draft-fixture", published: false, title: "Draft", excerpt: "Private", content: ["Private"] }
    ] }) };
  });
  assert.equal(requested, "/api/staff/public/news?lang=ru");
  assert.ok(items.some((item) => item.id === "ida-virumaa-noorte-tunnustusgala-toimub-taas"));
  const overlapping = items.filter((item) => item.id === "ida-virumaa-noorte-tunnustusgala-toimub-taas");
  assert.equal(overlapping.length, 1);
  assert.equal(overlapping[0].title, "Updated static article");
  assert.equal(items.length, 5);
  assert.ok(items.some((item) => item.id === "published-fixture" && item.title === "Новость"));
  assert.ok(!items.some((item) => item.id === "draft-fixture"));
});

test("API outage, invalid response and translation tooling preserve static articles", async () => {
  for (const fetch of [undefined, async () => { throw new Error("offline"); },
    async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({}) })]) {
    const items = await catalogue(fetch);
    assert.equal(items.length, 4);
  }
});

test("public catalogue preserves the optional registration URL", async () => {
  const items = await catalogue(async () => ({ ok: true, json: async () => ({ items: [{
    id: "registration-fixture",
    published: true,
    title: "Новость",
    excerpt: "Описание",
    content: ["Текст"],
    registrationUrl: "https://example.org/register",
  }] }) }));
  assert.equal(
    items.find((item) => item.id === "registration-fixture").registrationUrl,
    "https://example.org/register",
  );
});

test("public news model keeps legacy articles compatible without a registration URL", () => {
  const legacy = toPublicNewsItem({
    id: "legacy-submission",
    type: "news",
    status: "PUBLISHED",
    data: { slug: "legacy-news", title: "Legacy", excerpt: "Summary", content: ["Body"] },
  });
  assert.equal(legacy.registrationUrl, "");

  const linked = toPublicNewsItem({
    id: "linked-submission",
    type: "news",
    status: "PUBLISHED",
    data: {
      slug: "linked-news",
      title: "Linked",
      excerpt: "Summary",
      content: ["Body"],
      registrationUrl: "https://example.org/register",
    },
  });
  assert.equal(linked.registrationUrl, "https://example.org/register");
});


test("published news without a summary remains in the public catalogue", async () => {
  const publicItem = toPublicNewsItem({ id: "empty-summary", type: "news", status: "PUBLISHED",
    data: { title: "Õ ä ö ü š ž", content: ["Full article"], summary: "" } });
  const items = await catalogue(async () => ({ ok: true, json: async () => ({ items: [publicItem] }) }));
  assert.equal(items.find((item) => item.id === "news-empty-summary").excerpt, "");
});

test("public catalogue retains every ready additional image without requiring a cover", async () => {
  const published = toPublicNewsItem({ id: "multiple-images", type: "news", status: "PUBLISHED",
    data: { title: "Photo story", content: ["All additional images are part of the article."] } }, [
    { id: "photo-one", kind: "additional", storageStatus: "ready" },
    { id: "photo-two", kind: "additional", storageStatus: "ready" },
    { id: "not-ready", kind: "additional", storageStatus: "uploading" }
  ]);
  const items = await catalogue(async () => ({ ok: true, json: async () => ({ items: [published] }) }));
  const item = items.find((entry) => entry.id === "news-multiple-images");
  assert.equal(item.image, "");
  assert.deepEqual(item.additionalImages, [
    "/api/staff/public/news/multiple-images/attachments/photo-one",
    "/api/staff/public/news/multiple-images/attachments/photo-two"
  ]);
  assert.equal(item.originalImage, item.additionalImages[0]);
});

test("public article links retrieve older publications outside the bounded listing", async () => {
  const requested = [];
  const article = { id: "older-article", title: "Older article", published: true, content: ["Original body"] };
  const window = await catalogueWindow(async (url) => {
    requested.push(url);
    return { ok: true, json: async () => url.includes("/older-article?") ? { item: article } : { items: [] } };
  }, "en", { location: { search: "?id=older-article&lang=en" } });
  assert.deepEqual(requested, ["/api/staff/public/news?lang=en", "/api/staff/public/news/older-article?lang=en"]);
  assert.equal(window.NEWS_ITEMS.find((item) => item.id === article.id).title, article.title);
  assert.equal(window.NEWS_ARTICLE_STATUS, "ready");
});

test("public catalogue skips a redundant lookup for articles already loaded", async () => {
  let requests = 0;
  await catalogueWindow(async () => {
    requests += 1;
    return { ok: true, json: async () => ({ items: [{ id: "new-article", title: "Title", published: true, content: ["Body"] }] }) };
  }, "et", { location: { search: "?id=new-article" } });
  assert.equal(requests, 1);
});

test("a catalogue outage still allows individual article retrieval", async () => {
  const window = await catalogueWindow(async (url) => {
    if (!url.includes("/older-article?")) throw new Error("Catalogue unavailable");
    return { ok: true, json: async () => ({ item: {
      id: "older-article", title: "Older article", published: true, content: ["Body"]
    } }) };
  }, "et", { location: { search: "?id=older-article" } });
  assert.equal(window.NEWS_LOAD_STATUS, "unavailable");
  assert.equal(window.NEWS_ARTICLE_STATUS, "ready");
  assert.ok(window.NEWS_ITEMS.find((item) => item.id === "older-article"));
});

test("missing and unavailable public articles have different diagnostic states", async () => {
  for (const [status, expected] of [[404, "missing"], [500, "unavailable"]]) {
    const window = await catalogueWindow(async (url) => url.includes("/unknown?")
      ? { ok: false, status }
      : { ok: true, json: async () => ({ items: [] }) }, "et", { location: { search: "?id=unknown" } });
    assert.equal(window.NEWS_ARTICLE_STATUS, expected);
    assert.equal(window.location.search, "?id=unknown");
  }
});

test("HTML, invalid JSON and malformed article responses keep the static catalogue", async () => {
  for (const response of [
    { ok: true, json: async () => { throw new SyntaxError("Unexpected token '<'"); } },
    { ok: true, json: async () => null },
    { ok: true, json: async () => ({ item: { id: "wrong-id", published: true, title: "Wrong", content: ["Body"] } }) }
  ]) {
    const window = await catalogueWindow(async () => response, "et", { location: { search: "?id=unknown" } });
    assert.equal(window.NEWS_LOAD_STATUS, "unavailable");
    assert.equal(window.NEWS_ARTICLE_STATUS, "unavailable");
    assert.equal(window.NEWS_ITEMS.length, 4);
  }
});

test("browsers without AbortSignal.timeout can fetch published news", async () => {
  const window = await catalogueWindow(async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => ({ items: [{
      id: "compatible-browser", title: "Title", published: true, content: ["Body"]
    }] }) };
  }, "et", { AbortSignal: {}, AbortController, setTimeout, clearTimeout });
  assert.equal(window.NEWS_LOAD_STATUS, "ready");
  assert.ok(window.NEWS_ITEMS.find((item) => item.id === "compatible-browser"));
});

test("all publication pages are loaded so older articles remain listed and searchable", async () => {
  const articles = Array.from({ length: 101 }, (_, index) => ({
    id: `paged-article-${index}`, title: `Article ${index}`, published: true, content: [`Body ${index}`]
  }));
  const requested = [];
  const window = await catalogueWindow(async (url) => {
    requested.push(url);
    const offset = Number(new URL(url, "https://example.org").searchParams.get("offset") || 0);
    return { ok: true, json: async () => ({ items: articles.slice(offset, offset + 25), nextOffset: offset + 25 < articles.length ? offset + 25 : null }) };
  });
  assert.deepEqual(requested, ["/api/staff/public/news?lang=ru", ...[25, 50, 75, 100].map((offset) => `/api/staff/public/news?lang=ru&offset=${offset}`)]);
  assert.equal(window.NEWS_LOAD_STATUS, "ready");
  assert.equal(window.NEWS_ITEMS.length, 105);
  assert.ok(window.NEWS_ITEMS.find((item) => item.id === "paged-article-100"));
});

test("a failed publication page preserves already loaded articles and static news", async () => {
  const window = await catalogueWindow(async (url) => {
    if (url.includes("offset=")) throw new Error("Second page unavailable");
    return { ok: true, json: async () => ({ items: [
      { id: "first-page", title: "Saved page", published: true, content: ["Body"] }
    ], nextOffset: 100 }) };
  });
  assert.equal(window.NEWS_LOAD_STATUS, "unavailable");
  assert.equal(window.NEWS_ITEMS.length, 5);
  assert.ok(window.NEWS_ITEMS.find((item) => item.id === "first-page"));
});

test("invalid pagination cursors cannot cause a repeating request loop", async () => {
  for (const nextOffset of [0, -1, 1.5, "100"]) {
    let requests = 0;
    const window = await catalogueWindow(async () => {
      requests += 1;
      return { ok: true, json: async () => ({ items: [
        { id: "first-page", title: "Saved page", published: true, content: ["Body"] }
      ], nextOffset }) };
    });
    assert.equal(requests, 1);
    assert.equal(window.NEWS_LOAD_STATUS, "unavailable");
  }
});

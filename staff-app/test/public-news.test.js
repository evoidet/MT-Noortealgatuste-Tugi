import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadCatalogue(repositoryItems, language = "et", overrides = {}) {
  const source = await readFile(new URL("../../news-data.js", import.meta.url), "utf8");
  const requests = [];
  const window = { fetch: async (url, options) => {
    requests.push(url);
    assert.equal(options.credentials, "omit");
    return { ok: true, json: async () => repositoryItems };
  }, AbortSignal, I18N: { getLanguage: () => language, t: (key) => key,
    localizeNewsItems: (items) => items }, ...overrides };
  vm.runInNewContext(source, { window, URLSearchParams });
  await window.NEWS_READY;
  return { window, requests };
}

const generated = Object.freeze({
  submissionId: "11111111-1111-4111-8111-111111111111", id: "repository-news",
  sourceLanguage: "et", published: true, title: "Repo uudis", excerpt: "Kokkuvõte", content: ["Sisu"],
  registrationUrl: "https://forms.gle/example",
  translations: { en: { title: "Repository news", excerpt: "Summary", content: ["Body"] } }
});

test("public catalogue loads the generated repository file and localizes it", async () => {
  const { window, requests } = await loadCatalogue([generated], "en");
  assert.deepEqual(requests, ["/published-news.json"]);
  const item = window.NEWS_ITEMS.find((entry) => entry.id === generated.id);
  assert.equal(item.title, "Repository news");
  assert.equal(item.registrationUrl, generated.registrationUrl);
  assert.equal(window.NEWS_LOAD_STATUS, "ready");
});

test("a different submission cannot replace a legacy article by reusing its slug", async () => {
  const overlap = { ...generated, id: "ida-virumaa-noorte-tunnustusgala-toimub-taas", title: "Updated" };
  const { window } = await loadCatalogue([overlap]);
  const matches = window.NEWS_ITEMS.filter((item) => item.id === overlap.id);
  assert.equal(matches.length, 1);
  assert.notEqual(matches[0].title, "Updated");
  assert.equal(matches[0].submissionId, undefined);
});

test("missing, failed or malformed repository catalogue preserves legacy articles", async () => {
  const source = await readFile(new URL("../../news-data.js", import.meta.url), "utf8");
  for (const fetch of [undefined, async () => { throw new Error("offline"); },
    async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ items: [] }) })]) {
    const window = { fetch, AbortSignal, I18N: { getLanguage: () => "et", t: (key) => key,
      localizeNewsItems: (items) => items } };
    vm.runInNewContext(source, { window, URLSearchParams });
    await window.NEWS_READY;
    assert.equal(window.NEWS_ITEMS.length, 4);
    assert.equal(window.NEWS_LOAD_STATUS, "unavailable");
  }
});

test("article deep links are resolved from the same repository catalogue", async () => {
  const { window, requests } = await loadCatalogue([generated], "et", { location: { search: "?id=repository-news" } });
  assert.deepEqual(requests, ["/published-news.json"]);
  assert.equal(window.NEWS_ARTICLE_STATUS, "ready");
  const missing = await loadCatalogue([generated], "et", { location: { search: "?id=missing-news" } });
  assert.equal(missing.window.NEWS_ARTICLE_STATUS, "missing");
});

test("repository catalogue retains all articles without API pagination", async () => {
  const items = Array.from({ length: 101 }, (_, index) => ({ ...generated,
    submissionId: `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`, id: `repository-article-${index}` }));
  const { window, requests } = await loadCatalogue(items);
  assert.equal(requests.length, 1);
  assert.equal(window.NEWS_ITEMS.length, 105);
  assert.ok(window.NEWS_ITEMS.some((item) => item.id === "repository-article-100"));
});

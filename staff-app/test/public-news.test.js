import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function catalogue(fetch, language = "ru") {
  const source = await readFile(new URL("../../news-data.js", import.meta.url), "utf8");
  const window = { fetch, AbortSignal, I18N: { getLanguage: () => language,
    t: (key) => key, localizeNewsItems: (items) => items } };
  vm.runInNewContext(source, { window });
  await window.NEWS_READY;
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

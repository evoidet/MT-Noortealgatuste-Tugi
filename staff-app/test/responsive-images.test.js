import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { publishedImageUrls, publishedImageSources } from "../../tools/published-image-sources.mjs";
const path = "/api/staff/public/news/76a223a1-fe5c-4317-ad8f-4a3e7b442612/attachments/460c368e-34f9-4529-b9a1-87440de16638";
const source = await readFile(new URL("../../responsive-images.js", import.meta.url), "utf8");

test("www/apex public photos prefer static variants and retain the full original", () => {
  for (const origin of ["https://www.noortetugi.ee", "https://noortetugi.ee", "http://localhost:3000"]) {
    const window = { location: { origin }, SITE_IMAGE_VARIANTS: { [path]: { webp: [{ url: "/assets/responsive/test-480.webp", width: 480 }] } } };
    vm.runInNewContext(source, { window, URL });
    const html = window.newsImageAttributes("https://noortetugi.ee" + path);
    assert.match(html, /\/assets\/responsive\/test-480.webp 480w/);
    assert.match(html, /data-full="https:\/\/noortetugi.ee\/api/);
    assert.doesNotMatch(html, /\?w=/);
    assert.equal(window.newsImageAttributes("https://unrelated.example" + path), "");
  }
});

test("new public photos use same-origin variants across the canonical domains", () => {
  const window = { location: { origin: "https://www.noortetugi.ee" } };
  vm.runInNewContext(source, { window, URL });
  const html = window.newsImageAttributes("https://noortetugi.ee" + path);
  assert.ok(html.includes(`srcset="${path}?w=480&amp;format=webp 480w`));
});

test("published image import excludes private routes, foreign hosts and URL credentials", async () => {
  const safe = "https://noortetugi.ee" + path;
  assert.deepEqual(publishedImageUrls([
    { image: safe, additionalImages: [safe, "https://www.noortetugi.ee" + path] },
    ...["https://evil.example" + path, "http://noortetugi.ee" + path,
      "https://noortetugi.ee/api/staff/attachments/private/download", safe + "?token=example",
      "https://example:example@noortetugi.ee" + path, "https://www.noortetugi.ee.evil.example" + path
    ].map(image => ({ image }))
  ]), ["https://www.noortetugi.ee" + path]);
  let calls = 0;
  const found = [];
  for await (const item of publishedImageSources([{ image: safe }], async (url, options) => {
    calls++; assert.equal(url, "https://www.noortetugi.ee" + path);
    assert.equal(options.redirect, "error"); assert.equal(options.credentials, "omit");
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } });
  })) found.push(item);
  assert.equal(calls, 1); assert.equal(found[0].path, path.slice(1));
  assert.deepEqual([...found[0].input], [1, 2, 3]);
  for await (const _ of publishedImageSources([{ image: safe }], async () => new Response("login", { headers: { "Content-Type": "text/html" } }))) assert.fail("HTML must not enter the image build");
});

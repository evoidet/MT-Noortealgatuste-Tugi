// Optional local browser audit of the two real, already-public problem photos.
// Reads only generated public assets and public HTTP image samples. No login,
// private API, production writes, or email providers are involved.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { publishedImageSources } from "../../tools/published-image-sources.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const root = resolve(fileURLToPath(new URL("../../dist/", import.meta.url)));
const samples = fileURLToPath(new URL("../private/generated/live-image-audit/", import.meta.url));
const output = resolve(samples, "browser");
await mkdir(output, { recursive: true });
const published = JSON.parse(await readFile(resolve(root, "published-news.json"), "utf8"));
const articles = ["projektikirjutamise-laager-toi-kokku-motiveeritud-ja-tegusad-noored", "news-ac82aa32-1e2a-4442-9778-ad7bd76741b5"].map(id => published.find(article => article.id === id));
assert.ok(articles.every(Boolean), "Both problem articles must be in the built catalogue");
const originals = new Map();
for await (const image of publishedImageSources(articles)) originals.set("/" + image.path, image.input);
assert.equal(originals.size, 2, "The original public images must be available for comparison");
const catalogue = articles.map(article => ({ ...article, image: new URL(article.image).pathname }));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".json": "application/json" };
let mode = "before";
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/published-news.json") return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(catalogue));
  if (originals.has(path)) return res.writeHead(200, { "Content-Type": "image/jpeg" }).end(originals.get(path));
  if (path === "/responsive-images.js" && mode === "before") return res.writeHead(200, { "Content-Type": "text/javascript" }).end("window.newsImageAttributes=()=>'';");
  const file = resolve(root, `.${decodeURIComponent(path === "/uudised" ? "/uudised.html" : path)}`);
  if (!file.startsWith(root + sep)) return res.writeHead(404).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable" }).end(body);
  }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const measurements = [];
try {
  for (const device of [{ width: 390, dpr: 1 }, { width: 390, dpr: 2 }, { width: 1440, dpr: 1 }]) {
    for (const nextMode of ["before", "after"]) {
      mode = nextMode;
      for (const [index, article] of catalogue.entries()) {
        // Each visit gets a fresh browser context, including a new empty cache.
        const context = await browser.newContext({ viewport: { width: device.width, height: 900 }, deviceScaleFactor: device.dpr, reducedMotion: "reduce" });
        await context.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
        const page = await context.newPage();
        const errors = [], requested = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("request", request => requested.push(new URL(request.url()).pathname));
        await page.goto(`${origin}/uudised?id=${encodeURIComponent(article.id)}`, { waitUntil: "networkidle" });
        const cover = page.locator(".news-article-image img");
        await cover.evaluate(image => image.decode());
        const result = await cover.evaluate(image => {
          const entry = performance.getEntriesByName(image.currentSrc).at(-1);
          return { src: new URL(image.currentSrc).pathname, naturalWidth: image.naturalWidth, renderedWidth: image.getBoundingClientRect().width,
            encodedBytes: entry?.encodedBodySize, localRequestMs: entry?.duration, loading: image.loading, priority: image.fetchPriority,
            overflow: document.documentElement.scrollWidth > innerWidth + 1 };
        });
        assert.ok(result.naturalWidth > 0);
        assert.equal(result.overflow, false);
        assert.equal(result.loading, "eager");
        assert.equal(result.priority, "high");
        assert.deepEqual(errors, []);
        const originalBytes = originals.get(article.image).length;
        if (mode === "after") {
          assert.match(result.src, /^\/assets\/responsive\/.+\.webp$/);
          assert.ok(result.encodedBytes < originalBytes);
          assert.equal(requested.filter(path => originals.has(path)).length, 0, "No original/API image downloads after optimization");
          assert.equal(requested.filter(path => path === result.src).length, 1, "No duplicate cover downloads");
          assert.equal(await cover.getAttribute("data-full"), origin + article.image);
        } else assert.equal(result.encodedBytes, originalBytes);
        if (device.dpr === 1) await cover.screenshot({ path: resolve(output, `${index}-${device.width}-${mode}.png`) });
        measurements.push({ article: index === 0 ? "youth-camp" : "erasmus", mode, ...device, ...result });
        await context.close();
      }
    }
  }
  await writeFile(resolve(output, "measurements.json"), JSON.stringify({ method: "Local built article pages, real published photos, fresh browser context per visit. Before disables responsive variants; after uses the build manifest. Local timings exclude production network, CDN and database latency.", measurements }, null, 2));
  console.log(JSON.stringify(measurements.map(({ article, mode, width, dpr, encodedBytes, src }) => ({ article, mode, width, dpr, encodedBytes, src })), null, 2));
  console.log("PASS: both real news photos, mobile/desktop empty browser caches, responsive sizes, no duplicate/original API downloads, no JS errors or overflow.");
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}

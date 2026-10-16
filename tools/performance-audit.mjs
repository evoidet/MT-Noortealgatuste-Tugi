// Optional Playwright audit. Serve only reviewed public files; never load environment files.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const root = resolve("."),
  baseline = resolve("staff-app/private/generated/baseline");
const output = resolve(
  process.argv[2] || "staff-app/private/generated/browser-review",
);
await mkdir(output, { recursive: true });
let mode = "before";
const allowed = new Set([
  "index.html",
  "uudised.html",
  "laager.html",
  "tunnustusgala.html",
  "street.html",
  "vorgustik.html",
  "dokumendid.html",
  "privaatsuspoliitika.html",
  "style.css",
  "home.css",
  "news.css",
  "camp.css",
  "gala.css",
  "street.css",
  "vorgustik.css",
  "documents.css",
  "privacy.css",
  "seasonal-effects.css",
  "seasonal-effects.js",
  "translations.js",
  "i18n.js",
  "sender-init.js",
  "site-config.js",
  "script.js",
  "news-data.js",
  "news-home.js",
  "news.js",
  "news-photo-lightbox.js",
  "published-news.json",
  "responsive-images.js",
  "favicon.ico",
]);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  const path =
    decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(
      /^\//,
      "",
    ) || "index.html";
  if (
    path.includes("..") ||
    (!allowed.has(path) && !/^assets\/[a-zA-Z0-9_./-]+$/.test(path))
  )
    return res.writeHead(404).end();
  try {
    const target =
      mode === "before"
        ? resolve(path.startsWith("assets/") ? root : baseline, path)
        : resolve(root, "dist", path);
    const bytes = await readFile(target);
    res
      .writeHead(200, {
        "Content-Type": types[extname(path)] || "application/octet-stream",
        "Content-Length": bytes.length,
      })
      .end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const phase of ["before", "after"])
    for (const mobile of [false, true])
      for (const path of [
        "index.html",
        "uudised.html",
        "laager.html",
        "tunnustusgala.html",
      ]) {
        mode = phase;
        const context = await browser.newContext({
          viewport: mobile
            ? { width: 390, height: 844 }
            : { width: 1440, height: 1000 },
          deviceScaleFactor: 1,
          isMobile: mobile,
          reducedMotion: "reduce",
        });
        await context.route("**/*", (route) =>
          route.request().url().startsWith(origin)
            ? route.continue()
            : route.abort(),
        );
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.addInitScript(() => {
          performance.setResourceTimingBufferSize(2000);
          window.__lcp = 0;
          new PerformanceObserver((list) => {
            window.__lcp = list.getEntries().at(-1).startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
        });
        await page.goto(`${origin}/${path}`, { waitUntil: "networkidle" });
        const initial = await page.evaluate(() => ({
          lcpMs: Math.round(window.__lcp),
          bytes: performance
            .getEntriesByType("resource")
            .reduce((n, r) => n + r.encodedBodySize, 0),
        }));
        await page.evaluate(async () => {
          for (const image of document.images) {
            image.scrollIntoView({ behavior: "instant", block: "center" });
            await new Promise((r) => setTimeout(r, 100));
          }
        });
        await page.waitForLoadState("networkidle");
        const metrics = await page.evaluate(() => ({
          bytes: performance
            .getEntriesByType("resource")
            .reduce((n, r) => n + r.encodedBodySize, 0),
          images: [...document.images]
            .filter((i) => i.getAttribute("src") && i.getClientRects().length)
            .map((i) => ({
              src: i.currentSrc || i.src,
              loaded: i.complete && i.naturalWidth > 0,
            })),
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
        }));
        results.push({
          phase,
          mobile,
          path,
          initial,
          totalBytes: metrics.bytes,
          brokenImages: metrics.images.filter((i) => !i.loaded),
          overflow: metrics.overflow,
          errors,
        });
        if (phase === "after") {
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({
            path: resolve(
              output,
              `${mobile ? "mobile" : "desktop"}-${path}.png`,
            ),
          });
        }
        await context.close();
      }
  await writeFile(
    resolve(output, "performance.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(
    JSON.stringify(
      results.map(({ brokenImages, ...r }) => ({
        ...r,
        brokenImages: brokenImages.length,
      })),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

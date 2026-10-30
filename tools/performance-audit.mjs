// Optional Playwright audit. Serve only reviewed public files; never load environment files.
// node tools/performance-audit.mjs OUTPUT BEFORE_BUILD [before|after] [PAGE.html]
// BEFORE_BUILD must be a snapshot of a production dist, not unbuilt source files.
// External services are blocked: these are local rendering/workload measurements.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const root = resolve("."),
  baseline = resolve(process.argv[3] || "staff-app/private/generated/performance-before");
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
  ".jpeg": "image/jpeg",
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
    (!allowed.has(path) && !/^assets\/[a-zA-Z0-9_./-]+\.(?:png|jpg|jpeg|webp|avif|svg|pdf|woff2?|ttf)$/i.test(path))
  )
    return res.writeHead(404).end();
  try {
    const target =
      mode === "before"
        ? resolve(baseline, path)
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
  for (const phase of (process.argv[4] ? [process.argv[4]] : ["before", "after"]))
    for (const mobile of [false, true])
      for (const path of [
        "index.html",
        "uudised.html",
        "laager.html",
        "tunnustusgala.html", "street.html", "vorgustik.html", "dokumendid.html", "privaatsuspoliitika.html",
      ].filter(path => !process.argv[5] || path === process.argv[5])) {
        mode = phase;
        const context = await browser.newContext({
          viewport: mobile
            ? { width: 390, height: 844 }
            : { width: 1440, height: 1000 },
          deviceScaleFactor: 1,
          isMobile: mobile,
          reducedMotion: "no-preference",
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
          window.__cls = 0;
          new PerformanceObserver(list => {
            for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
          }).observe({type: "layout-shift", buffered: true});
          new PerformanceObserver((list) => {
            window.__lcp = list.getEntries().at(-1).startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
        });
        await page.goto(`${origin}/${path}`, { waitUntil: "networkidle" });
        const initial = await page.evaluate(() => ({
          lcpMs: Math.round(window.__lcp),
          fcpMs: performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
          cls: window.__cls,
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
        await page.evaluate(() => scrollTo({top: document.body.scrollHeight, behavior: "instant"}));
        await page.waitForTimeout(500);
        const cdp = await context.newCDPSession(page);
        await cdp.send("Performance.enable");
        const start = (await cdp.send("Performance.getMetrics")).metrics;
        await page.waitForTimeout(1500);
        const end = (await cdp.send("Performance.getMetrics")).metrics;
        const delta = name => (end.find(m => m.name === name)?.value || 0) - (start.find(m => m.name === name)?.value || 0);
        const idle = {taskMs: delta("TaskDuration") * 1000, layoutMs: delta("LayoutDuration") * 1000, styleMs: delta("RecalcStyleDuration") * 1000};
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
          runningAnimations: document.getAnimations().filter(a => a.playState === "running").length,
          jsBytes: performance.getEntriesByType("resource").filter(r => new URL(r.name).pathname.endsWith(".js")).reduce((n,r) => n+r.encodedBodySize,0),
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
        }));
        results.push({
          phase,
          mobile,
          path,
          initial,
          totalBytes: metrics.bytes,
          jsBytes: metrics.jsBytes,
          runningAnimations: metrics.runningAnimations,
          idle,
          heapBytes: end.find(m => m.name === "JSHeapUsedSize")?.value,
          brokenImages: metrics.images.filter((i) => !i.loaded),
          overflow: metrics.overflow,
          errors,
        });
        if (phase === "after") {
          await page.evaluate(() => scrollTo({top: 0, behavior: "instant"}));
          await page.waitForTimeout(400);
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

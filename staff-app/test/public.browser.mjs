// Optional Playwright check. Only built public assets and synthetic API data;
// all third-party requests are blocked and no forms are sent to providers.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const root = fileURLToPath(new URL("../../dist/", import.meta.url));
const output = resolve(tmpdir(), "noortetugi-public-browser-audit");
await mkdir(output, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".pdf": "application/pdf" };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ items: [], authenticated: false }));
    return;
  }
  const target = resolve(root, `.${decodeURIComponent(pathname === "/" ? "/index.html" : pathname)}`);
  if (!target.startsWith(resolve(root) + sep)) { res.writeHead(404).end(); return; }
  try {
    const bytes = await readFile(target);
    res.writeHead(200, { "Content-Type": types[extname(target)] || "application/octet-stream" }).end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const failures = [];
try {
  const routes = (await readdir(root)).filter((name) => name.endsWith(".html"));
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.route("**/*", (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const page = await context.newPage();
  let label;
  page.on("pageerror", (error) => failures.push(`${label}: ${error.message}`));
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${label}: ${response.status()} ${new URL(response.url()).pathname}`); });
  for (const width of (process.env.VISUAL_ONLY ? [390, 1440] : [320, 375, 390, 768, 1024, 1440])) {
    await page.setViewportSize({ width, height: 900 });
    for (const language of (process.env.VISUAL_ONLY ? ["et"] : ["et", "ru", "en"])) {
      for (const route of routes) {
        label = `${route} ${language} ${width}`;
        await page.goto(`${origin}/${route}?lang=${language}`, { waitUntil: "networkidle" });
        assert.equal(await page.locator("html").getAttribute("lang"), language, label);
        if (width <= 390) {
          const menu = page.locator("#menuToggle");
          await menu.focus();
          await page.keyboard.press("Enter");
          assert.equal(await menu.getAttribute("aria-expanded"), "true", label);
          await page.keyboard.press("Escape");
          assert.equal(await menu.getAttribute("aria-expanded"), "false", label);
          assert.equal(await menu.evaluate((el) => el === document.activeElement), true, label);
        }
        const layout = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          broken: [...document.images].filter((img) => img.complete && img.currentSrc && img.naturalWidth === 0).map((img) => img.getAttribute("src")),
          missingAlt: [...document.images].filter((img) => !img.hasAttribute("alt")).length
        }));
        if (layout.width > width) failures.push(`${label}: overflow ${layout.width}`);
        if (layout.broken.length || layout.missingAlt) failures.push(`${label}: images ${JSON.stringify(layout)}`);
        if (language === "et" && [390, 1440].includes(width)) {
          // Trigger lazy images and scroll-driven reveals before visual review.
          await page.evaluate(async () => {
            for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) {
              window.scrollTo({ top: y, behavior: "instant" });
              await new Promise((done) => setTimeout(done, 60));
            }
            window.scrollTo({ top: 0, behavior: "instant" });
          });
          await page.waitForLoadState("networkidle");
          await page.evaluate(() => Promise.all([...document.images].filter((img) => img.currentSrc).map((img) => img.decode().catch(() => {}))));
          await page.waitForTimeout(200);
          await page.screenshot({ path: resolve(output, `${route}-${width}.png`), fullPage: true });
          await page.screenshot({ path: resolve(output, `${route}-${width}-top.png`) });
        }
      }
      console.log(`Checked ${routes.length} pages: ${width}px ${language}`);
    }
  }
  // Every static article plus the missing-article state.
  await page.goto(`${origin}/uudised.html`);
  const ids = await page.evaluate(() => window.NEWS_ITEMS.map((item) => item.id));
  for (const language of ["et", "ru", "en"]) {
    for (const id of [...ids, "missing-audit-article"]) {
      label = `article ${id} ${language}`;
      await page.goto(`${origin}/uudised.html?lang=${language}&id=${id}`, { waitUntil: "networkidle" });
      if (ids.includes(id)) assert.ok(await page.locator("#newsArticleContent h1").innerText(), label);
    }
  }
  assert.deepEqual(failures, []);
  console.log(`PASS: public pages, static articles, missing article; screenshots: ${output}`);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}

// Optional Playwright check. Only built public assets and synthetic API data;
// all third-party requests are blocked and no forms are sent to providers.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir, mkdir, cp, mkdtemp, rm } from "node:fs/promises";
import { resolve, extname, sep, basename } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const builtRoot = fileURLToPath(new URL("../../dist/", import.meta.url));
// Another audit process may rebuild dist; inspect one stable build throughout.
const root = await mkdtemp(resolve(tmpdir(), "noortetugi-public-browser-assets-"));
await cp(builtRoot, root, { recursive: true });
const output = resolve(tmpdir(), "noortetugi-public-browser-audit");
await mkdir(output, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".pdf": "application/pdf" };
let publishedItems = [];
let publicApiMode = "normal";
const individualArticles = new Map();
const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url, "http://localhost");
  const pathname = requestUrl.pathname;
  if (pathname === "/api/staff/public/news" || pathname.startsWith("/api/staff/public/news/")) {
    if (publicApiMode === "error") {
      res.writeHead(503, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "UNAVAILABLE" }));
    } else if (publicApiMode === "html") {
      res.writeHead(200, { "Content-Type": "text/html" }).end("<html>Service unavailable</html>");
    } else if (pathname === "/api/staff/public/news") {
      const offset = Number(requestUrl.searchParams.get("offset") || 0);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
        items: publishedItems.slice(offset, offset + 25), nextOffset: offset + 25 < publishedItems.length ? offset + 25 : null
      }));
    } else {
      const id = decodeURIComponent(pathname.slice("/api/staff/public/news/".length));
      const item = individualArticles.get(id);
      res.writeHead(item ? 200 : 404, { "Content-Type": "application/json" }).end(JSON.stringify(item ? { item } : { error: "NOT_FOUND" }));
    }
    return;
  }
  if (pathname.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ items: [], authenticated: false }));
    return;
  }
  const routedPath = pathname === "/" ? "/index.html" : ["/uudised", "/uudised/"].includes(pathname) ? "/uudised.html" : pathname;
  const target = resolve(root, `.${decodeURIComponent(routedPath)}`);
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
const expectedHttpErrors = new Set(["/api/staff/public/news/missing-audit-article"]);
try {
  const routes = (await readdir(root)).filter((name) => name.endsWith(".html"));
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.route("**/*", (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const page = await context.newPage();
  let label;
  page.on("pageerror", (error) => failures.push(`${label}: ${error.message}`));
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (response.status() >= 400 && !expectedHttpErrors.has(pathname)) failures.push(`${label}: ${response.status()} ${pathname}`);
  });
  for (const width of (process.env.NEWS_ONLY ? [] : process.env.VISUAL_ONLY ? [390, 1440] : [320, 375, 390, 768, 1024, 1440])) {
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
      else {
        assert.equal(new URL(page.url()).searchParams.get("id"), id);
        assert.equal(await page.locator("#newsArticleContent [role=status]").count(), 1);
        assert.equal(await page.locator("[data-news-retry]").count(), 0);
      }
    }
  }

  const minimum = {
    id: "minimal-public-audit", published: true, title: "Minimum news audit Õäöü",
    content: ["A full article without optional metadata."], date: "2099-09-16"
  };
  const full = {
    id: "full-public-audit", published: true, title: "Full news audit Õäöü",
    excerpt: "Optional summary", content: ["All supplied body content.", "A second paragraph with <script>literal text</script>."],
    date: "2099-09-17", category: "events", author: "Test Author", authorRole: "Youth worker",
    project: "Community project", registrationUrl: "https://example.org/register?event=audit",
    image: "/assets/news/laager/laager.jpg", imageAlt: "A youth project camp", imagePosition: "center 24%", imageFit: "cover",
    originalImage: "/assets/news/laager/laager.jpg",
    additionalImages: ["/assets/news/laager/laager.jpg", "/assets/news/erasmus-vitatiim/erasmus-koolitus.jpg"]
  };
  publishedItems = [minimum, full];
  for (const language of ["et", "en", "ru"]) {
    for (const item of publishedItems) {
      label = `published ${item.id} ${language}`;
      await page.goto(`${origin}/uudised?lang=${language}`, { waitUntil: "networkidle" });
      const card = page.locator(`#newsListingView a[href*="id=${item.id}"]`);
      assert.equal(await card.count(), 1, label);
      assert.ok((await card.innerText()).includes(item.title), label);
      assert.equal(await page.locator('img[src=""]').count(), 0, label);
      await card.click();
      await page.locator("#newsArticleContent h1").waitFor();
      assert.equal(await page.locator("#newsArticleContent h1").innerText(), item.title, label);
      const body = await page.locator(".news-article-text").innerText();
      for (const paragraph of item.content) assert.ok(body.includes(paragraph), label);
      assert.equal(await page.locator(".news-article-text script").count(), 0, label);
      assert.equal(await page.locator(".news-article-heading time").getAttribute("datetime"), item.date);
      assert.equal(new URL(page.url()).searchParams.get("id"), item.id);
      assert.equal(await page.locator('img[src=""]').count(), 0, label);
      assert.equal(await page.locator('meta[name="description"]').getAttribute("content"), item.excerpt || item.content[0]);
      if (item === full) {
        const heading = await page.locator(".news-article-heading").innerText();
        for (const value of [item.excerpt, item.author, item.authorRole, item.project]) assert.ok(heading.includes(value), label);
        assert.equal(await page.locator('.news-article-text a[href="https://example.org/register?event=audit"]').count(), 1);
        const cover = page.locator(".news-article-image img");
        assert.equal(await cover.getAttribute("alt"), item.imageAlt);
        assert.equal(await cover.evaluate((img) => img.complete && img.naturalWidth > 0), true, label);
        const additionalImages = page.locator(".news-article-original img");
        assert.equal(await additionalImages.count(), 2);
        for (let index = 0; index < item.additionalImages.length; index += 1) {
          const additional = additionalImages.nth(index);
          assert.equal(await additional.getAttribute("src"), item.additionalImages[index]);
          await additional.scrollIntoViewIfNeeded();
          await additional.evaluate((img) => img.decode());
          assert.equal(await additional.evaluate((img) => img.naturalWidth > 0), true);
        }
      } else {
        assert.equal(await page.locator(".news-article-image img").count(), 0);
        assert.equal(await page.locator('meta[property="og:image"]').getAttribute("content"), "https://www.noortetugi.ee/assets/logo-header.png");
      }
    }
    label = `published search and categories ${language}`;
    await page.goto(`${origin}/uudised/?lang=${language}`, { waitUntil: "networkidle" });
    await page.locator('#newsFilters [data-category="events"]').click();
    assert.equal(await page.locator(`#newsListingView a[href*="id=${minimum.id}"]`).count(), 0);
    assert.equal(await page.locator(`#newsListingView a[href*="id=${full.id}"]`).count(), 1);
    await page.locator("#newsSearch").fill(full.project);
    await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "Community project");
    assert.equal(await page.locator("#newsListingView .news-featured-card, #newsListingView .news-card").count(), 1);
    await page.goto(`${origin}/?lang=${language}`, { waitUntil: "networkidle" });
    assert.equal(await page.locator(`#homeNewsList a[href*="id=${minimum.id}"]`).count(), 1);
    assert.equal(await page.locator(`#homeNewsList a[href*="id=${full.id}"]`).count(), 1);
    assert.equal(await page.locator('#homeNewsList img[src=""]').count(), 0);
  }
  publishedItems = Array.from({ length: 101 }, (_, index) => ({
    ...minimum, id: `paginated-${index}`, title: `Paginated story ${index}`, date: "2020-01-01",
    content: [index === 100 ? "Last paginated searchable story" : `Earlier story ${index}`]
  }));
  label = "101st published article listing and search";
  await page.goto(`${origin}/uudised.html?lang=en`, { waitUntil: "networkidle" });
  assert.equal(await page.locator('#newsListingView a[href*="id=paginated-100"]').count(), 1);
  await page.locator("#newsSearch").fill("Last paginated searchable story");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "Last paginated searchable story");
  assert.equal(await page.locator("#newsListingView .news-featured-card, #newsListingView .news-card").count(), 1);
  await page.locator('#newsListingView a[href*="id=paginated-100"]').click();
  await page.locator("#newsArticleContent h1").waitFor();
  assert.equal(await page.locator("#newsArticleContent h1").innerText(), "Paginated story 100");
  publishedItems = [];
  individualArticles.set(minimum.id, minimum);
  label = "older article direct retrieval";
  await page.goto(`${origin}/uudised.html?id=${minimum.id}`, { waitUntil: "networkidle" });
  assert.equal(await page.locator("#newsArticleContent h1").innerText(), minimum.title);

  expectedHttpErrors.add("/api/staff/public/news");
  expectedHttpErrors.add(`/api/staff/public/news/${minimum.id}`);
  for (const mode of ["error", "html"]) {
    publicApiMode = mode;
    label = `published article API ${mode}`;
    await page.goto(`${origin}/uudised.html?lang=en`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#newsLoadStatus").isVisible(), true);
    assert.equal(await page.locator("#newsListingView .news-featured-card, #newsListingView .news-card").count(), 4);
    publicApiMode = "normal";
    await page.locator("#newsLoadStatus button").click();
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator("#newsLoadStatus").isVisible(), false);
    publicApiMode = mode;
    await page.goto(`${origin}/uudised.html?id=${minimum.id}&lang=en`, { waitUntil: "networkidle" });
    assert.equal(new URL(page.url()).searchParams.get("id"), minimum.id);
    assert.equal(await page.locator("#newsArticleContent h1").innerText(), "Article could not be loaded");
    assert.equal(await page.locator("[data-news-retry]").count(), 1);
    publicApiMode = "normal";
    await page.locator("[data-news-retry]").click();
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator("#newsArticleContent h1").innerText(), minimum.title);
  }
  assert.deepEqual(failures, []);
  console.log(`PASS: public pages, static and published articles, optional fields, images, category/search, older links, API errors/retry; screenshots: ${output}`);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
  if (resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith("noortetugi-public-browser-assets-")) {
    await rm(root, { recursive: true, force: true });
  }
}

// Optional browser check: run with Playwright available (or via NODE_PATH).
// Serves only public assets and uses synthetic API responses; no providers.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const root = new URL("../../", import.meta.url);
const files = new Map([
  ["/admin/", "staff-app/public/index.html"],
  ...["app.js", "api.js", "styles.css", "previews.js", "staff-translations.js"].map((name) => [`/admin/${name}`, `staff-app/public/${name}`]),
  ["/", "index.html"],
  ...["uudised.html", "style.css", "news.css", "home.css", "translations.js", "i18n.js", "assets/logo.png", "assets/logo-header.png",
    "news-data.js", "news.js", "news-home.js", "news-photo-lightbox.js", "script.js", "site-config.js", "sender-init.js"].map((name) => [`/${name}`, name])
]);
const server = createServer(async (req, res) => {
  const file = files.get(new URL(req.url, "http://localhost").pathname);
  if (!file) { res.writeHead(404).end(); return; }
  const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".png") ? "image/png" : "text/html";
  res.writeHead(200, { "Content-Type": type });
  res.end(await readFile(new URL(file, root)));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const failures = [];
try {
  for (const width of [320, 390, 768, 1280]) {
    for (const language of ["et", "ru", "en"]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.on("pageerror", (error) => failures.push(error.message));
      let item;
      let failSubmit = true;
      const png = await readFile(new URL("assets/logo.png", root));
      const user = { id: "writer", name: "Synthetic Writer", email: "writer@noortetugi.ee", role: "member" };
      const permissions = ["news:create", "news:read:own", "news:update:own", "news:submit:own", "expense:create"];
      await page.route("**/api/staff/**", async (route) => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        let result = {};
        let status = 200;
        if (path.endsWith("/download")) {
          await route.fulfill({ contentType: "image/png", body: png }); return;
        }
        if (path.endsWith("/session")) result = { authenticated: true, user, permissions, csrfToken: "synthetic", aiAvailable: true };
        else if (path.endsWith("/ai/improve")) result = { suggestion: "Parandatud kokkuvõte." };
        else if (path.endsWith("/upload-intent")) result = { upload: { attachmentId: "synthetic-image", uploadUrl: `${origin}/api/staff/synthetic-upload`, method: "PUT" } };
        else if (path.endsWith("/synthetic-upload")) result = {};
        else if (path.endsWith("/complete")) {
          item.attachments = [{ id: "synthetic-image", submissionId: item.id, kind: "primary", storageStatus: "ready", originalName: "synthetic.png", mimeType: "image/png", size: png.length }];
          result = { attachment: item.attachments[0] };
        }
        else if (path.endsWith("/submit")) {
          if (failSubmit) {
            failSubmit = false; status = 422;
            result = { error: "VALIDATION_ERROR", fields: [{ field: "title", message: "Kontrolli pealkirja. ".repeat(12) }] };
          } else { item.status = "SUBMITTED"; result = { item }; }
        } else if (path === "/api/staff/submissions" && req.method() === "POST") {
          const body = req.postDataJSON();
          item = { id: "00000000-0000-4000-8000-000000000001", type: body.type, data: body.data,
            creatorId: user.id, creatorName: user.name, creatorEmail: user.email, status: "DRAFT", attachments: [], reviews: [] };
          result = { item }; status = 201;
        } else if (req.method() === "PATCH") { item.data = req.postDataJSON().data; result = { item }; }
        else if (path === "/api/staff/submissions") result = { items: item ? [item] : [] };
        else result = { item };
        await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(result) });
      });
      await page.goto(`${origin}/admin/`);
      await page.locator("#authenticatedShell").waitFor({ state: "visible" });
      await page.evaluate((lang) => window.I18N.setLanguage(lang), language);
      const nav = page.locator('[data-feature="news"]:visible');
      assert.equal(await nav.innerText(), `✦\n${{ et: "Uudised", ru: "Новости", en: "News" }[language]}`);
      await nav.click();
      await page.locator('[data-action="start-form"][data-type="news"]').click();
      // Incomplete news drafts must save without publication validation.
      await page.locator('[data-action="save-draft"]').click();
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
      assert.equal(item.status, "DRAFT");
      const title = "Pikk uudis ".repeat(16).trim();
      await page.locator("#newsTitle").fill(title);
      await page.locator("#newsSlug").fill("synthetic-news");
      await page.locator("#newsDate").fill("2026-09-05");
      await page.locator("#newsSummary").fill("Uudise kokkuvõte. ".repeat(20));
      await page.locator("#newsContent").fill("Pikk lõik ".repeat(200));
      await page.locator("#newsAuthor").fill("Synthetic Writer");
      await page.locator("#newsMainImage").setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: png });
      await page.locator('[data-action="open-ai"][data-target="newsSummary"]').click();
      await page.locator("#aiGenerateButton").click();
      await page.locator("#aiUseButton:enabled").waitFor();
      assert.notEqual(await page.locator("#newsSummary").inputValue(), "Parandatud kokkuvõte.");
      await page.locator("#aiUseButton").click();
      assert.equal(await page.locator("#newsSummary").inputValue(), "Parandatud kokkuvõte.");
      await page.locator('[data-action="save-draft"]').click();
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
      await nav.click();
      await page.locator('[data-action="open-submission"]').click();
      await page.locator('[data-action="edit-submission"]').click();
      assert.equal(await page.locator("#newsTitle").inputValue(), title);
      assert.equal(item.attachments.length, 1);
      await checkLayout(page, width, `${language} editor`);
      await page.locator('#submissionForm button[type="submit"]').click();
      await page.locator(".staff-preview-view").waitFor();
      await checkLayout(page, width, `${language} preview`);
      await page.locator('[data-action="submit-preview"]').click();
      await page.locator(".staff-validation-summary").waitFor();
      await checkLayout(page, width, `${language} validation`);
      await page.locator('[data-action="submit-preview"]').click();
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
      assert.equal(item.status, "SUBMITTED");
      await page.locator("#userMenuButton").click();
      await checkLayout(page, width, `${language} account`);
      // Admin navigation is the densest mobile case.
      user.role = "admin";
      permissions.push("news:review", "expense:review", "audit:read");
      await page.reload();
      await page.locator("#authenticatedShell").waitFor({ state: "visible" });
      await checkLayout(page, width, `${language} admin navigation`);
      if (process.env.BROWSER_SCREENSHOT_DIR && width === 390 && language === "et") {
        await page.screenshot({ path: `${process.env.BROWSER_SCREENSHOT_DIR}/news-navigation.png`, fullPage: true });
        await page.locator('[data-feature="news"]:visible').click();
        await page.locator('[data-action="open-submission"]').click();
        await page.screenshot({ path: `${process.env.BROWSER_SCREENSHOT_DIR}/news-preview.png`, fullPage: true });
      }
      console.log(`PASS ${width}px ${language}: draft/save/reopen/preview/error/submit/account/admin navigation`);
      await page.close();
    }
  }
  for (const language of ["et", "ru", "en"]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    page.on("pageerror", (error) => failures.push(error.message));
    const title = { et: "Avaldatud uudis", ru: "Опубликованная новость", en: "Published news" }[language];
    await page.route("**/api/staff/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/public/news")) {
        assert.equal(url.searchParams.get("lang"), language);
        await route.fulfill({ json: { items: [{ id: "published-browser", published: true, category: "events",
          title, excerpt: "Public summary", content: ["Public article body", "<img src=x onerror=alert(1)>"],
          date: "2026-09-05", featured: true, image: "/assets/logo.png" }] } });
      } else await route.fulfill({ json: { authenticated: false } });
    });
    await page.goto(`${origin}/?lang=${language}`);
    await page.locator('#homeNewsList a[href*="published-browser"]').first().waitFor();
    assert.ok((await page.locator("#homeNewsList").innerText()).includes(title));
    await page.goto(`${origin}/uudised.html?lang=${language}&id=published-browser`);
    await page.locator("#newsArticleContent h1").waitFor();
    assert.equal(await page.locator("#newsArticleContent h1").innerText(), title);
    assert.ok((await page.locator("#newsArticleContent").innerText()).includes("Public article body"));
    assert.equal(await page.locator("#newsArticleContent img[onerror]").count(), 0);
    await checkLayout(page, 390, `${language} public article`);
    console.log(`PASS public ${language}: home card, article deep link, escaped content`);
    await page.close();
  }
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

async function checkLayout(page, width, label) {
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll("input, textarea, .staff-bottom-nav-button, .staff-preview-canvas, .staff-news-preview, .staff-news-preview h1, .staff-news-preview p, #userMenu")]
      .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden")
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1)
      .map((el) => el.id || el.className),
    smallButtons: [...document.querySelectorAll(".staff-bottom-nav-button")]
      .filter((el) => el.getClientRects().length)
      .filter((el) => el.getBoundingClientRect().width < 44 || el.getBoundingClientRect().height < 44).length
  }));
  assert.ok(result.scrollWidth <= width, `${width} ${label}: page overflow ${JSON.stringify(result)}`);
  assert.deepEqual(result.overflowing, [], `${width} ${label}`);
  assert.equal(result.smallButtons, 0, `${width} ${label}: tap targets`);
}

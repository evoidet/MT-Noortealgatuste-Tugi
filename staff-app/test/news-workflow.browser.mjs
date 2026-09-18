// Real HTTP/backend/SQL/storage-validation workflow. External services only are
// synthetic; the browser never stubs /api/staff responses.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");
const child = process.platform === "win32"
  ? spawn("wsl.exe", ["--cd", "/home/egors/MT-Noortealgatuste-Tugi", "--exec",
    "/home/egors/.nvm/versions/node/v22.23.2/bin/node", "staff-app/test/helpers/news-workflow-server.mjs"])
  : spawn(process.execPath, [new URL("helpers/news-workflow-server.mjs", import.meta.url).pathname]);
let stderr = "";
child.stderr.on("data", (chunk) => { stderr += chunk; });
let browser;
try {
  const info = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Workflow server timeout: ${stderr}`)), 30000);
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const line = output.split(/\r?\n/).find((value) => value.startsWith('{"port":'));
      if (line) { clearTimeout(timer); resolve(JSON.parse(line)); }
    });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Workflow server exited ${code}: ${stderr}`)); });
  });
  const origin = `http://127.0.0.1:${info.port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const errors = [];
  const control = async (data) => {
    const response = await fetch(`${origin}/__test/control`, { method: "POST", body: JSON.stringify(data) });
    assert.equal(response.status, 200);
  };
  const snapshot = () => fetch(`${origin}/__test/state`).then((response) => response.json());
  async function context(role, width = 1280) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.addCookies([{ name: info.cookie, value: `synthetic-${role}`, url: origin }]);
    await ctx.route("**/*", (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    return ctx;
  }
  const writer = await context("writer", 390);
  const reviewer = await context("reviewer");
  const publicContext = await browser.newContext();
  await publicContext.route("**/*", (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const publicPage = await publicContext.newPage();
  publicPage.on("pageerror", (error) => errors.push(error.message));
  async function start(ctx, title, content) {
    const page = await ctx.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/admin/`);
    await page.locator("#authenticatedShell").waitFor({ state: "visible" });
    await page.locator('[data-action="start-form"][data-type="news"]').click();
    for (const id of ["newsSlug", "newsDate", "newsAuthor", "newsSummary"]) await page.locator(`#${id}`).fill("");
    await page.locator("#newsTitle").fill(title);
    await page.locator("#newsContent").fill(content);
    return page;
  }
  async function preview(page) {
    await page.locator('#submissionForm button[type="submit"]').click();
    await page.locator(".staff-preview-view").waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  }
  async function submit(page) {
    await page.locator('[data-action="submit-preview"]').click();
    await page.locator(".staff-success-view").waitFor();
  }
  async function approve(id) {
    const session = await (await reviewer.request.get(`${origin}/api/staff/session`)).json();
    const response = await reviewer.request.post(`${origin}/api/staff/submissions/${id}/review`, {
      headers: { "X-CSRF-Token": session.csrfToken }, data: { decision: "approve" }
    });
    assert.equal(response.status(), 200);
    assert.equal((await response.json()).item.status, "PUBLISHED");
  }
  async function checkPublic(item, paragraphs, metadata = {}) {
    const feed = await (await fetch(`${origin}/api/staff/public/news?lang=et`)).json();
    const publicItem = feed.items.find((entry) => entry.id === item.data.slug);
    assert.ok(publicItem, "Article returned by public API");
    assert.deepEqual(publicItem.content, paragraphs);
    await publicPage.goto(`${origin}/uudised?lang=et`);
    await publicPage.locator(`#newsListingView a[href*="${item.data.slug}"]`).first().waitFor();
    await publicPage.goto(`${origin}/uudised?lang=et&id=${item.data.slug}`);
    await publicPage.locator("#newsArticleContent h1").waitFor();
    assert.equal(await publicPage.locator("#newsArticleContent h1").innerText(), item.data.title);
    const text = await publicPage.locator("#newsArticleContent").innerText();
    for (const paragraph of paragraphs) assert.ok(text.includes(paragraph), "Original body displayed");
    for (const value of Object.values(metadata)) assert.ok(text.includes(value), `Metadata displayed: ${value}`);
    if (publicItem.image) {
      await publicPage.locator(".news-article-image img").waitFor();
      await publicPage.waitForFunction(() => document.querySelector(".news-article-image img")?.naturalWidth > 0);
      const image = await fetch(`${origin}${publicItem.image}`);
      assert.equal(image.status, 200);
      assert.ok((await image.arrayBuffer()).byteLength > 0);
    }
    const direct = await fetch(`${origin}/api/staff/public/news/${item.data.slug}`);
    assert.equal(direct.status, 200);
    assert.equal((await direct.json()).item.title, item.data.title);
    // Exercise scroll-triggered visibility and lazy images before visual QA;
    // a full-page screenshot alone does not trigger IntersectionObserver.
    for (const element of await publicPage.locator("#newsArticleContent [data-news-reveal]").all()) {
      await element.scrollIntoViewIfNeeded();
      await publicPage.waitForFunction((node) => getComputedStyle(node).opacity === "1", await element.elementHandle());
    }
    for (const element of await publicPage.locator(".news-article-original img").all()) {
      await element.scrollIntoViewIfNeeded();
      await publicPage.waitForFunction((node) => node.complete && node.naturalWidth > 0, await element.elementHandle());
    }
    await publicPage.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const artifactDirectory = new URL("../private/generated/news-audit/", import.meta.url);
    await mkdir(artifactDirectory, { recursive: true });
    await publicPage.screenshot({ path: fileURLToPath(new URL(`${item.data.slug}.png`, artifactDirectory)), fullPage: true });
  }

  // Exact minimum sequence: form -> preview -> submit -> separate reviewer -> public.
  const minimalBody = 'õ ä ö ü š ž: "Tsitaat" ja O’Connor.\n\nTeine lõik.';
  const minimum = await start(writer, "Minimum workflow article", minimalBody);
  assert.equal(await minimum.locator('[data-action="open-ai"][data-target="newsTitle"]').count(), 0);
  await preview(minimum);
  await submit(minimum);
  let state = await snapshot();
  const minimumItem = state.items.find((item) => item.data.title === "Minimum workflow article");
  assert.equal(minimumItem.status, "SUBMITTED");
  assert.equal(minimumItem.data.summary, "");
  assert.equal((await fetch(`${origin}/api/staff/public/news/${minimumItem.data.slug}`)).status, 404);
  await approve(minimumItem.id);
  await control({ restart: true });
  await checkPublic(minimumItem, minimalBody.split("\n\n"));
  console.log("PASS minimum: real form/preview/submit/persistence/reviewer/public listing/article after app restart");
  await minimum.close();

  // Full metadata, real selected image and optional AI correction, direct publication.
  await control({ aiMode: "success" });
  const full = await start(reviewer, "Full workflow article", "Töötoas osales palju noored.");
  const fields = { newsSlug: "full-workflow-article", newsDate: "2026-09-16", newsSummary: "Kokkuvõte.",
    newsProject: "Noorte projekt", newsAuthor: "Mari Maasikas", newsAuthorRole: "Korraldaja",
    newsRegistrationUrl: "https://example.org/register?project=youth", newsImageAlt: "Töötoa foto" };
  for (const [id, value] of Object.entries(fields)) await full.locator(`#${id}`).fill(value);
  await full.locator("#newsCategory").selectOption("initiatives");
  await full.locator('label[for="newsFeatured"]').click();
  assert.equal(await full.locator("#newsFeatured").isChecked(), true);
  const png = await readFile(new URL("../../assets/logo.png", import.meta.url));
  await full.locator("#newsMainImage").setInputFiles({ name: "workflow.png", mimeType: "image/png", buffer: png });
  await full.locator("#newsAdditionalImages").setInputFiles([
    { name: "gallery-one.png", mimeType: "image/png", buffer: png },
    { name: "gallery-two.png", mimeType: "image/png", buffer: png }
  ]);
  await full.locator('[data-action="open-ai"][data-target="newsContent"]').click();
  await full.locator("#aiGenerateButton").click();
  await full.locator("#aiUseButton:enabled").waitFor();
  await full.locator("#aiUseButton").click();
  assert.equal(await full.locator("#newsContent").inputValue(), "Töötoas osales palju noori.");
  await preview(full);
  await submit(full);
  state = await snapshot();
  const fullItem = state.items.find((item) => item.data.slug === "full-workflow-article");
  assert.equal(fullItem.status, "PUBLISHED");
  assert.equal(state.attachments.filter((image) => image.submissionId === fullItem.id).length, 3);
  assert.equal(state.blobCount, 3);
  await control({ restart: true });
  await checkPublic(fullItem, ["Töötoas osales palju noori."], { summary: fields.newsSummary,
    project: fields.newsProject, author: fields.newsAuthor, role: fields.newsAuthorRole });
  assert.equal(await publicPage.locator(".news-article-link").getAttribute("href"), fields.newsRegistrationUrl);
  assert.equal(await publicPage.locator(".news-article-original img").count(), 2);
  console.log("PASS full: metadata/AI/image grant+PUT+verification+persisted image/publication/render after app restart");
  await full.close();

  // A response lost after COMMIT and a failed finalization must remain retryable.
  await control({ aiMode: "error", failCreateResponse: true });
  const retry = await start(reviewer, "Retry workflow original", "Unchanged original article.");
  await retry.locator('[data-action="open-ai"][data-target="newsContent"]').click();
  await retry.locator("#aiGenerateButton").click();
  await retry.waitForFunction(() => !document.querySelector("#aiGenerateButton")?.disabled);
  await retry.locator('[data-action="close-ai"]').last().click();
  assert.equal(await retry.locator("#newsContent").inputValue(), "Unchanged original article.");
  await retry.locator('#submissionForm button[type="submit"]').click();
  await retry.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  assert.equal(await retry.locator(".staff-success-view").count(), 0);
  await retry.locator("#newsTitle").fill("Retry workflow corrected");
  await preview(retry);
  state = await snapshot();
  assert.equal(state.items.filter((item) => item.data.title.startsWith("Retry workflow")).length, 1);
  await control({ failFinalization: true });
  await retry.locator('[data-action="submit-preview"]').click();
  await retry.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  assert.equal(await retry.locator(".staff-success-view").count(), 0);
  assert.equal((await snapshot()).items.find((item) => item.data.title === "Retry workflow corrected").status, "DRAFT");
  await control({ failSubmitResponse: true });
  await submit(retry);
  state = await snapshot();
  const retryItems = state.items.filter((item) => item.data.title.startsWith("Retry workflow"));
  assert.equal(retryItems.length, 1);
  assert.equal(retryItems[0].status, "PUBLISHED");
  await checkPublic(retryItems[0], ["Unchanged original article."]);
  console.log("PASS failures: optional AI provider error/lost create response/edited retry/DB failure/lost submit response/no duplicates");
  assert.deepEqual(errors, []);
} catch (error) {
  console.error("Workflow browser failure:", error);
  if (stderr) console.error(stderr);
  process.exitCode = 1;
} finally {
  await browser?.close();
  child.stdin.end();
  if (child.exitCode === null) {
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(() => { child.kill(); resolve(); }, 5000))
    ]);
  }
}

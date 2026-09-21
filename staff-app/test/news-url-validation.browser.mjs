// Actual Chromium form submissions through the application, SQL migrations,
// repository and image verification. Only external identity/blob services use
// the isolated fixture; successful application responses are never intercepted.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");
const evidenceDirectory = new URL("../private/generated/news-url-validation/", import.meta.url);
await mkdir(evidenceDirectory, { recursive: true });
const child = process.platform === "win32"
  ? spawn("wsl.exe", ["--cd", "/home/egors/MT-Noortealgatuste-Tugi", "--exec",
    "/home/egors/.nvm/versions/node/v22.23.2/bin/node", "staff-app/test/helpers/news-workflow-server.mjs"])
  : spawn(process.execPath, [new URL("helpers/news-workflow-server.mjs", import.meta.url).pathname]);
let stderr = "";
child.stderr.on("data", (chunk) => { stderr += chunk; });
let browser;
let activePage;
const diagnostics = [];
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
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await context.addCookies([{ name: info.cookie, value: "synthetic-reviewer", url: origin }]);
  // Avoid unrelated analytics/fonts; every app, API and image request is real.
  await context.route("**/*", (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const pageErrors = [];
  context.on("page", (page) => {
    activePage = page;
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") diagnostics.push(message.text()); });
    page.on("response", (response) => {
      if (response.status() >= 400 && response.url().includes("/api/staff/")) {
        diagnostics.push(`${response.request().method()} ${new URL(response.url()).pathname}: ${response.status()}`);
      }
    });
  });
  const control = async (data) => {
    const response = await fetch(`${origin}/__test/control`, { method: "POST", body: JSON.stringify(data) });
    assert.equal(response.status, 200);
  };
  const snapshot = () => fetch(`${origin}/__test/state`).then((response) => response.json());
  const imagePage = await context.newPage();
  await imagePage.goto(`${origin}/admin/?lang=en`);
  const imageBase64 = await imagePage.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 320; canvas.height = 200;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#386952"; ctx.fillRect(0, 0, 320, 200);
    ctx.fillStyle = "#f7d681"; ctx.fillRect(40, 40, 240, 120);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const imageBytes = Buffer.from(imageBase64, "base64");
  await imagePage.close();

  async function form(title, registrationUrl = "", withImage = false) {
    const page = await context.newPage();
    await page.goto(`${origin}/admin/?lang=en`);
    await page.locator("#authenticatedShell").waitFor({ state: "visible" });
    await page.locator('[data-action="start-form"][data-type="news"]').click();
    await page.locator("#newsTitle").fill(title);
    await page.locator("#newsContent").fill("Browser URL regression article.\n\nReal database and uploaded image verification.");
    if (registrationUrl.trim()) {
      await page.locator('[data-action="add-line"][data-type="news-link"]').click();
      await page.locator('[id^="newsLinkLabel"]').fill("Registreeru");
      await page.locator('[id^="newsLinkUrl"]').fill(registrationUrl);
    }
    // The user must never need to supply the generated image URL themselves.
    assert.equal(await page.locator("#newsImage").inputValue(), "");
    if (withImage) await page.locator("#newsMainImage").setInputFiles({
      name: "url-validation.png", mimeType: "image/png", buffer: imageBytes
    });
    return page;
  }
  async function preview(page) {
    await page.locator('#submissionForm button[type="submit"]').click();
    await page.locator(".staff-preview-view").waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  }
  async function fieldMessage(page, id, expected) {
    const control = page.locator(`#${id}`);
    const message = page.locator(`.staff-field:has(#${id}), .staff-file-field:has(#${id})`).locator(".staff-field-error");
    await message.waitFor();
    assert.equal(await message.innerText(), expected);
    assert.equal(await control.getAttribute("aria-invalid"), "true");
    assert.ok((await control.getAttribute("aria-describedby"))?.includes(await message.getAttribute("id")), "Error is connected to the field for screen readers");
    assert.equal(await page.locator(".staff-preview-view").count(), 0);
    assert.equal(await page.locator(".staff-success-view").count(), 0);
    assert.doesNotMatch(await page.locator("body").innerText(), /unknown error|unexpected error|stack trace/i);
    await message.scrollIntoViewIfNeeded();
  }
  const successCases = [
    { label: "empty registration + image", registration: "" },
    { label: "whitespace registration + image", registration: "   " },
    { label: "forms.gle registration + image", registration: "https://forms.gle/ExampleRegistration" },
    { label: "docs.google.com/forms registration + image", registration: "https://docs.google.com/forms/d/e/ExampleRegistration/viewform" },
    { label: "trimmed HTTPS registration + image", registration: "  https://example.org/register?event=news  " },
    { label: "trimmed forms.gle registration + image", registration: "  https://forms.gle/TrimmedRegistration  " },
    { label: "upload replaces stale manual image URL", registration: "https://forms.gle/UploadOverrides", staleImage: true }
  ];
  for (const [index, test] of successCases.entries()) {
    const title = `URL ${index} ${test.label}`;
    const page = await form(title, test.registration, true);
    if (test.staleImage) await page.locator("#newsImage").fill("stale-invalid-image-url");
    await preview(page);
    await page.locator('[data-action="submit-preview"]').click();
    await page.locator(".staff-success-view").waitFor();
    if (index === 0 || index === 2) await page.screenshot({
      path: fileURLToPath(new URL(`success-${index}.png`, evidenceDirectory))
    });
    const state = await snapshot();
    const items = state.items.filter((item) => item.data.title === title);
    assert.equal(items.length, 1);
    const item = items[0];
    assert.equal(item.status, "PUBLISHED");
    assert.equal(item.data.registrationUrl, "");
    const expectedUrl = test.registration.trim();
    assert.deepEqual(item.data.links, expectedUrl ? [{ label: "Registreeru", url: expectedUrl }] : []);
    const attachments = state.attachments.filter((attachment) => attachment.submissionId === item.id);
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0].storageStatus, "ready");
    assert.equal(attachments[0].size, imageBytes.length);
    assert.match(attachments[0].blobUrl, /^https:\/\/synthetic\.private\.blob\.vercel-storage\.com\//);
    const feed = await (await fetch(`${origin}/published-news.json`)).json();
    const published = feed.find((entry) => entry.id === item.data.slug);
    assert.ok(published);
    assert.equal(new URL(published.image).pathname, `/api/staff/public/news/${item.id}/attachments/${attachments[0].id}`);
    const imageResponse = await fetch(new URL(new URL(published.image).pathname, origin));
    assert.equal(imageResponse.status, 200);
    assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), imageBytes);
    await page.goto(`${origin}/uudised?lang=et&id=${item.data.slug}`);
    await page.locator("#newsArticleContent h1").waitFor();
    await page.waitForFunction(() => document.querySelector(".news-article-image img")?.naturalWidth > 0);
    console.log(`PASS real browser submission: ${test.label}; normalized SQL data, ready upload, generated URL and public image verified`);
    await page.close();
  }

  // Published database rows must be recoverable when repository content is lost.
  const beforeReconcile = await snapshot();
  await control({ clearCatalogue: true });
  const sessionResponse = await context.request.get(`${origin}/api/staff/session`);
  const session = await sessionResponse.json();
  const reconcilePath = `${origin}/api/staff/submissions/${beforeReconcile.items[0].id}/submit`;
  const reconciled = await context.request.post(reconcilePath, { headers: { "X-CSRF-Token": session.csrfToken }, data: {} });
  assert.equal(reconciled.status(), 200);
  const afterReconcile = await snapshot();
  assert.equal(afterReconcile.publishedNews.length, beforeReconcile.publishedNews.length);
  const repeated = await context.request.post(reconcilePath, { headers: { "X-CSRF-Token": session.csrfToken }, data: {} });
  assert.equal(repeated.status(), 200);
  assert.equal((await snapshot()).publishCalls, afterReconcile.publishCalls);
  console.log("PASS browser reconciliation: missing published catalogue restored; retry creates no commit");

  const collision = await form("Legacy slug collision");
  await collision.locator("#newsSlug").fill("ida-virumaa-noorte-tunnustusgala-toimub-taas");
  await preview(collision);
  await collision.locator('[data-action="submit-preview"]').click();
  await collision.locator(".staff-toast--error").waitFor();
  assert.equal(await collision.locator(".staff-success-view").count(), 0);
  assert.ok(!(await snapshot()).publishedNews.some((item) => item.title === "Legacy slug collision"));
  await collision.close();
  console.log("PASS browser legacy slug conflict: rejected without publication success or replacement");

  for (const { field, value, expected } of [
    { field: "newsLinkUrl", value: "not-a-registration-url", expected: "Please enter a valid HTTPS URL." },
    { field: "newsImage", value: "not-an-image-url", expected: "Image URL is invalid." }
  ]) {
    const page = await form(`Invalid ${field}`);
    if (field === "newsLinkUrl") {
      await page.locator('[data-action="add-line"][data-type="news-link"]').click();
      await page.locator('[id^="newsLinkLabel"]').fill("Registreeru");
      await page.locator('[id^="newsLinkUrl"]').fill(value);
    } else await page.locator(`#${field}`).fill(value);
    const controlId = field === "newsLinkUrl" ? await page.locator('[id^="newsLinkUrl"]').getAttribute("id") : field;
    const countBefore = (await snapshot()).items.length;
    await page.locator('#submissionForm button[type="submit"]').click();
    await fieldMessage(page, controlId, expected);
    await page.screenshot({ path: fileURLToPath(new URL(`${field}-error.png`, evidenceDirectory)) });
    assert.equal((await snapshot()).items.length, countBefore, "Invalid form never creates a draft");
    await page.locator(`#${controlId}`).fill("https://example.org/corrected");
    assert.equal(await page.locator(`#${controlId}`).getAttribute("aria-invalid"), null);
    assert.equal(await page.locator(".staff-field-error").count(), 0, "Correcting the field clears its old error");
    console.log(`PASS real browser validation: ${expected} adjacent to #${field}; submission blocked`);
    await page.close();
  }

  const draftPage = await form("Invalid URL draft");
  await draftPage.locator('[data-action="add-line"][data-type="news-link"]').click();
  await draftPage.locator('[id^="newsLinkLabel"]').fill("Registreeru");
  await draftPage.locator('[id^="newsLinkUrl"]').fill("invalid-draft-registration");
  const beforeDraft = (await snapshot()).items.length;
  await draftPage.locator('[data-action="save-draft"]').click();
  await draftPage.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  assert.equal((await snapshot()).items.length, beforeDraft + 1);
  await draftPage.locator('#submissionForm button[type="submit"]').click();
  await fieldMessage(draftPage, await draftPage.locator('[id^="newsLinkUrl"]').getAttribute("id"), "Please enter a valid HTTPS URL.");
  await draftPage.close();
  console.log("PASS real browser draft validation: malformed link saves as draft and blocks preview with an inline row error");

  // Server-produced relative image URLs and longer ordinary HTTPS image URLs
  // remain valid when reopening or editing a draft without uploading again.
  for (const imageUrl of ["/assets/news/url-regression.png", `https://images.example.org/news.png?signature=${"a".repeat(550)}`]) {
    const page = await form(`Image URL ${imageUrl.startsWith("/") ? "relative" : "long HTTPS"}`);
    await page.locator("#newsImage").fill(imageUrl);
    await preview(page);
    console.log(`PASS real browser preview: ${imageUrl.startsWith("/") ? "relative generated image URL" : "HTTPS image URL longer than 500 characters"} accepted`);
    await page.close();
  }

  // Exercise backend validation from within the authenticated browser while
  // bypassing frontend constraints. No application response is substituted.
  const apiPage = await form("Backend URL validation");
  for (const [field, message] of [["registrationUrl", "Registration URL is invalid."], ["image", "Image URL is invalid."]]) {
    const response = await apiPage.evaluate(async ({ field }) => {
      const { api } = await import("/admin/api.js");
      try {
        const created = await api.createSubmission("news", { title: "Invalid backend URL", content: "Backend rejection", [field]: "not-a-url" });
        await api.submitSubmission(created.item.id);
        return { unexpectedSuccess: true };
      } catch (error) {
        return { status: error.status, code: error.code, payload: error.payload };
      }
    }, { field });
    assert.ok([400, 422].includes(response.status), JSON.stringify(response));
    assert.equal(response.code, "VALIDATION_ERROR");
    const issues = response.payload.fields || [];
    assert.ok(issues.some((issue) => issue.field === field && issue.message === message), JSON.stringify(response));
    assert.doesNotMatch(JSON.stringify(response.payload), /stack|synthetic-news-workflow|synthetic-blob-token/i);
    console.log(`PASS actual backend response: ${field} => structured VALIDATION_ERROR with "${message}"`);
  }
  await apiPage.close();

  await control({ failUpload: true });
  const failedUploadPage = await form("Failed image upload", "https://forms.gle/ValidRegistration", true);
  await failedUploadPage.locator('#submissionForm button[type="submit"]').click();
  await fieldMessage(failedUploadPage, "newsMainImage", "Image upload failed.");
  assert.equal(await failedUploadPage.locator('[id^="newsLinkUrl"]').getAttribute("aria-invalid"), null);
  assert.doesNotMatch(await failedUploadPage.locator("body").innerText(), /Registration URL is invalid\./);
  let failedState = await snapshot();
  const failedDraft = failedState.items.find((item) => item.data.title === "Failed image upload");
  assert.equal(failedDraft.status, "DRAFT");
  assert.equal(failedDraft.data.image, "");
  assert.equal(failedState.attachments.filter((attachment) => attachment.submissionId === failedDraft.id).length, 0,
    "An unsuccessful upload is never returned as a ready attachment");
  await failedUploadPage.screenshot({ path: fileURLToPath(new URL("upload-error.png", evidenceDirectory)) });
  console.log("PASS real failed blob upload: adjacent Image upload failed.; registration stays valid; draft is not published");
  await control({ failUpload: false });
  await preview(failedUploadPage);
  await failedUploadPage.locator('[data-action="submit-preview"]').click();
  await failedUploadPage.locator(".staff-success-view").waitFor();
  failedState = await snapshot();
  assert.equal(failedState.items.find((item) => item.id === failedDraft.id).status, "PUBLISHED");
  assert.equal(failedState.attachments.filter((attachment) => attachment.submissionId === failedDraft.id).length, 1);
  console.log("PASS real upload retry: same draft and attachment publish successfully");
  assert.deepEqual(pageErrors, []);
  console.log(`PASS ${successCases.length} successful browser submissions plus field validation, real backend rejection and upload failure/retry`);
} catch (error) {
  console.error("News URL browser regression failure:", error);
  console.error("Browser diagnostics:", diagnostics.slice(-20));
  if (activePage && !activePage.isClosed()) {
    console.error("Visible form errors:", await activePage.locator(".staff-toast--error, .staff-field-error, .staff-validation-summary").allTextContents());
    await activePage.screenshot({ path: fileURLToPath(new URL("failure.png", evidenceDirectory)) });
  }
  if (stderr) console.error(stderr);
  process.exitCode = 1;
} finally {
  await browser?.close();
  child.stdin.end();
  if (child.exitCode === null) await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(() => { child.kill(); resolve(); }, 5000))
  ]);
}

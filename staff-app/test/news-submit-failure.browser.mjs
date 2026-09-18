// Final Submit regression with a real image, HTTP handlers and migrated SQL.
// External identity/Blob are isolated fixtures; API responses are never stubbed.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
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
    const timer = setTimeout(() => reject(new Error("Workflow server startup timed out")), 30000);
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const line = output.split(/\r?\n/).find((value) => value.startsWith('{"port":'));
      if (line) { clearTimeout(timer); resolve(JSON.parse(line)); }
    });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Workflow server exited ${code}`)); });
  });
  const origin = `http://127.0.0.1:${info.port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext();
  await context.addCookies([{ name: info.cookie, value: "synthetic-reviewer", url: origin }]);
  await context.route("**/*", (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${origin}/admin/?lang=en`);
  await page.locator("#authenticatedShell").waitFor({ state: "visible" });
  await page.locator('[data-action="start-form"][data-type="news"]').click();
  const title = "Final Submit response regression";
  await page.locator("#newsTitle").fill(title);
  await page.locator("#newsContent").fill("Body submitted with a real PNG and an empty summary.");
  await page.locator("#newsSummary").fill("");
  const png = await readFile(new URL("../../assets/logo.png", import.meta.url));
  await page.locator("#newsMainImage").setInputFiles({ name: "final-submit.png", mimeType: "image/png", buffer: png });
  await page.locator('#submissionForm button[type="submit"]').click();
  await page.locator(".staff-preview-view").waitFor();
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  await fetch(`${origin}/__test/control`, { method: "POST", body: JSON.stringify({ failResponseReads: true }) });
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/submit"));
  // Two synchronous clicks exercise the in-flight guard as well as disabled UI.
  let submitCount = 0;
  page.on("request", (request) => { if (request.url().endsWith("/submit")) submitCount++; });
  await page.locator('[data-action="submit-preview"]').evaluate((button) => { button.click(); button.click(); });
  const response = await responsePromise;
  const body = await response.json();
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  const state = await (await fetch(`${origin}/__test/state`)).json();
  const items = state.items.filter((item) => item.data.title === title);
  const evidence = { method: response.request().method(), path: new URL(response.url()).pathname,
    contentType: response.request().headers()["content-type"], payload: response.request().postDataJSON(),
    status: response.status(), response: response.ok() ? { id: body.item?.id, status: body.item?.status } : body,
    persistedStatus: items[0]?.status, articles: items.length, attachments: state.attachments.length,
    blobs: state.blobCount, submitRequests: submitCount,
    successVisible: await page.locator(".staff-success-view").count(),
    errorText: await page.locator(".staff-toast--error").allTextContents(), pageErrors };
  console.log(JSON.stringify(evidence, null, 2));
  assert.equal(response.status(), 200, "Final Submit must not fail after publication commits");
  assert.equal(evidence.successVisible, 1, "Browser recognizes the committed submission");
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "PUBLISHED");
  assert.equal(state.attachments.length, 1);
  assert.equal(state.attachments[0].storageStatus, "ready");
  assert.equal(state.blobCount, 1);
  assert.equal(submitCount, 1);
  assert.deepEqual(pageErrors, []);
  await fetch(`${origin}/__test/control`, { method: "POST", body: JSON.stringify({ failResponseReads: false, restart: true }) });
  await page.reload();
  await page.locator("#authenticatedShell").waitFor({ state: "visible" });
  await page.goto(`${origin}/uudised?lang=en&id=${items[0].data.slug}`);
  await page.locator("#newsArticleContent h1").waitFor();
  assert.equal(await page.locator("#newsArticleContent h1").innerText(), title);
  await page.waitForFunction(() => document.querySelector(".news-article-image img")?.naturalWidth > 0);
  await page.reload();
  await page.locator("#newsArticleContent h1").waitFor();
  assert.equal(await page.locator("#newsArticleContent h1").innerText(), title);
  console.log("PASS final Submit with image: response/read outage, single publication, loaded image and refresh persistence");

  // Blob accepted the bytes, but its PUT response is lost. The real completion
  // endpoint must recover them; deleting/reuploading would lose this evidence.
  await page.goto(`${origin}/admin/?lang=en`);
  await page.locator("#authenticatedShell").waitFor({ state: "visible" });
  await page.locator('[data-action="start-form"][data-type="news"]').click();
  await page.locator("#newsTitle").fill("Lost upload response regression");
  await page.locator("#newsContent").fill("The original uploaded image must be retained.");
  await page.locator("#newsSummary").fill("");
  await page.locator("#newsMainImage").setInputFiles({ name: "lost-upload.png", mimeType: "image/png", buffer: png });
  await fetch(`${origin}/__test/control`, { method: "POST", body: JSON.stringify({ failUploadResponse: true }) });
  await page.locator('#submissionForm button[type="submit"]').click();
  await page.locator(".staff-preview-view").waitFor();
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  await page.locator('[data-action="submit-preview"]').click();
  await page.locator(".staff-success-view").waitFor();
  const recovered = await (await fetch(`${origin}/__test/state`)).json();
  const recoveredItems = recovered.items.filter((item) => item.data.title === "Lost upload response regression");
  assert.equal(recoveredItems.length, 1);
  assert.equal(recoveredItems[0].status, "PUBLISHED");
  assert.equal(recovered.attachments.length, 2);
  assert.equal(recovered.blobCount, 2);
  assert.equal(recovered.blobPutCount, 2, "Only one PUT per image despite the lost response");
  await page.goto(`${origin}/uudised?lang=en&id=${recoveredItems[0].data.slug}`);
  await page.locator("#newsArticleContent h1").waitFor();
  await page.waitForFunction(() => document.querySelector(".news-article-image img")?.naturalWidth > 0);
  assert.deepEqual(pageErrors, []);
  console.log("PASS lost image PUT response: verified original upload, final Submit success, no deletion or duplicate upload");
} catch (error) {
  console.error(error);
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

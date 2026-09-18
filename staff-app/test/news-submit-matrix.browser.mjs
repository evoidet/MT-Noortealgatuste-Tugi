// Real HTTP/SQL/image verification for successful submissions. The failure
// matrix intercepts only final Submit responses; draft/image persistence is real.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
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
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await context.addCookies([{ name: info.cookie, value: "synthetic-reviewer", url: origin }]);
  await context.route("**/*", (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const pageErrors = [];
  context.on("page", (page) => page.on("pageerror", (error) => pageErrors.push(error.message)));
  const control = async (data) => {
    const response = await fetch(`${origin}/__test/control`, { method: "POST", body: JSON.stringify(data) });
    assert.equal(response.status, 200);
  };
  const snapshot = () => fetch(`${origin}/__test/state`).then((response) => response.json());
  const imagePage = await context.newPage();
  await imagePage.goto(`${origin}/admin/`);
  // Browser encoders produce real decodable images, including a noisy phone
  // photograph-sized JPEG that is larger than the serverless request body cap.
  const images = await imagePage.evaluate(async () => {
    const results = {};
    for (const [name, type, width, height, noise] of [
      ["jpg", "image/jpeg", 1200, 750, false], ["jpeg", "image/jpeg", 1200, 750, false],
      ["png", "image/png", 1200, 750, false], ["webp", "image/webp", 1200, 750, false],
      ["phone", "image/jpeg", 3264, 2448, true]
    ]) {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (noise) {
        const pixels = ctx.createImageData(width, height);
        let seed = 123456789;
        for (let index = 0; index < pixels.data.length; index += 4) {
          for (let channel = 0; channel < 3; channel++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            pixels.data[index + channel] = seed >>> 24;
          }
          pixels.data[index + 3] = 255;
        }
        ctx.putImageData(pixels, 0, 0);
      } else {
        ctx.fillStyle = "#386952"; ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#f7d681"; ctx.fillRect(100, 100, width - 200, height - 200);
      }
      results[name] = { type, width, height, data: canvas.toDataURL(type, 0.92).split(",")[1] };
    }
    return results;
  });
  await imagePage.close();
  const phoneBytes = Buffer.from(images.phone.data, "base64").length;
  assert.ok(phoneBytes >= 5 * 1024 * 1024 && phoneBytes <= 10 * 1024 * 1024,
    `Valid phone JPEG must be 5–10 MiB, got ${phoneBytes}`);
  async function form(title, summary, imageName) {
    const page = await context.newPage();
    await page.goto(`${origin}/admin/?lang=en`);
    await page.locator("#authenticatedShell").waitFor({ state: "visible" });
    await page.locator('[data-action="start-form"][data-type="news"]').click();
    await page.locator("#newsTitle").fill(title);
    // Filling the title generates a suggested slug. Clear optional fields
    // afterwards so the test really exercises the backend's blank defaults.
    for (const id of ["newsSlug", "newsDate", "newsAuthor", "newsAuthorRole", "newsProject", "newsRegistrationUrl", "newsImageAlt"]) {
      await page.locator(`#${id}`).fill("");
    }
    await page.locator("#newsSummary").fill(summary);
    await page.locator("#newsContent").fill('Õhtu töötoas: õ ä ö ü š ž, “tsitaat”.\n\nTeine lõik säilib.');
    if (imageName) {
      const image = images[imageName];
      await page.locator("#newsMainImage").setInputFiles({ name: `${title}.${imageName === "phone" ? "jpg" : imageName}`,
        mimeType: image.type, buffer: Buffer.from(image.data, "base64") });
    }
    return page;
  }
  async function preview(page) {
    await page.locator('#submissionForm button[type="submit"]').click();
    await page.locator(".staff-preview-view").waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  }
  const cases = [
    { image: null, summary: false }, { image: null, summary: true },
    ...["jpg", "jpeg", "png", "webp"].flatMap((image) => [{ image, summary: false }, { image, summary: true }]),
    { image: "phone", summary: false }
  ];
  const publicContext = await browser.newContext();
  await publicContext.route("**/*", (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const publicPage = await publicContext.newPage();
  publicPage.on("pageerror", (error) => pageErrors.push(error.message));
  for (const [index, testCase] of cases.entries()) {
    const title = `Matrix ${index} ${testCase.image || "text"} ${testCase.summary ? "summary" : "no summary"}`;
    const summary = testCase.summary ? "Lühike kokkuvõte." : "";
    await control({ aiMode: testCase.summary ? "success" : "missing" });
    const page = await form(title, summary, testCase.image);
    assert.equal(await page.locator('[data-action="open-ai"][data-target="newsContent"]').count(), testCase.summary ? 1 : 0);
    let submitCount = 0;
    page.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/submit")) submitCount++; });
    await preview(page);
    await page.locator('[data-action="submit-preview"]').evaluate((button) => { button.click(); button.click(); });
    await page.locator(".staff-success-view").waitFor();
    assert.equal(submitCount, 1, "Double click sends only one final Submit");
    const state = await snapshot();
    const matches = state.items.filter((item) => item.data.title === title);
    assert.equal(matches.length, 1, "Exactly one persisted submission");
    const item = matches[0];
    assert.equal(item.status, "PUBLISHED");
    assert.equal(item.data.summary, summary);
    assert.equal(item.data.slug, `news-${item.id}`, "Blank slug receives its stable server default");
    assert.match(item.data.date, /^\d{4}-\d{2}-\d{2}$/, "Blank date receives an ISO calendar date");
    assert.equal(new Date(`${item.data.date}T00:00:00.000Z`).toISOString().slice(0, 10), item.data.date,
      "Default date must be a valid calendar date");
    const attachments = state.attachments.filter((attachment) => attachment.submissionId === item.id);
    assert.equal(attachments.length, testCase.image ? 1 : 0);
    if (testCase.image) {
      assert.equal(attachments[0].storageStatus, "ready");
      assert.equal(attachments[0].size, Buffer.from(images[testCase.image].data, "base64").length);
      assert.equal(attachments[0].mimeType, images[testCase.image].type);
    }
    await control({ restart: true });
    await page.reload();
    await page.locator("#authenticatedShell").waitFor({ state: "visible" });
    const staffRead = await context.request.get(`${origin}/api/staff/submissions/${item.id}`);
    assert.equal(staffRead.status(), 200);
    assert.equal((await staffRead.json()).item.status, "PUBLISHED");
    const feed = await (await fetch(`${origin}/api/staff/public/news?lang=et`)).json();
    assert.ok(feed.items.some((entry) => entry.id === item.data.slug), "Listed publicly after app restart");
    await publicPage.goto(`${origin}/uudised?lang=et&id=${item.data.slug}`);
    await publicPage.locator("#newsArticleContent h1").waitFor();
    assert.equal(await publicPage.locator("#newsArticleContent h1").innerText(), title);
    assert.ok((await publicPage.locator("#newsArticleContent").innerText()).includes("Teine lõik säilib."));
    if (testCase.image) await publicPage.waitForFunction(() => document.querySelector(".news-article-image img")?.naturalWidth > 0);
    await publicPage.reload();
    await publicPage.locator("#newsArticleContent h1").waitFor();
    assert.equal(await publicPage.locator("#newsArticleContent h1").innerText(), title);
    if (testCase.image) await publicPage.waitForFunction(() => document.querySelector(".news-article-image img")?.naturalWidth > 0);
    console.log(`PASS real matrix: ${testCase.image || "no image"}, summary=${Boolean(summary)}, AI=${testCase.summary ? "enabled unused" : "disabled"}, ${attachments[0]?.size || 0} image bytes, double click, refreshed staff/public`);
    await page.close();
  }

  // These are explicit browser transport injections, not claims that production
  // generated these responses. Existing SQL rows/images must survive each one.
  await control({ aiMode: "missing", restart: true });
  const failurePage = await form("Transport failure matrix", "", "png");
  await preview(failurePage);
  const initial = await snapshot();
  const draft = initial.items.find((item) => item.data.title === "Transport failure matrix");
  const failureCases = [
    ...[400, 403, 404, 409, 413, 415, 422, 429, 500, 502, 503].map((status) => ({
      label: `JSON ${status}`, status, contentType: "application/json", body: JSON.stringify({ error: "REQUEST_FAILED" })
    })),
    { label: "HTML 502", status: 502, contentType: "text/html", body: "<html>SYNTHETIC_PRIVATE_DIAGNOSTIC</html>" },
    { label: "empty 200 JSON", status: 200, contentType: "application/json", body: "" },
    { label: "malformed 200 JSON", status: 200, contentType: "application/json", body: "{SYNTHETIC_PRIVATE_DIAGNOSTIC" },
    { label: "network failure", abort: true }
  ];
  let injected;
  let intercepted = 0;
  await failurePage.route("**/api/staff/submissions/*/submit", async (route) => {
    intercepted++;
    return injected.abort ? route.abort("failed") : route.fulfill(injected);
  });
  for (const failure of failureCases) {
    const { label, ...response } = failure;
    injected = response;
    await failurePage.locator(".staff-toast").evaluateAll((elements) => elements.forEach((element) => element.remove()));
    const before = intercepted;
    await failurePage.locator('[data-action="submit-preview"]').click();
    await failurePage.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
    assert.equal(intercepted, before + 1, label);
    assert.equal(await failurePage.locator(".staff-success-view").count(), 0, label);
    const message = await failurePage.locator(".staff-toast--error").last().innerText();
    assert.ok(message.trim(), `${label}: visible error`);
    assert.doesNotMatch(message, /SYNTHETIC_PRIVATE_DIAGNOSTIC|unknown error|unexpected error/i, label);
    assert.equal(await failurePage.locator('[data-action="submit-preview"]').isEnabled(), true, `${label}: retry available`);
    const state = await snapshot();
    assert.equal(state.items.find((item) => item.id === draft.id).status, "DRAFT", label);
    assert.equal(state.items.length, initial.items.length, `${label}: no duplicate submission`);
    assert.equal(state.attachments.length, initial.attachments.length, `${label}: no duplicate/lost image`);
    console.log(`PASS intercepted final Submit: ${label}, visible safe error, image and draft preserved, retry enabled`);
  }
  // A 401 starts a session refresh; verify that distinct branch explicitly.
  injected = { status: 401, contentType: "application/json", body: JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }) };
  const sessionRefresh = failurePage.waitForResponse((response) => response.url().endsWith("/session"));
  await failurePage.locator('[data-action="submit-preview"]').click();
  assert.equal((await sessionRefresh).status(), 200);
  await failurePage.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  assert.equal(await failurePage.locator(".staff-success-view").count(), 0);
  assert.equal((await snapshot()).items.find((item) => item.id === draft.id).status, "DRAFT");
  console.log("PASS intercepted final Submit: JSON 401 refreshes session, never reports success, persisted draft/image retained");
  assert.deepEqual(pageErrors, []);
  console.log(`PASS ${cases.length} real submit cases and ${failureCases.length + 1} transport failure cases; phone JPEG ${phoneBytes} bytes`);
} catch (error) {
  console.error("News submit matrix failure:", error);
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

// Optional browser check: Playwright must be available (also resolved via NODE_PATH).
// Only explicit public assets and synthetic APIs are served. Folder writes stay in memory.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { toPublicNewsItem } from "../src/news-publishing.js";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = new URL("../../", import.meta.url);
const files = new Map([
  ["/admin/", "staff-app/public/index.html"],
  ...["app.js", "api.js", "styles.css", "previews.js", "document-values.js", "staff-translations.js", "news-local-image.js"]
    .map((name) => [`/admin/${name}`, `staff-app/public/${name}`]),
  ...["style.css", "news.css", "translations.js", "i18n.js", "assets/logo.png", "assets/logo-header.png"]
    .map((name) => [`/${name}`, name])
]);
const server = createServer(async (req, res) => {
  const file = files.get(new URL(req.url, "http://localhost").pathname);
  if (!file) { res.writeHead(404).end(); return; }
  try {
    const data = await readFile(new URL(file, root));
    const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".png") ? "image/png" : "text/html";
    res.writeHead(200, { "Content-Type": type }).end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const failures = [];
const consoleErrors = [];
const blockedRequests = [];
try {
  const imagePage = await browser.newPage();
  await imagePage.route("**/*", (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await imagePage.goto(`${origin}/admin/news-local-image.js`);
  const processing = await imagePage.evaluate(async () => {
    const { prepareNewsImage } = await import("/admin/news-local-image.js");
    async function fixture(type, width, height) {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "#d02020"; context.fillRect(0, 0, width / 3, height);
      context.fillStyle = "#20b030"; context.fillRect(width / 3, 0, width / 3, height);
      context.fillStyle = "#2020d0"; context.fillRect(width * 2 / 3, 0, width / 3, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.94));
      return new File([blob], `synthetic.${type.split("/")[1]}`, { type });
    }
    const cases = [];
    for (const [type, width, height] of [["image/webp", 1200, 750], ["image/png", 1200, 750], ["image/jpeg", 1200, 750], ["image/webp", 600, 600], ["image/png", 1600, 750], ["image/jpeg", 750, 1600]]) {
      const input = await fixture(type, width, height);
      const result = await prepareNewsImage(input);
      const blob = result.blob;
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1, 0, 0, 1, 1);
      const center = Array.from(context.getImageData(0, 0, 1, 1).data);
      const originalBytes = new Uint8Array(await input.arrayBuffer());
      const bytes = new Uint8Array(await blob.arrayBuffer());
      cases.push({ type, inputWidth: width, inputHeight: height, width: bitmap.width, height: bitmap.height,
        outputType: blob.type, unchanged: bytes.length === originalBytes.length && bytes.every((value, index) => value === originalBytes[index]), center });
      bitmap.close();
    }
    const otherFormats = [];
    const gifBytes = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (character) => character.charCodeAt(0));
    const bmpBytes = new Uint8Array(58);
    const bmpView = new DataView(bmpBytes.buffer);
    bmpBytes.set([66, 77]);
    bmpView.setUint32(2, 58, true);
    bmpView.setUint32(10, 54, true);
    bmpView.setUint32(14, 40, true);
    bmpView.setInt32(18, 1, true);
    bmpView.setInt32(22, 1, true);
    bmpView.setUint16(26, 1, true);
    bmpView.setUint16(28, 24, true);
    bmpView.setUint32(34, 4, true);
    bmpBytes.set([32, 176, 32], 54);
    for (const [bytes, type] of [[gifBytes, "image/gif"], [bmpBytes, "image/bmp"]]) {
      const prepared = await prepareNewsImage(new File([bytes], "synthetic", { type }));
      const bitmap = await createImageBitmap(prepared.blob);
      otherFormats.push({ width: bitmap.width, height: bitmap.height, type: prepared.blob.type, unchanged: prepared.unchanged });
      bitmap.close();
    }
    let corruptRejected = false;
    try { await prepareNewsImage(new File(["this is not an image"], "corrupt.webp", { type: "image/webp" })); }
    catch { corruptRejected = true; }
    // Real JPEG decode must apply camera orientation before resizing/cropping.
    const portrait = new Uint8Array(await (await fixture("image/jpeg", 750, 1200)).arrayBuffer());
    const exif = new Uint8Array([255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 77, 77, 0, 42, 0, 0, 0, 8,
      0, 1, 1, 18, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]);
    const camera = new File([portrait.subarray(0, 2), exif, portrait.subarray(2)], "camera.jpg", { type: "image/jpeg" });
    const oriented = await prepareNewsImage(camera);
    const orientedBitmap = await createImageBitmap(oriented.blob);
    const orientedCanvas = document.createElement("canvas"); orientedCanvas.width = 1200; orientedCanvas.height = 750;
    const orientedContext = orientedCanvas.getContext("2d"); orientedContext.drawImage(orientedBitmap, 0, 0);
    const orientation = { width: orientedBitmap.width, height: orientedBitmap.height, unchanged: oriented.unchanged,
      top: Array.from(orientedContext.getImageData(600, 40, 1, 1).data), bottom: Array.from(orientedContext.getImageData(600, 710, 1, 1).data) };
    orientedBitmap.close();
    const png = await fixture("image/png", 1600, 750);
    return { cases, otherFormats, corruptRejected, orientation, png: Array.from(new Uint8Array(await png.arrayBuffer())) };
  });
  for (const result of processing.cases) {
    assert.equal(result.width, 1200, JSON.stringify(result));
    assert.equal(result.height, 750, JSON.stringify(result));
    const conforming = result.inputWidth === 1200 && result.inputHeight === 750;
    assert.equal(result.outputType, conforming ? result.type : "image/webp");
    assert.equal(result.unchanged, conforming);
    assert.ok(result.center[1] > result.center[0] * 2 && result.center[1] > result.center[2] * 2, "Centered subject must survive the crop");
  }
  assert.equal(processing.corruptRejected, true);
  assert.deepEqual(processing.otherFormats, Array(2).fill({ width: 1200, height: 750, type: "image/webp", unchanged: false }));
  assert.equal(processing.orientation.width, 1200);
  assert.equal(processing.orientation.height, 750);
  assert.equal(processing.orientation.unchanged, false);
  assert.ok(processing.orientation.top[0] > processing.orientation.top[2] * 2, "Camera orientation moves the left red stripe to the top");
  assert.ok(processing.orientation.bottom[2] > processing.orientation.bottom[0] * 2, "Camera orientation moves the right blue stripe to the bottom");
  console.log("PASS image processing: conforming PNG/JPEG/WebP byte preservation, PNG/JPEG/WebP/GIF/BMP conversion, center crop, camera orientation, corrupt input");
  await imagePage.close();
  const png = Buffer.from(processing.png);

  for (const width of [390, 1280]) for (const language of ["et", "ru", "en"]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    let item;
    const payloads = [];
    const unexpectedApis = [];
    const user = { id: "synthetic-writer", name: "Synthetic Writer", email: "writer@example.test", role: "member" };
    await page.addInitScript(() => {
      const state = window.__newsFolderTest = { mode: "cancel", directoryName: "news", pickerCalls: 0, writes: [], handles: {}, folders: [] };
      function directory(name) {
        return {
          kind: "directory", name,
          queryPermission: async () => "granted", requestPermission: async () => "granted",
          getDirectoryHandle: async (child, options) => {
            state.folders.push({ parent: name, child, create: Boolean(options?.create) });
            return directory(child);
          },
          getFileHandle: async (filename, options) => {
            if (!state.handles[filename] && !options?.create) throw new DOMException("Missing", "NotFoundError");
            state.handles[filename] ||= { bytes: [] };
            return { kind: "file", name: filename, createWritable: async () => ({
              write: async (blob) => { state.handles[filename].bytes = Array.from(new Uint8Array(await blob.arrayBuffer())); },
              close: async () => { state.writes.push({ directory: name, filename, bytes: state.handles[filename].bytes }); },
              abort: async () => {}
            }) };
          },
          removeEntry: async (filename) => { delete state.handles[filename]; }
        };
      }
      window.showDirectoryPicker = async () => {
        state.pickerCalls++;
        if (state.mode === "cancel") throw new DOMException("Synthetic canceled picker", "AbortError");
        if (state.mode === "deny") throw new DOMException("Synthetic denied write", "NotAllowedError");
        return directory(state.directoryName);
      };
    });
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (!req.url().startsWith(origin)) { blockedRequests.push(req.url()); return route.abort(); }
      const path = new URL(req.url()).pathname;
      if (!path.startsWith("/api/staff/")) return route.continue();
      let result = {};
      if (path.endsWith("/session")) result = { authenticated: true, user, csrfToken: "synthetic",
        permissions: ["news:create", "news:read:own", "news:update:own", "news:submit:own"] };
      else if (path.endsWith("/upload-intent")) result = { upload: { attachmentId: "synthetic-image", uploadUrl: `${origin}/api/staff/synthetic-upload`, method: "PUT" } };
      else if (path.endsWith("/synthetic-upload")) result = {};
      else if (path.endsWith("/complete")) {
        item.attachments = [{ id: "synthetic-image", submissionId: item.id, kind: "primary", storageStatus: "ready", mimeType: "image/webp", originalName: "synthetic.webp" }];
        result = { attachment: item.attachments[0] };
      }
      else if (path === "/api/staff/submissions" && req.method() === "POST") {
        const body = req.postDataJSON(); payloads.push(body);
        item = { id: "00000000-0000-4000-8000-000000000001", type: body.type, data: body.data, creatorId: user.id,
          creatorName: user.name, creatorEmail: user.email, status: "DRAFT", attachments: [], reviews: [] };
        result = { item };
      } else if (req.method() === "PATCH") { const body = req.postDataJSON(); payloads.push(body); item.data = body.data; result = { item }; }
      else if (path.endsWith("/submit")) { item.status = "SUBMITTED"; result = { item }; }
      else if (path === "/api/staff/submissions") result = { items: item ? [item] : [] };
      else if (/\/submissions\/[^/]+$/.test(path)) result = { item };
      else { unexpectedApis.push(`${req.method()} ${path}`); return route.fulfill({ status: 500, json: { error: "UNEXPECTED_SYNTHETIC_REQUEST" } }); }
      return route.fulfill({ json: result });
    });
    await page.goto(`${origin}/admin/`);
    await page.locator("#authenticatedShell").waitFor({ state: "visible" });
    await page.evaluate((lang) => window.I18N.setLanguage(lang), language);
    await page.locator('[data-feature="news"]:visible').click();
    await page.locator('[data-action="start-form"][data-type="news"]').click();
    assert.equal(await page.locator("#newsLocalImage").getAttribute("multiple"), null, "Local image picker must allow only one image");
    assert.equal(await page.locator("#newsLocalImage").getAttribute("data-file-group"), null, "Local input uses preparation before entering the upload queue");
    assert.equal(await page.locator("#newsMainImage").count(), 1, "Existing main-image input is preserved");
    assert.equal(await page.locator("#newsAdditionalImages").count(), 1, "Existing extra-image input is preserved");
    await page.locator("#newsTitle").fill("Synthetic local image article");
    await page.locator("#newsSlug").fill("synthetic-local-image");
    await page.locator("#newsDate").fill("2026-09-15");
    await page.locator("#newsSummary").fill("Synthetic image summary");
    await page.locator("#newsContent").fill("Synthetic article content.");
    await page.locator("#newsAuthor").fill(user.name);
    await page.locator("#newsRegistrationUrl").fill("https://example.test/registration");
    await page.locator('[data-action="save-draft"]').click();
    await waitIdle(page);
    assert.equal(item.data.image, "", "News without an image still saves as before");
    const originalData = { ...item.data };

    await page.locator("#newsLocalImage").setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: png });
    await page.locator('[data-action="save-news-local-image"]').click();
    await waitIdle(page);
    assert.equal(await page.locator("#newsImage").inputValue(), "", "Canceled folder picker must not change image reference");
    assert.equal(await page.evaluate(() => window.__newsFolderTest.writes.length), 0);
    assert.deepEqual(item.data, originalData, "Canceled picker must not update the saved article");
    const savedPayloadCount = payloads.length;
    await page.locator('[data-action="save-draft"]').click();
    await waitIdle(page);
    assert.equal(payloads.length, savedPayloadCount, "An unsaved local selection must not silently disappear during draft saving");
    await page.locator("#newsMainImage").setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: png });
    assert.equal(await page.locator("#newsMainImage").evaluate((input) => input.files.length), 0, "Pending local image must reject a conflicting cloud primary image");
    await page.locator('[data-action="clear-news-local-image"]').click();
    assert.equal(await page.locator("#newsLocalImage").evaluate((input) => input.files.length), 0);
    await page.locator("#newsMainImage").setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: png });
    await page.locator("#newsLocalImage").setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: png });
    const pickerCalls = await page.evaluate(() => window.__newsFolderTest.pickerCalls);
    await page.locator('[data-action="save-news-local-image"]').click();
    await waitIdle(page);
    assert.equal(await page.evaluate(() => window.__newsFolderTest.pickerCalls), pickerCalls, "Existing selected main image must prevent conflicting local writes");
    await page.locator("#newsMainImage").setInputFiles([]);

    await page.evaluate(() => { window.__newsFolderTest.mode = "deny"; });
    await page.locator('[data-action="save-news-local-image"]').click();
    await waitIdle(page);
    assert.equal(await page.locator("#newsImage").inputValue(), "", "Permission denial must not change image reference");
    assert.equal(await page.evaluate(() => window.__newsFolderTest.writes.length), 0);

    await page.evaluate(() => { window.__newsFolderTest.mode = "save"; window.__newsFolderTest.directoryName = "wrong-folder"; });
    await page.locator('[data-action="save-news-local-image"]').click();
    await waitIdle(page);
    assert.equal(await page.locator("#newsImage").inputValue(), "", "Wrong folder must not change image reference");
    assert.equal(await page.evaluate(() => window.__newsFolderTest.writes.length), 0);

    await page.evaluate(() => { window.__newsFolderTest.directoryName = "news"; });
    await page.locator('[data-action="save-news-local-image"]').click();
    await page.waitForFunction(() => document.querySelector("#newsImage").value.includes("/assets/news/uploads/"));
    await waitIdle(page);
    let imageUrl = await page.locator("#newsImage").inputValue();
    assert.match(imageUrl, new RegExp(`^${origin}/assets/news/uploads/news-[a-z0-9-]+\\.webp$`));
    const folder = await page.evaluate(() => window.__newsFolderTest);
    assert.equal(folder.writes.length, 1);
    assert.equal(folder.writes[0].directory, "uploads");
    assert.equal(imageUrl, `${origin}/assets/news/uploads/${folder.writes[0].filename}`);
    assert.ok(folder.writes[0].bytes.length > 0);
    assert.ok(folder.folders.some((entry) => entry.parent === "news" && entry.child === "uploads" && entry.create));
    await page.locator("#newsLocalImage").setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: png });
    await page.locator('[data-action="save-news-local-image"]').click();
    await page.waitForFunction((previous) => document.querySelector("#newsImage").value !== previous, imageUrl);
    await waitIdle(page);
    imageUrl = await page.locator("#newsImage").inputValue();
    const replacement = await page.evaluate(() => window.__newsFolderTest.writes);
    assert.equal(replacement.length, 2);
    assert.notEqual(replacement[0].filename, replacement[1].filename, "Saving another image must generate a unique asset path");
    assert.equal(imageUrl, `${origin}/assets/news/uploads/${replacement[1].filename}`);
    await page.locator("#newsMainImage").setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: png });
    assert.equal(await page.locator("#newsMainImage").evaluate((input) => input.files.length), 0, "Saved local image must reject a conflicting main upload");
    await checkLayout(page, width);
    if (process.env.BROWSER_SCREENSHOT_DIR && language === "et") {
      await mkdir(process.env.BROWSER_SCREENSHOT_DIR, { recursive: true });
      await page.waitForFunction(() => !document.querySelector(".staff-toast"));
      await page.evaluate(() => document.activeElement?.blur());
      await page.locator('label[for="newsLocalImage"]').evaluate((element) => {
        window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - 100, behavior: "instant" });
      });
      await page.screenshot({ path: `${process.env.BROWSER_SCREENSHOT_DIR}/news-local-image-${width}.png` });
    }
    await page.locator('#submissionForm button[type="submit"]').click();
    await page.locator(".staff-preview-view").waitFor();
    const preview = page.locator('.staff-news-preview img[src^="blob:"]');
    assert.ok(await preview.count(), "Saved local image must preview before deployment");
    await page.waitForFunction(() => [...document.querySelectorAll('.staff-news-preview img[src^="blob:"]')].some((image) => image.complete && image.naturalWidth === 1200));
    await page.locator('[data-action="save-preview"]').click();
    await waitIdle(page);
    assert.equal(item.data.image, "", "Local-only paths must not be persisted as deployed assets");
    for (const [key, value] of Object.entries(originalData)) if (key !== "image") assert.deepEqual(item.data[key], value, `Existing ${key} field preserved`);
    assert.equal(item.id, "00000000-0000-4000-8000-000000000001");
    assert.equal(item.data.slug, "synthetic-local-image");
    assert.equal(item.data.registrationUrl, "https://example.test/registration");
    assert.equal(item.attachments.length, 1, "Prepared image uploaded persistently");
    await page.locator('[data-action="submit-preview"]').click();
    await waitIdle(page);
    assert.equal(item.status, "SUBMITTED", "Local image follows the existing news submission path");
    assert.equal(item.data.image, "", "Local-only paths must not be persisted as deployed assets");
    const published = toPublicNewsItem({ ...item, status: "PUBLISHED" }, item.attachments, language);
    assert.equal(published.image, `/api/staff/public/news/${item.id}/attachments/synthetic-image`, "Published image uses persistent storage");
    assert.equal(published.id, "synthetic-local-image", "Public article ID stays derived from the existing slug");
    assert.equal(published.registrationUrl, "https://example.test/registration");
    assert.ok(payloads.every((payload) => !Object.keys(payload.data).some((key) => key.startsWith("_"))), "Preview blobs must not be stored in news data");
    assert.deepEqual(unexpectedApis, [], "Only expected storage endpoints are called");
    console.log(`PASS local news ${width}px ${language}: no-image draft, cancel/denied/wrong folder, selection/conflict guards, unique local saves, preview/submit, preserved fields/slug/id, persistent image upload`);
    await page.close();
  }
  assert.deepEqual(failures, [], "Browser page errors");
  assert.deepEqual(consoleErrors, [], "Browser console errors");
  assert.deepEqual(blockedRequests, [], "No external network requests");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

async function waitIdle(page) {
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
}

async function checkLayout(page, width) {
  const result = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll("#submissionForm input, #submissionForm button, #submissionForm .staff-field")]
      .filter((element) => element.getClientRects().length)
      .filter((element) => element.getBoundingClientRect().right > innerWidth + 1 || element.getBoundingClientRect().left < -1)
      .map((element) => element.id || element.className)
  }));
  assert.ok(result.width <= width, `Page overflow at ${width}px: ${JSON.stringify(result)}`);
  assert.deepEqual(result.overflow, [], `Controls overflow at ${width}px`);
}

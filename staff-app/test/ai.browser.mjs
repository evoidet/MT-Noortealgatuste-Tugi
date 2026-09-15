// Uses the real local backend and SDK with test-only provider/DB/mail dependencies.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const original = "Meie üritus toimus eile ja seal osales palju noored. Üritus oli väga tore ja inimesed sai palju uusi teadmisi.";
const corrected = "Meie üritus toimus eile ja seal osales palju noori. Üritus oli väga tore ja inimesed said palju uusi teadmisi.";
const child = process.platform === "win32"
  ? spawn("wsl.exe", ["-d", "Ubuntu", "--cd", "/home/egors/MT-Noortealgatuste-Tugi", "--", "node", "staff-app/test/helpers/ai-browser-server.mjs"])
  : spawn(process.execPath, [new URL("helpers/ai-browser-server.mjs", import.meta.url).pathname]);
let stderr = "";
child.stderr.on("data", (chunk) => { stderr += chunk; });
let browser;
try {
  const info = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Test backend startup timed out: ${stderr}`)), 30000);
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const line = output.split(/\r?\n/).find((entry) => entry.startsWith('{"port":'));
      if (line) { clearTimeout(timer); resolve(JSON.parse(line)); }
    });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Test backend exited ${code}: ${stderr}`)); });
  });
  const origin = `http://127.0.0.1:${info.port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.context().addCookies([{ name: info.cookie, value: "synthetic-session", url: origin }]);
  await page.route("**/*", (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  for (const [type, fields] of [["news", [["newsTitle", "news.title"], ["newsSummary", "news.summary"], ["newsContent", "news.content"]]],
    ["expense", [["expenseActivity", "expense.activity"], ["expensePurpose", "expense.goal"], ["expenseResult", "expense.result"]]]]) {
    // Independent simulated users keep each scenario below the real 12-per-10-minute limit.
    await page.context().addCookies([{ name: info.cookie, value: `synthetic-session-${type}`, url: origin }]);
    await page.goto(`${origin}/admin/`);
    await page.locator("#authenticatedShell").waitFor({ state: "visible" });
    await page.locator(`[data-action="start-form"][data-type="${type}"]`).first().click();
    for (const [id, field] of fields) {
      await page.locator(`#${id}`).fill(original);
      await page.locator(`[data-action="open-ai"][data-target="${id}"]`).click();
      await page.locator("#aiMode").selectOption("fix_language");
      const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/staff/ai/improve"));
      await page.locator("#aiGenerateButton").click();
      const response = await responsePromise;
      assert.equal(response.status(), 200);
      assert.equal(response.request().postDataJSON().field, field);
      await page.locator("#aiUseButton:enabled").waitFor();
      assert.equal(await page.locator("#aiSuggestion").innerText(), corrected);
      assert.equal(await page.locator(`#${id}`).inputValue(), original);
      await page.locator("#aiUseButton").click();
      assert.equal(await page.locator(`#${id}`).inputValue(), corrected);
      await page.request.post(`${origin}/__test/ai`, { data: { behavior: "authentication" } });
      await page.locator(`[data-action="open-ai"][data-target="${id}"]`).click();
      const failed = page.waitForResponse((response) => response.url().endsWith("/api/staff/ai/improve"));
      await page.locator("#aiGenerateButton").click();
      assert.equal((await failed).status(), 502);
      await page.locator("#aiGenerateButton:enabled").waitFor();
      assert.equal(await page.locator(`#${id}`).inputValue(), corrected);
      assert.equal(await page.locator("#aiUseButton").isDisabled(), true);
      assert.match(await page.locator("#aiSuggestion").innerText(), /Algne tekst säilis/);
      await page.keyboard.press("Escape");
      await page.locator("#aiDialog").waitFor({ state: "hidden" });
      assert.equal(await page.locator('#submissionForm button[type="submit"]').isEnabled(), true);
      await page.request.post(`${origin}/__test/ai`, { data: { behavior: "success" } });
      console.log(`PASS ${field}: browser → authenticated HTTP → SDK mock → suggestion → explicit apply; failure preserves text`);
    }
    // A closed dialog's delayed response must never populate the next field.
    await page.request.post(`${origin}/__test/ai`, { data: { behavior: "success", delay: 500 } });
    await page.locator(`[data-action="open-ai"][data-target="${fields[0][0]}"]`).click();
    const late = page.waitForResponse((response) => response.url().endsWith("/api/staff/ai/improve"));
    await page.locator("#aiGenerateButton").click();
    await page.keyboard.press("Escape");
    await page.locator(`[data-action="open-ai"][data-target="${fields[1][0]}"]`).click();
    await late;
    assert.equal(await page.locator("#aiUseButton").isDisabled(), true);
    await page.keyboard.press("Escape");
    await page.request.post(`${origin}/__test/ai`, { data: { behavior: "success" } });
  }
  const observed = await (await page.request.get(`${origin}/__test/ai`)).json();
  assert.equal(observed.calls.length, 14);
  assert.deepEqual(errors, []);
  console.log("PASS both dialog cancellation races; 14 calls reached mocked provider via real SDK; no browser errors");
} finally {
  await browser?.close();
  child.stdin.end();
}

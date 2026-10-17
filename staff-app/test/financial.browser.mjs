// Browser UI only, synthetic HTTP responses; no provider or database connection.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
import { organization } from "../src/organization.js";
import { totals } from "../public/financial-values.js";
const { chromium } = createRequire(import.meta.url)("playwright");
const output = resolve("staff-app/private/generated/browser-review");
await mkdir(output, { recursive: true });
let doc,
  financeAccess = true,
  actor = { name: "Egor Stepanov", email: "egor.stepanov@noortetugi.ee" },
  uncertainDelivery = false,
  sends = 0;
const issuer = {
  ...organization,
  vatRegistered: false,
  vatRate: 0,
  vatNumber: "",
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost"),
    path = url.pathname;
  const json = (value) =>
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify(value));
  if (path === "/api/staff/session")
    return json({
      authenticated: true,
      csrfToken: "synthetic",
      user: {
        id: "test",
        name: actor.name,
        email: actor.email,
        role: "member",
      },
      permissions: ["news:create", "expense:create"],
      financialAccess: financeAccess,
      documentTemplates: {},
      reimbursementRecipients: [],
    });
  if (path === "/api/staff/submissions") return json({ submissions: [] });
  if (path === "/api/staff/financial/settings")
    return json({ issuer, financeEmail: "egor.stepanov@noortetugi.ee" });
  if (path.startsWith("/api/staff/financial")) {
    if (req.method === "GET")
      return json(
        path === "/api/staff/financial"
          ? { documents: doc ? [doc] : [], hasMore: false }
          : { document: doc, history: [] },
      );
    assert.equal(req.headers["x-csrf-token"], "synthetic");
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks));
    if (path.endsWith("/finalize"))
      doc = { ...doc, status: "READY", version: doc.version + 1 };
    else if (path.endsWith("/send")) {
      assert.equal(body.confirmed, true);
      sends++;
      doc = { ...doc, status: uncertainDelivery ? "UNCERTAIN" : "SENT" };
      if (uncertainDelivery) return res.writeHead(409, { "Content-Type": "application/json" }).end(JSON.stringify({ document: doc, error: "Saatmise tulemus vajab kontrolli." }));
    } else
      doc = {
        ...doc,
        id: body.id || doc.id,
        kind: body.kind || doc.kind,
        issuer,
        number: "TEST-HP-000001",
        status: "DRAFT",
        creator_name: "Testkasutaja",
        version: (doc?.version || 0) + 1,
        data: { ...body.data, totals: totals(body.data.items, 0, { allowIncomplete: true }) },
      };
    return json({ document: doc });
  }
  let file;
  if (path === "/admin" || path === "/admin/")
    file = "staff-app/public/index.html";
  else if (/^\/admin\/[a-z-]+\.(js|css)$/.test(path))
    file = `staff-app/public/${path.split("/").at(-1)}`;
  else if (
    ["/style.css", "/news.css", "/translations.js", "/i18n.js"].includes(
      path,
    ) ||
    /^\/assets\/[a-zA-Z0-9_./-]+$/.test(path)
  )
    file = path.slice(1);
  if (!file || file.includes("..")) return res.writeHead(404).end();
  try {
    const bytes = await readFile(file);
    res
      .writeHead(200, {
        "Content-Type":
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".png": "image/png",
          }[extname(file)] || "application/octet-stream",
      })
      .end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (r) =>
    r.request().url().startsWith(origin) ? r.continue() : r.abort(),
  );
  for (const width of [1440, 390]) {
   await page.setViewportSize({ width, height: 900 });
   for (const identity of [{ name: "Egor Stepanov", email: "egor.stepanov@noortetugi.ee" }, { name: "Mihhail Komarov", email: "mihhail.komarov@noortetugi.ee" }]) {
    actor = identity;
    await page.goto(`${origin}/admin`);
    for (const [kind, heading] of [["invoice", "Arved"], ["quotation", "Hinnapakkumised"]]) {
      await page.locator(`.staff-action-card[data-view="financial"][data-type="${kind}"]`).click();
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      assert.equal(await page.locator(`.staff-sidebar-nav [data-view="financial"][data-type="${kind}"]`).getAttribute("aria-current"), "page");
      await page.locator(`[data-finance="new-${kind}"]`).click();
      await page.getByLabel("Tellija nimi", { exact: true }).waitFor();
      await page.locator("#brandHomeButton").click();
    }
   }
   await page.screenshot({path:resolve(output,`financial-actions-${width}.png`),fullPage:true});
  }
  await page.screenshot({path:resolve(output,"financial-actions-mobile.png"),fullPage:true});
  await page.locator('.staff-action-card[data-view="resignation"]').click();
  await page.getByText("Lahkumisavalduse vorm on koostamisel.").waitFor();
  await page.locator("#brandHomeButton").click();
  await page.locator('.staff-action-card[data-view="financial"][data-type="quotation"]').click();
  await page
    .getByRole("button", { name: "Hinnapakkumised → Loo uus hinnapakkumine" })
    .click();
  await page.getByRole("button", { name: "Salvesta mustand", exact: true }).click();
  await page.getByRole("heading", { name: "Hinnapakkumine TEST-HP-000001" }).waitFor();
  assert.equal(doc.data.items[0].unitPrice, "");
  await page.getByRole("button", { name: "Kinnita ja loo PDF" }).click();
  await page.getByRole("alert").filter({ hasText: "Enne kinnitamist täitke" }).waitFor();
  assert.equal(doc.status, "DRAFT");
  await page.getByLabel("Tellija nimi", { exact: true }).fill("Testklient");
  await page.getByLabel("Aadress", { exact: true }).fill("Testi 1, Tallinn");
  await page.getByLabel("Kirjeldus", { exact: true }).fill("Testteenus");
  await page.getByLabel("Ühiku hind (€)", { exact: true }).fill("123,45");
  await page
    .getByRole("button", { name: "Salvesta mustand", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Hinnapakkumine TEST-HP-000001" })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await page.screenshot({
    path: resolve(output, "financial-mobile.png"),
    fullPage: true,
  });
  await page.reload();
  await page.locator('.staff-action-card[data-view="financial"][data-type="quotation"]').click();
  await page
    .getByRole("button", { name: "TEST-HP-000001", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Tellija nimi", { exact: true }).inputValue(),
    "Testklient",
  );
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Kinnita ja loo PDF" }).click();
  await page.getByRole("heading", { name: "Saada e-postiga" }).waitFor();
  assert.equal(sends, 0);
  await page.getByLabel("Saaja e-post").fill("customer@example.test");
  await page
    .getByRole("button", { name: "Saada dokument", exact: true })
    .click();
  assert.equal(sends, 0);
  await page.getByRole("checkbox").check();
  uncertainDelivery = true;
  await page.getByRole("button", { name: "Saada dokument", exact: true }).click();
  await page.getByText("Saatmise tulemus vajab kontrolli.", { exact: true }).waitFor();
  assert.equal(await page.locator('form[data-finance-form="send"]').count(), 0);
  assert.equal(sends, 1);
  // Independent successful-delivery fixture; no real retry or provider is involved.
  uncertainDelivery = false;
  doc.status = "READY";
  await page.reload();
  await page.locator('.staff-action-card[data-view="financial"][data-type="quotation"]').click();
  await page.getByRole("button", { name: "TEST-HP-000001", exact: true }).click();
  await page.getByLabel("Saaja e-post").fill("customer@example.test");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Saada dokument", exact: true })
    .click();
  await page
    .getByText("Testklient · 123,45", { exact: false })
    .first()
    .waitFor();
  await page.waitForFunction(
    () => !document.querySelector('form[data-finance-form="send"]'),
  );
  assert.equal(sends, 2);
  financeAccess = false;
  await page.reload();
  assert.equal(
    await page.locator('.staff-action-card[data-view="financial"]').count(),
    0,
  );
  assert.equal(
    await page.locator('.staff-action-card[data-view="resignation"]').count(),
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: financial mobile forms, persistence UI, confirmation, access visibility and resignation placeholder. No real emails.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

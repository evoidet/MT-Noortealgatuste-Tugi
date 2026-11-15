// Synthetic browser fixture. Blocks external network and loads no mail service.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { departureDocument, followUp } from '../public/resignation-values.js';
import { organization } from '../src/organization.js';

const { chromium } = createRequire(import.meta.url)(process.argv[2] || 'playwright');
const output = resolve('staff-app/private/generated/resignation-review');
await mkdir(output, { recursive: true });
const docs = new Map();
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const json = (data, status = 200) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
  if (path === '/api/staff/session') return json({ authenticated: true, csrfToken: 'synthetic',
    user: { id: 'synthetic', name: 'Õie Ööäär', email: 'synthetic@example.test', role: 'member' },
    permissions: ['expense:create', 'news:create', 'invoice:create'], financialAccess: true, documentTemplates: {}, reimbursementRecipients: [] });
  if (path === '/api/staff/submissions') return json({ items: [] });
  if (path === '/api/staff/resignations/settings') return json({ organization });
  if (path.startsWith('/api/staff/resignations')) {
    const [, , , , id, action] = path.split('/');
    if (req.method === 'GET') return id ? json({ item: docs.get(id) }) : json({ items: [...docs.values()] });
    assert.equal(req.headers['x-csrf-token'], 'synthetic');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    const item = docs.get(id);
    if (action === 'preview') return json({ revision: item.revision, documents: item.data.actions.map(entry => ({
      kind: entry.kind, ...departureDocument(item.data, entry, organization), followUp: followUp(entry),
    })) });
    if (action === 'prepare') {
      assert.equal(body.confirm, true);
      item.workflow = { progress: Object.fromEntries(item.data.actions.map(entry => [entry.kind, { status: 'prepared' }])) };
      item.revision++;
      return json({ item });
    }
    if (action === 'progress') {
      item.workflow.progress[body.kind].status = body.status;
      item.revision++;
      return json({ item });
    }
    const saved = { id: id || body.id, data: body.data, status: 'DRAFT', revision: (item?.revision || 0) + 1 };
    docs.set(saved.id, saved);
    return json({ item: saved }, req.method === 'POST' ? 201 : 200);
  }
  let file;
  if (['/admin', '/admin/'].includes(path)) file = 'staff-app/public/index.html';
  else if (/^\/admin\/[a-z-]+\.(js|css)$/.test(path)) file = 'staff-app/public/' + path.split('/').at(-1);
  else if (['/style.css', '/news.css', '/translations.js', '/i18n.js', '/assets/logo.png', '/assets/logo-header.png'].includes(path)) file = path.slice(1);
  if (!file) return res.writeHead(404).end();
  try { res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[extname(file)] }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.goto(origin + '/admin');
  const archive = page.locator('.staff-action-card--archive');
  const departure = page.locator('.staff-action-card--departure');
  await archive.waitFor();
  for (const card of [archive, departure]) {
    assert.equal(await card.locator('.staff-action-icon svg').count(), 1);
    assert.equal(await card.locator('.staff-action-arrow').innerText(), '→');
  }
  await page.screenshot({ path: resolve(output, 'dashboard-desktop.png'), fullPage: true });
  await departure.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Loo uus avaldus' }).click();
  assert.equal(await page.locator('[name="name"]').inputValue(), 'Õie Ööäär');
  assert.equal(await page.locator('[name="email"]').inputValue(), 'synthetic@example.test');
  assert.equal(await page.locator('[data-choice]:checked').count(), 0);
  await page.locator('[data-choice][value="mandate"]').check();
  await page.locator('[data-kind="mandate"] select[name="termination"]').selectOption('extraordinary');
  await page.getByText(/Kirjeldage põhjuses/).waitFor();
  await page.locator('[data-choice][value="mandate"]').uncheck();
  assert.equal(await page.locator('[name="contractDate"]').count(), 0);
  await page.locator('[data-choice][value="board"]').check();
  await page.locator('[data-kind="board"] [name="role"]').fill('Finantsjuht');
  await page.locator('[name="boardCount"]').fill('3');
  await page.locator('[data-choice][value="member"]').check();
  await page.locator('[data-choice][value="volunteer"]').check();
  await page.locator('[name="writtenAgreement"]').check();
  await page.getByText('Kontrollige kokkuleppe lõpetamise tingimusi eraldi.').waitFor();
  await page.locator('[data-choice][value="volunteer"]').uncheck();
  assert.equal(await page.locator('[data-kind="board"] [name="role"]').inputValue(), 'Finantsjuht');
  await page.getByRole('button', { name: 'Vaata avaldused üle' }).click();
  await page.getByRole('heading', { name: 'Kinnita valitud avaldused' }).waitFor();
  assert.equal(await page.locator('.resignation-paper').count(), 2);
  assert.equal(await page.getByText(/jääks juhatusse alla kolme/).count(), 1);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: resolve(output, 'departure-review-' + width + '.png'), fullPage: true });
  }
  await page.getByRole('checkbox', { name: 'Kinnitan valitud suhted, saajad ja avalduste sisu.' }).check();
  await page.getByRole('button', { name: 'Koosta avaldused', exact: true }).click();
  await page.getByRole('heading', { name: 'Koostatud avaldused' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Laadi PDF alla' }).count(), 2);
  assert.equal(await page.getByRole('link', { name: 'Laadi DOCX alla' }).count(), 2);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-resign="progress"][data-kind="board"]').click();
  await page.getByText('Avaldus edastatud', { exact: true }).waitFor();
  assert.equal(await page.getByText('Avaldus koostatud', { exact: true }).count(), 1);
  assert.deepEqual(errors, []);
  console.log('PASS: dashboard icons, keyboard navigation, desktop and mobile review, conditional fields, separate exports and follow-up.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}

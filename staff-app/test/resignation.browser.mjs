// Synthetic browser fixture: external network is blocked and no mail service is loaded.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { addDays, tallinnToday } from '../public/resignation-values.js';
const { chromium } = createRequire(import.meta.url)(process.argv[2] || 'playwright');
const output = resolve('staff-app/private/generated/resignation-review');
await mkdir(output, { recursive: true });
const docs = new Map();
let sends = 0, aiCalls = 0;
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const json = (data, status = 200) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
  const employer = { name: 'MTÜ Noortealgatuste Tugi', registrationCode: '80652930', address: 'Näidisaadress' };
  if (path === '/api/staff/session') return json({ authenticated: true, csrfToken: 'synthetic', user: { id: 'synthetic', name: 'Õie Ööäär', email: 'synthetic@example.test', role: 'member' }, permissions: ['expense:create', 'news:create'], financialAccess: false, documentTemplates: {}, reimbursementRecipients: [] });
  if (path === '/api/staff/submissions') return json({ items: [] });
  if (path === '/api/staff/resignations/settings') return json({ employer, recipient: 'juhatus@noortetugi.ee', submissionSupported: false, submissionExplanation: 'Elektrooniline esitamine ei ole veel toetatud: puudub kontrollitud seos konto ja töötaja töösuhte vahel.' });
  if (path.startsWith('/api/staff/resignations') || path === '/api/staff/ai/improve') {
    if (req.method === 'GET') {
      if (path.endsWith('/pdf')) return res.writeHead(200, { 'Content-Type': 'application/pdf' }).end(await readFile(resolve(output, 'ordinary.pdf')));
      if (path === '/api/staff/resignations') return json({ items: [...docs.values()] });
      return json({ item: docs.get(path.split('/').at(-1)) });
    }
    assert.equal(req.headers['x-csrf-token'], 'synthetic');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    if (path === '/api/staff/ai/improve') { aiCalls++; return json({ suggestion: 'Töötasu on maksmata.' }); }
    if (path.endsWith('/submit')) { sends++; return json({ error: 'Esitamine ei ole toetatud.' }, 409); }
    if (path.endsWith('/preview')) { const id = path.split('/').at(-2); return json({ revision: docs.get(id).revision, pdfUrl: `/api/staff/resignations/${id}/pdf` }); }
    const id = body.id || path.split('/').at(-1);
    const item = { id, data: body.data, status: 'DRAFT', revision: (docs.get(id)?.revision || 0) + 1 };
    docs.set(id, item); return json({ item }, req.method === 'POST' ? 201 : 200);
  }
  let file;
  if (['/admin', '/admin/'].includes(path)) file = 'staff-app/public/index.html';
  else if (/^\/admin\/[a-z-]+\.(js|css)$/.test(path)) file = `staff-app/public/${path.split('/').at(-1)}`;
  else if (['/style.css', '/news.css', '/translations.js', '/i18n.js', '/assets/logo.png', '/assets/logo-header.png'].includes(path)) file = path.slice(1);
  if (!file) return res.writeHead(404).end();
  try { res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[extname(file)] }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.goto(`${origin}/admin`);
  await page.locator('.staff-action-card[data-view="resignation"]').click();
  await page.getByRole('button', { name: 'Loo uus avaldus', exact: true }).click();
  await page.locator('[name="employeeName"]').fill('Õie Ööäär');
  await page.locator('[name="lastDay"]').fill(addDays(tallinnToday(), 30));
  await page.locator('[name="employmentConfirmed"]').check();
  await page.getByRole('button', { name: 'Vaata näidist', exact: true }).click();
  assert.equal(await page.locator('[name="employeeName"]').inputValue(), 'Õie Ööäär');
  await page.getByRole('button', { name: 'Tagasi oma avaldusele', exact: true }).click();
  await page.getByRole('button', { name: 'Täida näidisandmetega', exact: true }).click();
  assert.equal(await page.locator('[name="employeeName"]').inputValue(), 'Õie Ööäär');
  await page.getByRole('button', { name: 'Tühista', exact: true }).click();
  await page.locator('[name="contractType"]').selectOption('fixed');
  assert.equal(await page.locator('[data-fixed]').isVisible(), true);
  await page.locator('[name="contractType"]').selectOption('indefinite');
  await page.locator('[name="terminationType"]').selectOption('probation');
  assert.equal(await page.locator('[data-probation]').isVisible(), true);
  await page.locator('[name="terminationType"]').selectOption('extraordinary');
  await page.locator('[name="reason"]').fill('Töötasu on maksmatta.');
  await page.getByRole('button', { name: 'Kontrolli teksti tehisintellektiga', exact: true }).click();
  await page.getByRole('button', { name: 'Rakenda parandused', exact: true }).waitFor();
  assert.equal(await page.locator('[name="reason"]').inputValue(), 'Töötasu on maksmatta.');
  await page.getByRole('button', { name: 'Rakenda parandused', exact: true }).click();
  assert.equal(await page.locator('[name="reason"]').inputValue(), 'Töötasu on maksmata.');
  assert.equal(aiCalls, 1);
  await page.locator('[name="terminationType"]').selectOption('ordinary');
  await page.getByRole('button', { name: 'Salvesta mustand', exact: true }).click();
  await page.getByRole('button', { name: 'Eelvaade', exact: true }).click();
  await page.locator('.resignation-paper').waitFor();
  await page.getByText('Vaata PDF-i eelvaadet', { exact: true }).click();
  await page.locator('.resignation-pdf').waitFor();
  await page.getByText('Vaata PDF-i eelvaadet', { exact: true }).click();
  await page.getByRole('button', { name: 'Esita avaldus juhatusele', exact: true }).click();
  await page.locator('[data-confirm]').getByText(/Elektrooniline esitamine ei ole veel toetatud/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Kinnitan ja saadan avalduse' }).count(), 0);
  assert.equal(sends, 0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: resolve(output, `resignation-${width}.png`), fullPage: true });
  }
  await page.locator('[name="position"]').fill('Säiliv muudatus');
  await page.locator('#brandHomeButton').click();
  await page.locator('.staff-action-card[data-view="resignation"]').click();
  assert.equal(await page.locator('[name="position"]').inputValue(), 'Säiliv muudatus');
  assert.deepEqual(errors, []);
  console.log('PASS: existing entry, desktop/mobile layout, conditional fields, non-destructive examples, AI approval, PDF preview, unsaved navigation and safe submission block. No real emails.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }

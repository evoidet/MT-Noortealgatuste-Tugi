// Local public assets only. No external services, credentials or application server.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = resolve('.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!file.startsWith(root + sep) || !types[extname(file)] || /(?:^|\/)\.|secret|credential|staff-app/i.test(path)) return res.writeHead(404).end();
  try { res.writeHead(200, { 'Content-Type': types[extname(file)] }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const output = resolve('staff-app/private/generated/gallery-review');
await mkdir(output, { recursive: true });
try {
  for (const width of [1440, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.addInitScript(() => {
      const NativeDate = Date;
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : ['2026-10-30T12:00:00+02:00'])); }
        static now() { return new NativeDate('2026-10-30T12:00:00+02:00').getTime(); }
      };
    });
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin);
    await page.locator('.halloween-pumpkin--intro').waitFor();
    assert.equal(await page.locator('.halloween-pumpkin').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    // Real controls remain available during the introduction.
    await page.locator('.language-switcher [data-lang="en"]').click();
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: resolve(output, `halloween-${width}.png`) });
    await page.waitForTimeout(3500);
    assert.equal(await page.locator('.halloween-pumpkin--intro').count(), 0);
    await page.reload();
    await page.locator('.halloween-pumpkin').waitFor();
    assert.equal(await page.locator('.halloween-pumpkin--intro').count(), 0, 'no repeated session entrance');
    assert.deepEqual(await page.locator('.home-leadership-grid h3').allTextContents(), ['Jekaterina Rogožina', 'Egor Stepanov', 'Sofia Germ', 'Mario Polshin']);
    assert.equal(await page.locator('.team-photo-clickable').count(), 8);
    assert.equal(await page.locator('.home-leadership-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), width > 1000 ? 4 : width > 540 ? 2 : 1);
    for (const lang of ['ru', 'en', 'et']) {
      await page.evaluate(lang => window.I18N.setLanguage(lang), lang);
      for (const caption of await page.locator('.home-person-role').all()) {
        assert.equal(await caption.isVisible(), true);
        assert.ok((await caption.innerText()).trim());
      }
      assert.ok(await page.locator('.home-person-info h3').evaluateAll(nodes => nodes.every(n => n.getBoundingClientRect().right <= innerWidth)));
    }
    assert.equal(await page.locator('[data-i18n="home.team.executiveDirector"]').innerText(), 'Tegevjuht / CEO');
    const photo = page.locator('.team-photo-clickable').first();
    await photo.scrollIntoViewIfNeeded();
    await photo.focus();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.home-person-info').first().isVisible(), true);
    assert.equal(await photo.evaluate(el => getComputedStyle(el).borderWidth), '0px');
    const before = await photo.boundingBox();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    const modal = page.locator('#photoModal');
    assert.equal(await modal.getAttribute('aria-hidden'), 'false');
    assert.equal(await page.locator('.photo-modal-close').evaluate(el => el === document.activeElement), true);
    const after = await photo.boundingBox();
    assert.ok(Math.abs(before.x - after.x) < 1 && Math.abs(before.y - after.y) < 1, 'background must not shift');
    const image = page.locator('#photoModalImage');
    await image.evaluate(el => el.decode());
    const box = await image.boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 900);
    assert.ok(await image.evaluate(el => Math.abs(el.clientWidth / el.clientHeight - el.naturalWidth / el.naturalHeight) < .01));
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('.photo-modal-close').evaluate(el => el === document.activeElement), true);
    await page.screenshot({ path: resolve(output, `modal-${width}.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    assert.equal(await modal.isVisible(), false);
    assert.equal(await photo.evaluate(el => el === document.activeElement && !el.closest('[inert]')), true);
    for (const close of ['backdrop', 'button']) {
      await photo.click();
      await page.waitForTimeout(700);
      if (close === 'backdrop') await page.mouse.click(4, 450);
      else await page.locator('.photo-modal-close').click();
      await page.waitForTimeout(500);
      assert.equal(await modal.isVisible(), false);
    }
    await page.screenshot({ path: resolve(output, `gallery-${width}.png`) });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.seasonal-effects').count(), 0);
    assert.equal(await page.locator('.halloween-pumpkin').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.evaluate(async () => {
      const source = document.querySelector('script[src*="seasonal-effects.js"]').src;
      const {createSeasonalEffects} = await import(source);
      createSeasonalEffects().destroy();
      createSeasonalEffects({now: () => new Date('2026-11-02T12:00:00+02:00')});
    });
    assert.equal(await page.locator('.halloween-pumpkin').count(), 0);
    await page.close();
    console.log(`Team gallery passed at ${width}px`);
  }
} finally { await browser.close(); server.close(); }

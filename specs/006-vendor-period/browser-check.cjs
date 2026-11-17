// Browser verification for spec 006 (vendor chart period).
// Needs Playwright (not a project dependency). From the repo root:
//   python3 -m http.server 8765 --directory site &
//   node specs/006-vendor-period/browser-check.cjs specs/006-vendor-period/evidence
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8765/';
const OUT = process.argv[2];
const results = [];
const check = (id, name, ok, detail = '') => results.push({ id, name, ok: Boolean(ok), detail: String(detail) });
const errors = [];
const external = [];

const bars = (page) => page.$$eval('#chart-vendors .vendor-bar', (bs) => bs.map((b) => ({
  vendor: b.dataset.vendor, count: Number(b.querySelector('.vendor-bar__count').textContent.replace(/\D/g, '')),
})));
const subtitle = (page) => page.textContent('#vendor-period-label');
const matches = async (page) => Number(((await page.textContent('#result-count')) || '').split(' ')[0].replace(/\D/g, ''));

async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.on('request', (r) => { if (!r.url().startsWith(BASE)) external.push(r.url()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#chart-vendors .vendor-bar');
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch();
  const { ctx, page } = await open(browser);

  // AC-2: default 12 months
  const def = await bars(page);
  check('AC-2', 'Opens on 12 months', (await page.isChecked('input[name="vendor-period"][value="365"]')) && (await subtitle(page)).startsWith('last 12 months'),
    `${await subtitle(page)} · ${def.slice(0, 3).map((b) => `${b.vendor} ${b.count}`).join(', ')}`);
  await page.locator('#vendor-period').scrollIntoViewIfNeeded();
  await page.locator('.charts').screenshot({ path: path.join(OUT, '12-months.png') });

  await page.click('#vendor-period label:has-text("90 days")');
  const d90 = await bars(page);
  check('AC-2', '90 days redraws bars and subtitle', (await subtitle(page)).startsWith('last 90 days') && JSON.stringify(d90) !== JSON.stringify(def),
    d90.slice(0, 3).map((b) => `${b.vendor} ${b.count}`).join(', '));
  await page.locator('.charts').screenshot({ path: path.join(OUT, '90-days.png') });

  await page.click('#vendor-period label:has-text("All time")');
  const all = await bars(page);
  check('AC-2', 'All time shows the old totals', (await subtitle(page)).startsWith('all time') && all[0].vendor === 'Microsoft' && all[0].count > 300,
    all.slice(0, 2).map((b) => `${b.vendor} ${b.count}`).join(', '));

  // AC-3: tap a bar in each period → list filtered to vendor + same period, same count
  for (const [value, windowValue] of [['365', '365'], ['90', '90'], ['0', '0']]) {
    await page.check(`input[name="vendor-period"][value="${value}"]`);
    const top = (await bars(page))[0];
    await page.click(`#chart-vendors .vendor-bar[data-vendor="${top.vendor}"]`);
    await page.waitForTimeout(150);
    const n = await matches(page);
    const win = await page.$eval('input[name="window"]:checked', (i) => i.value);
    const pressed = await page.getAttribute(`#chart-vendors .vendor-bar[data-vendor="${top.vendor}"]`, 'aria-pressed');
    check('AC-3', `Tap ${top.vendor} (${value || 'all'}): list = bar`, n === top.count && win === windowValue && pressed === 'true',
      `bar ${top.vendor} ${top.count}, list ${n} matches, Added=${win}, pressed=${pressed}`);
    await page.click(`#chart-vendors .vendor-bar[data-vendor="${top.vendor}"]`); // untap
  }

  // AC-4 keyboard: focus the checked radio, arrow keys move the period
  await page.check('input[name="vendor-period"][value="365"]');
  await page.focus('input[name="vendor-period"][value="365"]');
  await page.keyboard.press('ArrowRight');
  const afterArrow = await page.$eval('input[name="vendor-period"]:checked', (i) => i.value);
  const focusVisible = await page.$eval('input[name="vendor-period"]:checked + span', (s) => getComputedStyle(s).outlineStyle);
  check('AC-4', 'Arrow key changes the period', afterArrow === '90' && (await subtitle(page)).startsWith('last 90 days'), `now ${afterArrow}, outline ${focusVisible}`);
  await ctx.close();

  // AC-4: 360 px, and a Swedish browser
  const phone = await open(browser, { viewport: { width: 360, height: 800 }, locale: 'sv-SE' });
  const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const box = await phone.page.locator('#vendor-period').boundingBox();
  check('AC-4', '360 px: no horizontal scroll, switch fits', overflow <= 0 && box.x >= 0 && box.x + box.width <= 360, `overflow ${overflow}px, switch ${Math.round(box.x)}–${Math.round(box.x + box.width)}`);
  check('FR-6', 'Swedish browser: English subtitle', (await subtitle(phone.page)).startsWith('last 12 months'), await subtitle(phone.page));
  await phone.page.locator('.charts').screenshot({ path: path.join(OUT, 'phone-360.png') });
  await phone.ctx.close();

  check('AC-5', 'No external requests, no errors', external.length === 0 && errors.length === 0, `external ${external.length}, errors ${errors.join(' | ') || 0}`);
  await browser.close();

  fs.writeFileSync(path.join(OUT, '..', 'browser-results.json'), JSON.stringify(results, null, 2) + '\n');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name} — ${r.detail}`);
  console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();

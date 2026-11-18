// Browser verification for spec 007 (Today page, /exploited/ move, light/dark, new look).
// Needs Playwright (not a project dependency). From the repo root:
//   python3 scripts/build_feeds.py --base-url http://localhost:8765/
//   python3 -m http.server 8765 --directory site &
//   node specs/007-briefing-redesign/browser-check.cjs specs/007-briefing-redesign/evidence
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE = process.env.SITE || 'http://localhost:8765/';
const OUT = process.argv[2];
const DATA = path.join(__dirname, '..', '..', 'site', 'data');
const PAGES = ['', 'exploited/', 'sitrep/', 'ransomware/', 'feeds/'];
const THEME_KEY = 'threat-radar.theme.v1';
const results = [];
const check = (id, name, ok, detail = '') => results.push({ id, name, ok: Boolean(ok), detail: String(detail) });
const errors = [];
const requests = [];

async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  ctx.on('request', (r) => requests.push(r.url()));
  return ctx;
}
async function open(ctx, url, { allow404 = false } = {}) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (allow404 && /404/.test(m.text())) return; // AC-3 deliberately removes data files
    errors.push(`${url}: console ${m.text()}`);
  });
  page.on('dialog', (d) => { errors.push(`${url}: unexpected dialog`); d.dismiss(); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  return page;
}
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim());
const bgOf = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const LIGHT_BG = 'rgb(246, 247, 249)';
const DARK_BG = 'rgb(14, 17, 22)';

(async () => {
  const { firstSentence, weekLine, todayNumbers, newest } = await import(path.join(__dirname, '..', '..', 'site', 'today-logic.js'));
  const kev = JSON.parse(fs.readFileSync(path.join(DATA, 'kev.json'), 'utf8'));
  const sitrep = JSON.parse(fs.readFileSync(path.join(DATA, 'sitrep', 'index.json'), 'utf8')).issues[0];
  const bw = JSON.parse(fs.readFileSync(path.join(DATA, 'breachwire', 'index.json'), 'utf8')).issues[0];
  const browser = await chromium.launch();

  // ---------- AC-1 / AC-2: the Today page shows the right things ----------
  const ctx = await newContext(browser);
  let page = await open(ctx, SITE);
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const n = todayNumbers(kev, bw, today);
  const shown = {
    headline: await text(page, '#today-headline'),
    week: await text(page, '#today-week'),
    numbers: [await text(page, '#glance-week'), await text(page, '#glance-month'), await text(page, '#glance-claims'), await text(page, '#glance-sweden')],
    kev: await page.$$eval('#today-kev .today-item__code', (els) => els.map((e) => e.textContent)),
    sitrep: await page.$$eval('#today-sitrep .today-item__title', (els) => els.length),
    bars: await page.$$eval('#bw-bars .today-bar__n', (els) => els.map((e) => e.textContent)),
    months: await page.$$eval('.today-chart__col', (els) => els.length),
    bwTitle: await text(page, '#col-bw'),
  };
  check('AC-1', 'Today shows headline, week line, 4 numbers, 3 columns and the trend from the live data',
    shown.headline === firstSentence(sitrep.tldr) && shown.week === weekLine(kev, today) &&
    JSON.stringify(shown.numbers) === JSON.stringify([n.week, n.month, n.claims, n.sweden].map(String)) &&
    JSON.stringify(shown.kev) === JSON.stringify(newest(kev, 4).map((e) => e.cveID)) &&
    shown.sitrep === 3 && JSON.stringify(shown.bars) === JSON.stringify([bw.victims, bw.countries, bw.groups].map(String)) &&
    shown.months === 12 && shown.bwTitle === `Breach Wire №${bw.issue}`,
    JSON.stringify(shown));
  check('AC-2', 'Headline is the Sitrep\'s first sentence without bracketed asides, at most 160 characters',
    shown.headline.length <= 160 && !/[()]/.test(shown.headline), `${shown.headline.length} chars: "${shown.headline}"`);
  await page.screenshot({ path: path.join(OUT, 'today-light.png'), fullPage: true });
  await page.close();

  // ---------- AC-3: missing data ----------
  const ctxMissing = await newContext(browser);
  await ctxMissing.route(/data\/(sitrep|breachwire)\/index\.json$/, (route) => route.fulfill({ status: 404, body: 'gone' }));
  page = await open(ctxMissing, SITE, { allow404: true });
  const missing = {
    headline: await text(page, '#today-headline'),
    sitrep: await text(page, '#sitrep-meta'),
    bw: await text(page, '#bw-meta'),
    claims: await text(page, '#glance-claims'),
    sitrepButton: await page.isHidden('#today-sitrep-link'),
  };
  check('AC-3', 'Without a Sitrep or Breach Wire the page still renders with clear messages',
    missing.headline === 'This week in exploited vulnerabilities' && /No Sitrep has been published/.test(missing.sitrep) &&
    /No Breach Wire issue/.test(missing.bw) && missing.claims === '–' && missing.sitrepButton, JSON.stringify(missing));
  await ctxMissing.close();

  // ---------- AC-4: never victim names, even if the data grew a name field ----------
  const ctxPlant = await newContext(browser);
  await ctxPlant.route(/data\/breachwire\/index\.json$/, async (route) => {
    const real = JSON.parse(fs.readFileSync(path.join(DATA, 'breachwire', 'index.json'), 'utf8'));
    real.issues[0].victimNames = ['PLANTED VICTIM AB'];
    real.issues[0].victims_list = ['PLANTED VICTIM AB'];
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(real) });
  });
  page = await open(ctxPlant, SITE);
  const planted = (await page.evaluate(() => document.body.innerText)).includes('PLANTED VICTIM');
  check('AC-4', 'A victim name planted in the Breach Wire data never appears on Today', !planted, `planted name shown: ${planted}`);
  await ctxPlant.close();

  // ---------- AC-6: old links forward to /exploited/ ----------
  const forwards = {};
  for (const hash of ['#CVE-2026-123039', '#mystack', '#stack=' + encodeURIComponent(JSON.stringify({ Fortinet: [] }))]) {
    page = await open(ctx, SITE + hash);
    await page.waitForTimeout(300);
    const url = page.url();
    const state = hash.startsWith('#CVE') ? await page.isVisible('#detail')
      : hash === '#mystack' ? await page.isVisible('#picker') : await page.isVisible('#share-offer');
    forwards[hash.slice(0, 12)] = { landedOnExploited: url.startsWith(SITE + 'exploited/'), opened: state };
    await page.close();
  }
  page = await open(ctx, SITE);
  await page.goBack().catch(() => {});
  check('AC-6a', 'Old links (#CVE-…, #mystack, #stack=…) forward to the Exploited page and open the right thing',
    Object.values(forwards).every((f) => f.landedOnExploited && f.opened), JSON.stringify(forwards));
  const feed = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'feeds', 'kev.xml'), 'utf8');
  const entryLinks = [...feed.matchAll(/<entry>[\s\S]*?<link\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]);
  const ids = [...feed.matchAll(/<id>(tag:zelin\.se,2026:kev\/[^<]+)<\/id>/g)].map((m) => m[1]);
  check('AC-6b', 'Feed entries link to /exploited/#CVE-…, with unchanged tag: IDs',
    entryLinks.length === 50 && entryLinks.every((l) => /\/exploited\/#CVE-\d{4}-\d+$/.test(l)) && ids.length === 50,
    `${entryLinks.length} links, e.g. ${entryLinks[0]}; IDs e.g. ${ids[0]}`);
  await page.close();
  await ctx.close();

  // ---------- AC-7: themes ----------
  const theme = {};
  for (const scheme of ['light', 'dark']) {
    const c = await newContext(browser, { colorScheme: scheme });
    const p = await open(c, SITE);
    theme[scheme] = { bg: await bgOf(p), attr: await p.getAttribute('html', 'data-theme'), pressed: await p.getAttribute('[data-theme-toggle]', 'aria-pressed') };
    await c.close();
  }
  check('AC-7a', 'No choice stored: the page follows the device (light → light, dark → dark)',
    theme.light.bg === LIGHT_BG && theme.dark.bg === DARK_BG && !theme.light.attr && !theme.dark.attr &&
    theme.light.pressed === 'false' && theme.dark.pressed === 'true', JSON.stringify(theme));

  // Toggle, then every page and a reload stay dark, with data-theme set before <body> exists (no flash).
  const ctxT = await newContext(browser, { colorScheme: 'light' });
  await ctxT.addInitScript(() => {
    window.__themeBeforeBody = null;
    new MutationObserver((list, obs) => {
      if (document.body) { window.__themeBeforeBody = document.documentElement.getAttribute('data-theme'); obs.disconnect(); }
    }).observe(document, { childList: true, subtree: true });
  });
  page = await open(ctxT, SITE);
  await page.click('[data-theme-toggle]');
  const afterClick = { bg: await bgOf(page), stored: await page.evaluate((k) => localStorage.getItem(k), THEME_KEY), title: await page.getAttribute('[data-theme-toggle]', 'title') };
  await page.screenshot({ path: path.join(OUT, 'today-dark.png'), fullPage: true });
  const across = {};
  for (const p of PAGES) {
    await page.goto(SITE + p, { waitUntil: 'networkidle' });
    across[p || '/'] = { bg: await bgOf(page), beforeBody: await page.evaluate(() => window.__themeBeforeBody) };
    if (p) await page.screenshot({ path: path.join(OUT, `${p.replace('/', '')}-dark.png`) });
  }
  check('AC-7b', 'The toggle switches to dark, remembers it, and every page opens dark with no flash',
    afterClick.bg === DARK_BG && afterClick.stored === 'dark' && afterClick.title === 'Switch to light mode' &&
    Object.values(across).every((a) => a.bg === DARK_BG && a.beforeBody === 'dark'),
    `${JSON.stringify(afterClick)}; ${JSON.stringify(across)}`);
  await page.click('[data-theme-toggle]');
  const back = { bg: await bgOf(page), stored: await page.evaluate((k) => localStorage.getItem(k), THEME_KEY) };
  check('AC-7c', 'Tapping again returns to light and remembers that', back.bg === LIGHT_BG && back.stored === 'light', JSON.stringify(back));
  await ctxT.close();

  const ctxBlocked = await newContext(browser, { colorScheme: 'dark' });
  await ctxBlocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
  });
  page = await open(ctxBlocked, SITE);
  await page.click('[data-theme-toggle]');
  check('AC-7d', 'Blocked storage: the toggle still works for this page view, with no errors',
    (await bgOf(page)) === LIGHT_BG, `after click: ${await bgOf(page)}`);
  await ctxBlocked.close();

  // ---------- AC-9: every page at 360 px, keyboard, focus ----------
  const ctxPhone = await newContext(browser, { viewport: { width: 360, height: 780 } });
  const widths = {};
  for (const p of PAGES) {
    page = await open(ctxPhone, SITE + p);
    widths[p || '/'] = await page.evaluate(() => document.documentElement.scrollWidth);
    if (p === '' || p === 'exploited/') await page.screenshot({ path: path.join(OUT, `phone-${p.replace('/', '') || 'today'}.png`) });
    await page.close();
  }
  check('AC-9a', 'All five pages fit 360 px without sideways scrolling', Object.values(widths).every((w) => w <= 360), JSON.stringify(widths));

  const ctxKb = await newContext(browser);
  page = await open(ctxKb, SITE);
  const order = [];
  for (let i = 0; i < 8; i++) { // skip link, logo, 5 sections, toggle
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => {
      const a = document.activeElement;
      const style = getComputedStyle(a);
      return { label: (a.getAttribute('aria-label') || a.textContent).trim().slice(0, 24), outline: style.outlineStyle !== 'none' && style.outlineWidth !== '0px' };
    }));
  }
  const toggleStep = order.findIndex((o) => o.label === 'Dark mode');
  await page.keyboard.press('Enter');
  const kbDark = (await bgOf(page)) === DARK_BG;
  check('AC-9b', 'Keyboard: skip link, logo, all five sections, then the theme toggle, each with a visible focus ring; Enter toggles',
    order[0].label === 'Skip to the briefing' && toggleStep === 7 && order.slice(0, 8).every((o) => o.outline) && kbDark,
    order.map((o) => `${o.label}${o.outline ? '' : ' (NO RING)'}`).join(' → ') + `; Enter → dark: ${kbDark}`);
  await ctxKb.close();
  await ctxPhone.close();

  // ---------- AC-11: the (i) next to "Overdue" (added after release, owner's request) ----------
  const ctxTip = await newContext(browser, { viewport: { width: 1280, height: 1400 } });
  page = await open(ctxTip, SITE);
  const overdueRows = await page.$$eval('.today-item__due--overdue', (els) => els.length);
  const tipCount = await page.$$eval('.info-tip', (els) => els.length);
  const bubbleShown = () => page.$eval('.info-tip__bubble', (e) => getComputedStyle(e).display === 'block');
  await page.hover('.info-tip'); const onHover = await bubbleShown();
  await page.mouse.move(5, 5); const afterLeave = await bubbleShown();
  await page.focus('.info-tip'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); const onFocus = await bubbleShown();
  const tipText = await page.$eval('.info-tip__bubble', (e) => e.textContent);
  const described = await page.$eval('.info-tip', (b) => document.getElementById(b.getAttribute('aria-describedby'))?.textContent.length > 0);
  await ctxTip.close();
  const ctxTap = await newContext(browser, { viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  page = await open(ctxTap, SITE);
  await page.locator('.info-tip').first().scrollIntoViewIfNeeded();
  await page.tap('.info-tip');
  const tapOpen = await page.$eval('.info-tip', (b) => b.getAttribute('aria-expanded'));
  const stayed = page.url() === SITE;
  const box = await page.locator('.info-tip__bubble').first().boundingBox();
  await page.screenshot({ path: path.join(OUT, 'overdue-info-phone.png') });
  await page.keyboard.press('Escape');
  const escClosed = await page.$eval('.info-tip', (b) => b.getAttribute('aria-expanded'));
  await page.tap('.info-tip'); await page.tap('h1');
  const outsideClosed = await page.$eval('.info-tip', (b) => b.getAttribute('aria-expanded'));
  await ctxTap.close();
  check('AC-11', 'Each "Overdue" has an (i) that explains it on hover, keyboard focus and tap; Escape or a tap elsewhere closes it; it never opens the entry',
    overdueRows > 0 && tipCount === overdueRows && onHover && !afterLeave && onFocus && described && /CISA's patch deadline/.test(tipText) &&
    tapOpen === 'true' && stayed && box.x >= 0 && box.x + box.width <= 360 && escClosed === 'false' && outsideClosed === 'false',
    `${overdueRows} overdue, ${tipCount} tips; hover ${onHover}, leave ${afterLeave}, focus ${onFocus}; tap ${tapOpen}, stayed ${stayed}, bubble ${Math.round(box.x)}–${Math.round(box.x + box.width)} px; Escape ${escClosed}, outside ${outsideClosed}`);

  // ---------- AC-10: fonts from this site ----------
  const ctxF = await newContext(browser);
  page = await open(ctxF, SITE);
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return ['16px Inter', '16px "Space Grotesk"', '16px "JetBrains Mono"'].map((f) => document.fonts.check(f));
  });
  const fontRequests = requests.filter((u) => /\.woff2$/.test(u));
  check('AC-10', 'All three fonts load, only from this site',
    fonts.every(Boolean) && fontRequests.length > 0 && fontRequests.every((u) => u.startsWith(SITE + 'fonts/')),
    `loaded ${JSON.stringify(fonts)}; ${[...new Set(fontRequests)].map((u) => u.replace(SITE, '/')).join(', ')}`);
  await ctxF.close();

  const external = requests.filter((u) => /^https?:/.test(u) && !u.startsWith(SITE));
  check('AC-9c', '0 external requests; no page errors, console errors or pop-ups',
    external.length === 0 && errors.length === 0, `${requests.length} requests, external ${external.length}; errors: ${errors.join(' | ') || 'none'}`);

  await browser.close();
  fs.writeFileSync(path.join(OUT, '..', 'browser-results.json'), JSON.stringify(results, null, 2) + '\n');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(6)} ${r.name}\n        ${r.detail}`);
  console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();

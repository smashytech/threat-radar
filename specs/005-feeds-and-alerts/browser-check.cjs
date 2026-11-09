// Browser verification for spec 005 (Feeds page, autodiscovery, "Subscribe in a feed reader").
// Needs Playwright (not a project dependency). Build the feeds, serve the site, then run from the repo root:
//   python3 scripts/build_feeds.py --base-url http://localhost:8765/
//   python3 -m http.server 8765 --directory site &
//   node specs/005-feeds-and-alerts/browser-check.cjs specs/005-feeds-and-alerts/evidence
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8765/';
const OUT = process.argv[2];
const KEY = 'threat-radar.presets.v1';
const results = [];
const check = (id, name, ok, detail = '') => results.push({ id, name, ok: Boolean(ok), detail: String(detail) });
const requests = [];
const errors = [];

async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...opts });
  ctx.on('request', (r) => requests.push(r.url()));
  return ctx;
}
async function open(ctx, url) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${url}: console ${m.text()}`); });
  page.on('dialog', (d) => { errors.push(`${url}: unexpected dialog`); d.dismiss(); });
  await page.goto(url, { waitUntil: 'networkidle' });
  return page;
}
const stackRecord = (name, vendors) => JSON.stringify({ v: 1, active: name, lastSeen: null, presets: [{ name, myStackOnly: false, vendors }] });
async function seedStack(page, name, vendors) {
  await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [KEY, stackRecord(name, vendors)]);
  await page.reload({ waitUntil: 'networkidle' });
}
/** Click, catch the download, and parse the OPML with the browser's own XML parser. */
async function grabOpml(page, selector) {
  const before = requests.length;
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  const file = path.join(OUT, download.suggestedFilename());
  await download.saveAs(file);
  const text = fs.readFileSync(file, 'utf8');
  const parsed = await page.evaluate((xml) => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return {
      error: Boolean(doc.querySelector('parsererror')),
      title: doc.querySelector('head > title')?.textContent,
      outlines: [...doc.querySelectorAll('body > outline')].map((o) => ({ text: o.getAttribute('text'), xmlUrl: o.getAttribute('xmlUrl'), type: o.getAttribute('type') })),
    };
  }, text);
  const network = requests.slice(before).filter((u) => /^https?:/.test(u));
  return { name: download.suggestedFilename(), text, parsed, network, file };
}

(async () => {
  const browser = await chromium.launch();

  // ---- AC-6: every page advertises the three main feeds, and they load as Atom ----
  const ctx = await newContext(browser);
  const disc = {};
  for (const p of ['', 'sitrep/', 'ransomware/', 'feeds/']) {
    const page = await open(ctx, BASE + p);
    const links = await page.$$eval('link[rel="alternate"][type="application/atom+xml"]', (ls) => ls.map((l) => l.href));
    const statuses = await page.evaluate(async (urls) => Promise.all(urls.map(async (u) => {
      const r = await fetch(u); const t = await r.text(); return r.ok && t.includes('<feed xmlns="http://www.w3.org/2005/Atom">');
    })), links);
    disc[p || '/'] = { links: links.length, allAtom: statuses.every(Boolean) };
    await page.close();
  }
  check('AC-6a', 'Every page advertises the 3 main feeds, and each loads as an Atom feed',
    Object.values(disc).every((d) => d.links === 3 && d.allAtom), JSON.stringify(disc));

  // ---- AC-7: the Feeds page ----
  const ctxClip = await newContext(browser, { permissions: ['clipboard-read', 'clipboard-write'] });
  let page = await open(ctxClip, BASE + 'feeds/');
  const addresses = await page.$$eval('input[data-feed]', (inputs) => inputs.map((i) => i.value));
  await page.click('button[data-copy="addr-kev"]');
  await page.waitForTimeout(100);
  const copied = { button: await page.textContent('button[data-copy="addr-kev"]'), clipboard: await page.evaluate(() => navigator.clipboard.readText()) };
  check('AC-7a', 'Main feeds show full addresses; Copy puts the address on the clipboard',
    addresses.join('|') === `${BASE}feeds/kev.xml|${BASE}feeds/sitrep.xml|${BASE}feeds/breachwire.xml` && copied.button === 'Copied ✓' && copied.clipboard === `${BASE}feeds/kev.xml`,
    `${addresses.join(', ')}; button "${copied.button}"; clipboard "${copied.clipboard}"`);

  await page.fill('#vendor-q', 'micro');
  await page.waitForTimeout(250);
  const micro = { count: await page.textContent('#vendor-count'), names: await page.$$eval('.vendor-result__name', (n) => n.map((x) => x.textContent)),
    addr: await page.$$eval('.vendor-result input', (n) => n.map((x) => x.value)) };
  await page.fill('#vendor-q', 'systemes');
  await page.waitForTimeout(250);
  const accent = await page.$$eval('.vendor-result__name', (n) => n.map((x) => x.textContent));
  await page.fill('#vendor-q', 'a');
  await page.waitForTimeout(250);
  const many = { count: await page.textContent('#vendor-count'), shown: await page.locator('.vendor-result').count() };
  await page.fill('#vendor-q', 'zzzz');
  await page.waitForTimeout(250);
  const none = await page.textContent('#vendor-count');
  const intro = await page.textContent('#vendor-intro');
  check('AC-7b', 'Vendor finder: finds vendors (accents ignored), caps at 20, says when nothing matches',
    micro.names.includes('Microsoft') && micro.addr.includes(`${BASE}feeds/vendors/microsoft.xml`) && accent.includes('Dassault Systèmes') &&
    many.shown === 20 && /showing the first 20/.test(many.count) && /No vendor matches "zzzz"/.test(none) && /291 vendors/.test(intro),
    `"micro" → ${micro.names.join(', ')}; "systemes" → ${accent.join(', ')}; "a" → ${many.count}; "zzzz" → ${none}; intro "${intro}"`);
  await page.fill('#vendor-q', 'fortinet');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, 'feeds-page.png'), fullPage: true });
  await ctxClip.close();

  // Copy fallback when the clipboard isn't allowed (e.g. a site on plain http)
  const ctxNoClip = await newContext(browser);
  await ctxNoClip.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('not allowed')) } });
  });
  page = await open(ctxNoClip, BASE + 'feeds/');
  await page.click('button[data-copy="addr-sitrep"]');
  await page.waitForTimeout(100);
  const fallback = await page.evaluate(() => {
    const input = document.getElementById('addr-sitrep');
    return { focused: document.activeElement === input, selected: input.selectionEnd - input.selectionStart === input.value.length,
      button: document.querySelector('button[data-copy="addr-sitrep"]').textContent, status: document.getElementById('copy-status').textContent };
  });
  check('AC-7c', 'Without clipboard access, the address is selected and the button says to press Ctrl+C',
    fallback.focused && fallback.selected && /Ctrl\+C/.test(fallback.button), JSON.stringify(fallback));
  await ctxNoClip.close();

  // ---- AC-8: "Subscribe in a feed reader" ----
  const ctxStack = await newContext(browser);
  page = await open(ctxStack, BASE + 'feeds/');
  const noStack = { disabled: await page.isDisabled('#opml-download'), prompt: await page.textContent('#opml-stack') };
  await seedStack(page, 'Work', { Microsoft: ['Windows'], Fortinet: [] });
  const work = await grabOpml(page, '#opml-download');
  const workStatus = await page.textContent('#opml-status');
  check('AC-8a', 'Feeds page: OPML with exactly the ticked vendors\' feeds, full addresses, valid XML, 0 requests while building',
    noStack.disabled && /Tick your stack/.test(noStack.prompt) &&
    work.name === 'threat-radar-work.opml' && !work.parsed.error && work.parsed.title === 'Threat Radar: Work' &&
    JSON.stringify(work.parsed.outlines.map((o) => o.xmlUrl)) === JSON.stringify([`${BASE}feeds/vendors/fortinet.xml`, `${BASE}feeds/vendors/microsoft.xml`]) &&
    work.parsed.outlines.every((o) => o.type === 'rss') && work.network.length === 0 && /per vendor/.test(workStatus),
    `no stack: disabled ${noStack.disabled}, "${noStack.prompt}"; file ${work.name}: ${JSON.stringify(work.parsed)}; requests while building: ${work.network.length}; "${workStatus}"`);
  fs.copyFileSync(work.file, path.join(OUT, 'example-work.opml'));

  const evil = '<img src=x onerror=alert(1)> & "q"';
  await seedStack(page, evil, { Zyxel: [] });
  const hostile = await grabOpml(page, '#opml-download');
  check('AC-8b', 'Markup in the preset name is escaped in the file; the page creates no elements from it',
    !hostile.parsed.error && hostile.parsed.title === `Threat Radar: ${evil}` && !/<img/.test(hostile.text) && await page.locator('img').count() === 0,
    `${hostile.name}: title "${hostile.parsed.title}"`);
  for (const f of [work.file, hostile.file]) fs.rmSync(f, { force: true });

  // In the picker on the Radar
  page = await open(ctxStack, BASE);
  await page.evaluate((k) => sessionStorage.removeItem(k), KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#stack-open');
  const pickerEmpty = await page.isDisabled('#share-opml');
  await page.fill('#picker-q', 'Ivanti');
  await page.waitForTimeout(250);
  await page.locator('#picker-list > li.pick').first().locator('.pick__vendor input').check();
  const picker = await grabOpml(page, '#share-opml');
  const pickerStatus = await page.textContent('#picker-status');
  await page.screenshot({ path: path.join(OUT, 'picker-subscribe.png') });
  fs.rmSync(picker.file, { force: true });
  check('AC-8c', 'My stack picker: disabled with nothing ticked; then downloads the OPML with 0 requests',
    pickerEmpty && picker.parsed.outlines.length === 1 && picker.parsed.outlines[0].xmlUrl === `${BASE}feeds/vendors/ivanti.xml` && picker.network.length === 0 && /Downloaded/.test(pickerStatus),
    `empty: disabled ${pickerEmpty}; ${picker.name} → ${JSON.stringify(picker.parsed.outlines)}; requests ${picker.network.length}; "${pickerStatus}"`);
  await ctxStack.close();

  // ---- AC-7: 360 px, keyboard, menu label ----
  const ctxPhone = await newContext(browser, { viewport: { width: 360, height: 740 }, permissions: ['clipboard-read', 'clipboard-write'] });
  page = await open(ctxPhone, BASE + 'feeds/');
  await page.fill('#vendor-q', 'cisco');
  await page.waitForTimeout(250);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.screenshot({ path: path.join(OUT, 'feeds-360.png'), fullPage: true });
  await page.focus('#vendor-q');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const onCopy = await page.evaluate(() => document.activeElement.textContent);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const kbCopied = await page.evaluate(() => navigator.clipboard.readText());
  const nav = await page.$$eval('.topnav__link', (ls) => ls.map((l) => `${l.textContent}=${l.getAttribute('href')}`));
  const radar = await open(ctxPhone, BASE);
  const radarWidth = await radar.evaluate(() => document.documentElement.scrollWidth);
  check('AC-7d', '360 px without sideways scrolling; keyboard reaches and uses Copy; menu says "Breaches"',
    width <= 360 && radarWidth <= 360 && onCopy === 'Copy address' && kbCopied === `${BASE}feeds/vendors/cisco.xml` && nav.includes('Breaches=../ransomware/'),
    `feeds ${width}px, radar ${radarWidth}px; Tab lands on "${onCopy}"; Enter copied "${kbCopied}"; menu ${nav.join(', ')}`);
  await ctxPhone.close();

  const external = requests.filter((u) => /^https?:/.test(u) && !u.startsWith(BASE));
  check('AC-7e', '0 external requests; no page errors, console errors or pop-ups',
    external.length === 0 && errors.length === 0, `${requests.length} requests, external: ${external.join(', ') || 'none'}; errors: ${errors.join(' | ') || 'none'}`);
  await ctx.close();
  await browser.close();

  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(6)} ${r.name}\n        ${r.detail}`);
  fs.writeFileSync(path.join(OUT, '..', 'browser-results.json'), JSON.stringify(results, null, 2));
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

// Browser verification for spec 004 (My stack).
// Needs Playwright (not a project dependency). Serve the site first, then run from the repo root:
//   python3 -m http.server 8765 --directory site &
//   node specs/004-my-stack/browser-check.cjs specs/004-my-stack/evidence
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8765/';
const OUT = process.argv[2];
const KEY = 'threat-radar.presets.v1';
const kev = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'data', 'kev.json'), 'utf8'));
const results = [];
const check = (id, name, ok, detail = '') => results.push({ id, name, ok: Boolean(ok), detail: String(detail) });
const allRequests = [];
const errors = [];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  ctx.on('request', (r) => allRequests.push({ url: r.url(), headers: r.headers() }));
  return ctx;
}
async function open(ctx, url = BASE) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${url}: console ${m.text()}`); });
  page.on('dialog', (d) => { errors.push(`${url}: unexpected dialog ${d.message()}`); d.dismiss(); });
  await page.goto(url, { waitUntil: 'networkidle' });
  return page;
}
const storage = (page) => page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), cookie: document.cookie }));
const record = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || sessionStorage.getItem(k) || 'null'), KEY);

function row(page, vendor) {
  return page.locator('#picker-list > li.pick').filter({ has: page.locator('.pick__vendor .pick__name', { hasText: new RegExp(`^${esc(vendor)}$`) }) });
}
async function search(page, q) { await page.fill('#picker-q', q); await page.waitForTimeout(250); }
async function tick(page, vendor, on = true) {
  await search(page, vendor);
  const box = row(page, vendor).locator('.pick__vendor input');
  if (on) await box.check(); else await box.uncheck();
}
async function openPicker(page) { await page.click('#stack-open'); await page.waitForSelector('#picker[open]'); }
async function closePicker(page) { await page.click('#picker-done'); }
async function saveAs(page, name) {
  await page.click('#preset-new');
  await page.fill('#preset-name', name);
  await page.click('#preset-submit');
}
async function seed(page, rec, where = 'local') {
  await page.evaluate(([k, v, w]) => { (w === 'local' ? localStorage : sessionStorage).setItem(k, v); }, [KEY, typeof rec === 'string' ? rec : JSON.stringify(rec), where]);
}
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, name), ...opts });

(async () => {
  const browser = await chromium.launch();

  // ---------------- A: picker, presets, remember, forget ----------------
  const ctxA = await newContext(browser);
  let page = await open(ctxA);
  let s = await storage(page);
  check('FR-16', 'Fresh visit: prompt shown, no strip, nothing stored', await page.isVisible('#stack-prompt') && await page.isHidden('#stack-strip') && !s.local.length && !s.session.length, JSON.stringify(s));

  await openPicker(page);
  const rowsCount = await page.locator('#picker-list > li.pick').count();
  const firstRow = (await page.locator('#picker-list > li.pick').first().innerText()).replace(/\s+/g, ' ');
  await search(page, 'Microsoft');
  await row(page, 'Microsoft').locator('.pick__expand').click();
  const msProducts = await row(page, 'Microsoft').locator('.pick__product').count();
  const msProductText = (await row(page, 'Microsoft').locator('.pick__product').first().innerText()).replace(/\s+/g, ' ');
  check('AC-1', 'Picker lists every vendor with counts; vendors expand to products with counts',
    rowsCount === 291 && /\d/.test(firstRow) && msProducts === 72 && /\d/.test(msProductText), `${rowsCount} vendors; first "${firstRow}"; Microsoft ${msProducts} products, first "${msProductText}"`);

  await search(page, 'vmware');
  const vmVendors = await page.locator('#picker-list .pick__vendor .pick__name').allTextContents();
  const bcProducts = await row(page, 'Broadcom').locator('.pick__product .pick__name').allTextContents();
  await search(page, 'Exchange Server');
  const exVendors = await page.locator('#picker-list .pick__vendor .pick__name').allTextContents();
  check('AC-2', '"vmware" finds Broadcom\'s VMware products; a product name finds its vendor',
    vmVendors.includes('Broadcom') && bcProducts.length > 0 && bcProducts.every((p) => /vmware/i.test(p)) && exVendors.includes('Microsoft'),
    `vmware → ${vmVendors.join(', ')} (Broadcom shows: ${bcProducts.join(', ')}); "Exchange Server" → ${exVendors.join(', ')}`);

  await tick(page, 'Zyxel');
  const firstTickHint = await page.textContent('#remember-hint');
  await tick(page, 'Cisco');
  await search(page, 'Microsoft');
  await row(page, 'Microsoft').locator('.pick__expand').click();
  await row(page, 'Microsoft').locator('.pick__product').filter({ has: page.locator('.pick__name', { hasText: /^Windows$/ }) }).locator('input').check();
  const msMixed = await row(page, 'Microsoft').locator('.pick__vendor input').evaluate((b) => b.indeterminate && b.checked);
  const selected = await page.textContent('#picker-selected');
  await shot(page, 'picker-desktop.png');
  await closePicker(page);
  await page.check('#stack-only');
  const stripText = (await page.innerText('#stack-strip')).replace(/\s+/g, ' ');
  const listed = await page.locator('#entries > li').count();
  const withBadge = await page.locator('#entries > li .badge--mine').count();
  const vendorsShown = await page.locator('#entries .entry__vendor').allTextContents();
  const stackOk = vendorsShown.every((v) => /^Zyxel · |^Cisco · |^Microsoft · Windows$/.test(v));
  const rings = await page.locator('#radar-rings circle').count();
  const fadeOn = await page.evaluate(() => document.getElementById('radar').classList.contains('radar--mine-only'));
  check('AC-9', 'Radar: My stack only filter, Your stack badges, summary strip, ringed blips',
    msMixed && listed > 0 && withBadge === listed && stackOk && rings > 0 && fadeOn && /In the catalog/.test(stripText) && await page.textContent('#stack-count') === '3',
    `selected "${selected}"; ${listed} rows, ${withBadge} badged, all in stack: ${stackOk}; ${rings} ringed blips; strip "${stripText}"`);
  await page.locator('#latest').scrollIntoViewIfNeeded();
  await shot(page, 'radar-my-stack-only.png');
  s = await storage(page);
  await openPicker(page);
  const nudge = await page.textContent('#remember-hint');
  await closePicker(page);
  check('AC-4a', 'Remember unticked (default): localStorage holds nothing, and the picker nudges to tick Remember (from the first tick)',
    !s.local.length && s.session.includes(KEY) && /^Not remembered/.test(nudge) && /^Not remembered/.test(firstTickHint), `${JSON.stringify(s)}; hint after first tick "${firstTickHint}"`);

  // Presets (AC-5)
  await openPicker(page);
  await saveAs(page, 'Work');
  const afterSave = await page.inputValue('#preset-select');
  await saveAs(page, 'work');
  const dupError = await page.textContent('#preset-error');
  await page.fill('#preset-name', '   ');
  await page.click('#preset-submit');
  const emptyError = await page.textContent('#preset-error');
  await page.click('#preset-cancel');
  await tick(page, 'Cisco', false);   // Work: no Cisco
  await closePicker(page);
  await page.uncheck('#stack-only');   // Work: view off
  await openPicker(page);
  await page.selectOption('#preset-select', 'My stack');
  await search(page, 'Cisco');
  const ciscoInMyStack = await row(page, 'Cisco').locator('.pick__vendor input').isChecked();
  await closePicker(page);
  const myStackView = await page.isChecked('#stack-only');
  await openPicker(page);
  await page.selectOption('#preset-select', 'Work');
  await search(page, 'Cisco');
  const ciscoInWork = await row(page, 'Cisco').locator('.pick__vendor input').isChecked();
  await closePicker(page);
  const workView = await page.isChecked('#stack-only');
  await openPicker(page);
  await page.click('#preset-rename');
  await page.fill('#preset-name', 'Customer A');
  await page.click('#preset-submit');
  const renamed = await page.locator('#preset-select option').allTextContents();
  await page.click('#preset-delete');
  const armed = await page.textContent('#preset-delete');
  await page.click('#preset-delete');
  const afterDelete = await page.locator('#preset-select option').allTextContents();
  const deleteDisabled = await page.isDisabled('#preset-delete');
  check('AC-5', 'Presets: save as, switch (stack + view), rename, delete; duplicates/empty refused; last one protected',
    afterSave === 'Work' && /already a preset/.test(dupError) && /Give the preset a name/.test(emptyError) &&
    ciscoInMyStack && myStackView && !ciscoInWork && !workView &&
    renamed.join('|') === 'My stack|Customer A' && /Click again/.test(armed) && afterDelete.join('|') === 'My stack' && deleteDisabled,
    `saved→${afterSave}; dup "${dupError}"; empty "${emptyError}"; My stack: Cisco ${ciscoInMyStack}, view ${myStackView}; Work: Cisco ${ciscoInWork}, view ${workView}; renamed ${renamed}; armed "${armed}"; after delete ${afterDelete}; delete disabled ${deleteDisabled}`);

  // Markup in a preset name is just text (AC-12)
  const evil = '<img src=x onerror=alert(1)>';
  await saveAs(page, evil);
  const optionText = await page.locator('#preset-select option').last().textContent();
  await closePicker(page);
  const stripName = await page.textContent('#strip-preset');
  const imgs = await page.locator('img').count();
  check('AC-12a', 'Markup in a preset name shows as plain text', optionText === evil && stripName === evil && imgs === 0, `option "${optionText}", strip "${stripName}", <img> elements: ${imgs}`);

  // Remember (AC-4)
  await openPicker(page);
  await page.check('#remember');
  s = await storage(page);
  const rememberedOk = s.local.includes(KEY) && !s.session.includes(KEY);
  const hint = await page.textContent('#remember-hint');
  await closePicker(page);
  await page.check('#stack-only');
  await page.close();                                   // close the tab
  page = await open(ctxA);                              // …and open the site again
  const back = { name: await page.textContent('#strip-preset'), count: await page.textContent('#stack-count'), view: await page.isChecked('#stack-only') };
  check('AC-4b', 'Remember ticked: active preset, stack and view are back after closing and reopening the tab',
    rememberedOk && back.name === evil && back.count === '3' && back.view, `stored ${JSON.stringify(s)}; hint "${hint}"; reopened → ${JSON.stringify(back)}`);
  await openPicker(page);
  await page.uncheck('#remember');
  const afterUntick = await storage(page);
  await closePicker(page);
  const page2 = await open(ctxA);
  const freshAgain = await page2.isVisible('#stack-prompt');
  await page2.close();
  check('AC-4c', 'Unticking removes stored data at once; a new tab then starts empty',
    !afterUntick.local.length && afterUntick.session.includes(KEY) && freshAgain, `after untick ${JSON.stringify(afterUntick)}; new tab shows prompt: ${freshAgain}`);

  // Forget everything (AC-6)
  await openPicker(page);
  await page.check('#remember');
  await page.click('#forget');
  await page.click('#forget');
  const afterForget = await storage(page);
  const forgetStatus = await page.textContent('#picker-status');
  await closePicker(page);
  check('AC-6', 'Forget everything leaves no Threat Radar keys in either storage',
    !afterForget.local.length && !afterForget.session.length && await page.isVisible('#stack-prompt'), `${JSON.stringify(afterForget)}; "${forgetStatus}"`);

  // AC-8: tick, remember, reload, then inspect requests and cookies
  await openPicker(page);
  await tick(page, 'Zyxel');
  await page.check('#remember');
  await closePicker(page);
  await page.reload({ waitUntil: 'networkidle' });
  const cookies = await ctxA.cookies();
  const leaked = allRequests.filter((r) => /zyxel|cisco|stack=|threat-radar\.(presets|visit)/i.test(r.url + JSON.stringify(r.headers)));
  check('AC-8', 'After ticking and reloading, no request and no cookie contains stack data',
    leaked.length === 0 && cookies.length === 0 && (await storage(page)).cookie === '', `${allRequests.length} requests checked; leaked ${leaked.length}; cookies ${cookies.length}`);
  await ctxA.close();

  // ---------------- B: new since last visit ----------------
  const ctxB = await newContext(browser);
  page = await open(ctxB);
  const stackB = { Zyxel: [], Apple: [], SonicWall: [] };
  await seed(page, { v: 1, active: 'Work', lastSeen: { through: '2026-11-03', ids: [] }, presets: [{ name: 'Work', myStackOnly: false, vendors: stackB }] });
  await page.reload({ waitUntil: 'networkidle' });
  const expectedNew = kev.filter((e) => Object.hasOwn(stackB, e.vendorProject) && e.dateAdded > '2026-11-03').length;
  const newShown = await page.textContent('#strip-new');
  await page.locator('#stack-strip').scrollIntoViewIfNeeded();
  await shot(page, 'radar-new-since-last-visit.png');
  await page.goto(BASE + 'sitrep/', { waitUntil: 'networkidle' });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const newAfterNav = await page.textContent('#strip-new');
  const nextVisit = await open(ctxB);
  const newNextVisit = await nextVisit.textContent('#strip-new');
  check('AC-9b', '"New since your last visit" when remembered; same tab keeps it across pages; next visit starts over',
    Number(newShown) === expectedNew && expectedNew > 0 && newAfterNav === newShown && newNextVisit === '0',
    `expected ${expectedNew}, shown ${newShown}; after Sitrep and back ${newAfterNav}; new tab ${newNextVisit}`);
  await ctxB.close();

  // ---------------- B2: two tabs (both remembered) ----------------
  const ctxT = await newContext(browser);
  const tabX = await open(ctxT);
  await seed(tabX, { v: 1, active: 'Work', lastSeen: null, presets: [{ name: 'Work', myStackOnly: false, vendors: { Cisco: [] } }] });
  await tabX.reload({ waitUntil: 'networkidle' });
  const tabY = await open(ctxT);
  await openPicker(tabX);
  await saveAs(tabX, 'From tab X');
  await tabY.waitForTimeout(300);
  await openPicker(tabY);
  const yOptions = await tabY.locator('#preset-select option').allTextContents();
  await tick(tabY, 'Fortinet');
  await tabX.waitForTimeout(300);
  const recT = await record(tabY);
  const xStatus = await tabX.textContent('#picker-status');
  const xSelected = await tabX.textContent('#picker-selected');
  check('AC-5b', 'Two open tabs: a change in one shows up in the other, so neither overwrites the other',
    yOptions.join('|') === 'Work|From tab X' && recT.presets.map((p) => p.name).join('|') === 'Work|From tab X' && /Fortinet/.test(xSelected) && /another tab/.test(xStatus),
    `tab Y sees ${JSON.stringify(yOptions)}; stored ${JSON.stringify(recT.presets.map((p) => [p.name, Object.keys(p.vendors)]))}; tab X now "${xSelected}" / "${xStatus}"`);
  await ctxT.close();

  // ---------------- C: Sitrep and Ransomware pages ----------------
  const ctxC = await newContext(browser);
  page = await open(ctxC, BASE + 'sitrep/?d=2026-11-06');
  const noStackLine = await page.textContent('#stack-line');
  const noStackTags = await page.locator('.badge--mine, .cve-chip--mine').count();
  await seed(page, { v: 1, active: 'Work', lastSeen: null, presets: [{ name: 'Work', myStackOnly: false, vendors: { Zyxel: [], Cisco: [], Microsoft: [] } }] }, 'session');
  await page.reload({ waitUntil: 'networkidle' });
  const zyxelChip = await page.locator('a.cve-chip', { hasText: 'CVE-2026-7273' }).first().getAttribute('class');
  const appleChip = await page.locator('a.cve-chip', { hasText: 'CVE-2024-27834' }).first().getAttribute('class');
  const mentions = await page.locator('.story__mentions .badge--mine').allTextContents();
  const line = await page.textContent('#stack-line');
  await page.locator('a.cve-chip--mine').first().scrollIntoViewIfNeeded();
  await shot(page, 'sitrep-stack-tags.png');
  check('AC-10a', 'Sitrep tags in-stack KEV CVEs and vendor mentions; stack line with Edit',
    /cve-chip--mine/.test(zyxelChip) && !/cve-chip--mine/.test(appleChip) && mentions.includes('Mentions Cisco') && /Your stack: Work/.test(line) && /Tick your stack/.test(noStackLine) && noStackTags === 0,
    `no stack: "${noStackLine.trim()}", ${noStackTags} tags; Zyxel chip "${zyxelChip}"; Apple chip "${appleChip}"; mentions ${JSON.stringify(mentions)}; line "${line}"`);
  await page.click('#stack-line a');
  await page.waitForSelector('#picker[open]');
  const hashAfterEdit = await page.evaluate(() => window.location.hash);
  check('AC-10b', 'The Edit link opens the picker on the Radar (and tidies the address)', hashAfterEdit === '', `hash after open: "${hashAfterEdit}"`);
  await page.goto(BASE + 'ransomware/', { waitUntil: 'networkidle' });
  const mineItems = await page.locator('#kev-ransom-mine > li').count();
  const mineMarked = await page.locator('#kev-ransom-mine .kev-ransom__item--mine').count();
  const msRansom = kev.filter((e) => ['Zyxel', 'Cisco', 'Microsoft'].includes(e.vendorProject) && e.knownRansomwareCampaignUse === 'Known').length;
  const lede = await page.textContent('#kev-ransom-lede');
  await page.locator('#kev-mine').scrollIntoViewIfNeeded();
  await shot(page, 'ransomware-stack.png');
  check('AC-10c', 'Ransomware KEV panel lists and highlights the stack\'s entries, with a count',
    mineItems === Math.min(8, msRansom) && mineMarked === mineItems && lede.includes(`${msRansom} of them affect your stack`),
    `${mineItems} listed, ${mineMarked} highlighted; lede "${lede}"`);
  await ctxC.close();

  // ---------------- D: share links (AC-11) ----------------
  const shareHash = '#stack=' + encodeURIComponent(JSON.stringify({ Fortinet: [], Microsoft: ['Exchange Server'] }));
  const ctxD = await newContext(browser);
  page = await open(ctxD, BASE + shareHash);
  const offerShown = await page.isVisible('#share-offer');
  const offerDesc = await page.textContent('#share-desc');
  const focused = await page.evaluate(() => document.activeElement.id);
  const beforeClick = await storage(page);
  await page.locator('#share-offer').screenshot({ path: path.join(OUT, 'share-offer.png') });
  await page.click('#share-ignore');
  const afterIgnore = { hidden: await page.isHidden('#share-offer'), hash: await page.evaluate(() => location.hash), storage: await storage(page) };
  await page.goto(BASE + 'sitrep/');
  page = await open(ctxD, BASE + shareHash);
  await page.click('#share-add');
  const recD = await record(page);
  const pickerStatus = await page.textContent('#picker-status');
  check('AC-11a', 'Share link in a fresh browser: offer only, nothing stored until "Add as preset"; then a new preset',
    offerShown && focused === 'share-title' && !beforeClick.local.length && !beforeClick.session.length && afterIgnore.hidden && afterIgnore.hash === '' && !afterIgnore.storage.session.length &&
    recD.presets.map((p) => p.name).join('|') === 'My stack|Shared stack' && recD.active === 'Shared stack' && JSON.stringify(recD.presets[1].vendors) === '{"Fortinet":[],"Microsoft":["Exchange Server"]}',
    `offer "${offerDesc}"; before click ${JSON.stringify(beforeClick)}; after Ignore ${JSON.stringify(afterIgnore)}; then ${JSON.stringify(recD.presets.map((p) => p.name))}, "${pickerStatus}"`);
  await ctxD.close();

  const ctxD2 = await newContext(browser);
  page = await open(ctxD2);
  const work = { name: 'Work', myStackOnly: true, vendors: { Cisco: [] } };
  await seed(page, { v: 1, active: 'Work', lastSeen: null, presets: [work] });
  await page.close();
  page = await open(ctxD2, BASE + shareHash);
  await page.click('#share-add');
  await page.close();
  page = await open(ctxD2, BASE + shareHash);
  const sameNote = await page.textContent('#share-note');
  await page.click('#share-add');
  const recD2 = await record(page);
  check('AC-11b', 'Existing presets are never overwritten; a repeat becomes "Shared stack 2"',
    JSON.stringify(recD2.presets[0]) === JSON.stringify(work) && recD2.presets.map((p) => p.name).join('|') === 'Work|Shared stack|Shared stack 2' && /same as your preset "Shared stack"/.test(sameNote),
    `${JSON.stringify(recD2.presets.map((p) => p.name))}; note "${sameNote}"`);
  await ctxD2.close();

  // ---------------- E: hostile share links and stored data (AC-12) ----------------
  const ctxE = await newContext(browser);
  const hostileHashes = ['#stack=%E0%A4%A', '#stack=' + encodeURIComponent('{"__proto__":[]}'), '#stack=' + 'x'.repeat(30000), '#stack=' + encodeURIComponent('["Cisco"]'), '#%E0%A4%A', '#stack='];
  const hostileOut = [];
  for (const h of hostileHashes) {
    const before = errors.length;
    const p = await open(ctxE, BASE + h);
    hostileOut.push({ h: h.slice(0, 30), title: (await p.isVisible('#share-offer')) ? await p.textContent('#share-title') : '(no offer)', add: await p.isVisible('#share-add'), errors: errors.length - before, stored: (await storage(p)).session.length });
    await p.close();
  }
  const badShares = hostileOut.filter((o) => o.h.startsWith('#stack=')).every((o) => o.title === "This shared link couldn't be read" && !o.add && !o.stored && !o.errors);
  const badCve = hostileOut.find((o) => o.h === '#%E0%A4%A');
  const bigRecord = { v: 1, active: 'P0', lastSeen: null, presets: Array.from({ length: 500 }, (_, i) => ({ name: `P${i}`, myStackOnly: false, vendors: {} })) };
  const hugeVendors = { v: 1, active: 'A', lastSeen: null, presets: [{ name: 'A', myStackOnly: false, vendors: Object.fromEntries(Array.from({ length: 301 }, (_, i) => [`V${i}`, []])) }] };
  const storedVariants = { 'bad JSON': '{oops', '500 presets': bigRecord, '301 vendors': hugeVendors, 'markup field': { v: 1, active: 'A', lastSeen: null, html: '<b>', presets: [{ name: 'A', myStackOnly: false, vendors: {} }] }, 'wrong types': { v: 1, active: 'A', lastSeen: 'yesterday', presets: [{ name: 'A', myStackOnly: 'yes', vendors: [] }] } };
  const storedOut = [];
  for (const [label, value] of Object.entries(storedVariants)) {
    const before = errors.length;
    const p = await open(ctxE);
    await seed(p, value);
    await p.reload({ waitUntil: 'networkidle' });
    storedOut.push({ label, fresh: await p.isVisible('#stack-prompt'), removed: !(await storage(p)).local.length, errors: errors.length - before });
    await p.close();
  }
  check('AC-12b', 'Hostile share links and stored records are ignored safely (no errors, nothing stored, page starts fresh)',
    badShares && badCve && badCve.errors === 0 && storedOut.every((o) => o.fresh && o.removed && !o.errors),
    `shares ${JSON.stringify(hostileOut)}; stored ${JSON.stringify(storedOut)}`);
  await ctxE.close();

  // ---------------- F: storage blocked (AC-7) ----------------
  const ctxF = await newContext(browser);
  await ctxF.addInitScript(() => {
    const blocked = { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } };
    Object.defineProperty(window, 'localStorage', blocked);
    Object.defineProperty(window, 'sessionStorage', blocked);
  });
  const beforeF = errors.length;
  page = await open(ctxF);
  await openPicker(page);
  await tick(page, 'Fortinet');
  const blockedBox = await page.isDisabled('#remember');
  const blockedHint = await page.textContent('#remember-hint');
  await shot(page, 'storage-blocked.png');
  await closePicker(page);
  const blockedStrip = await page.isVisible('#stack-strip');
  const ctxF2 = await newContext(browser);
  await ctxF2.addInitScript(() => { const real = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (this === window.localStorage && k === 'threat-radar.presets.v1') throw new DOMException('full', 'QuotaExceededError'); return real.call(this, k, v); }; });
  const p2 = await open(ctxF2);
  await openPicker(p2);
  await tick(p2, 'Fortinet');
  await p2.click('#remember'); // the page unticks it again when saving fails
  const fullState = { checked: await p2.isChecked('#remember'), status: await p2.textContent('#picker-status') };
  check('AC-7', 'Storage blocked: works in memory with no errors; the tickbox says remembering isn\'t available',
    errors.length === beforeF && blockedBox && /isn't available/.test(blockedHint) && blockedStrip && !fullState.checked && /Couldn't save/.test(fullState.status),
    `blocked: tickbox disabled ${blockedBox}, hint "${blockedHint}", strip shown ${blockedStrip}; full storage: ${JSON.stringify(fullState)}`);
  await ctxF.close();
  await ctxF2.close();

  // ---------------- G: 360 px, keyboard, external requests (AC-13) ----------------
  const ctxG = await newContext(browser, { viewport: { width: 360, height: 740 } });
  page = await open(ctxG);
  await seed(page, { v: 1, active: 'Customer A', lastSeen: null, presets: [{ name: 'Customer A', myStackOnly: false, vendors: { Microsoft: ['Windows', 'Exchange Server'], Cisco: [], Fortinet: [], Ivanti: [], Zyxel: [] } }] }, 'session');
  await page.reload({ waitUntil: 'networkidle' });
  const widths = { radar: await page.evaluate(() => document.documentElement.scrollWidth) };
  await page.locator('#stack-strip').scrollIntoViewIfNeeded();
  await shot(page, 'mobile-360-strip.png');
  await openPicker(page);
  await search(page, 'Microsoft');
  await row(page, 'Microsoft').locator('.pick__expand').click();
  widths.picker = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.getElementById('picker').scrollWidth));
  await shot(page, 'mobile-360-picker.png');
  for (const url of ['sitrep/', 'ransomware/']) {
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    widths[url] = await page.evaluate(() => document.documentElement.scrollWidth);
  }

  // Keyboard only
  const k = await open(ctxG);
  await k.focus('#stack-open');
  await k.keyboard.press('Enter');
  const kbOpen = await k.evaluate(() => document.getElementById('picker').open);
  await k.focus('#picker-q');
  await k.keyboard.type('Fortinet');
  await k.waitForTimeout(250);
  await k.keyboard.press('Tab');
  const onBox = await k.evaluate(() => document.activeElement.type === 'checkbox' && document.activeElement.closest('.pick').textContent.includes('Fortinet'));
  await k.keyboard.press('Space');
  const kbTicked = await k.evaluate(() => document.activeElement.checked);
  await k.focus('#preset-new');
  await k.keyboard.press('Enter');
  const inName = await k.evaluate(() => document.activeElement.id);
  await k.keyboard.type('Home lab');
  await k.keyboard.press('Enter');
  const kbPreset = await k.inputValue('#preset-select');
  await k.focus('#preset-rename');
  await k.keyboard.press('Enter');
  await k.keyboard.press('Escape');
  const escClosesFormOnly = await k.evaluate(() => document.getElementById('preset-form').hidden && document.getElementById('picker').open);
  await k.keyboard.press('Escape');
  const kbClosed = await k.evaluate(() => !document.getElementById('picker').open);
  const focusBack = await k.evaluate(() => document.activeElement.id);
  check('AC-13a', '360 px without horizontal scroll on all three pages and in the picker',
    Object.values(widths).every((w) => w <= 360), JSON.stringify(widths));
  check('AC-13b', 'Keyboard only: open, search, tick, save a preset, Escape closes the form then the picker',
    kbOpen && onBox && kbTicked && inName === 'preset-name' && kbPreset === 'Home lab' && escClosesFormOnly && kbClosed,
    `open ${kbOpen}; tab lands on Fortinet tick ${onBox}; ticked ${kbTicked}; name field focused ${inName}; preset "${kbPreset}"; Esc closes form only ${escClosesFormOnly}; Esc closes picker ${kbClosed}; focus back on "${focusBack}"`);
  await ctxG.close();

  // Dark theme look
  const ctxL = await newContext(browser, { colorScheme: 'dark' });
  page = await open(ctxL);
  await seed(page, { v: 1, active: 'Work', lastSeen: null, presets: [{ name: 'Work', myStackOnly: false, vendors: { Microsoft: [], Apple: [] } }] }, 'session');
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, document.getElementById('latest').offsetTop - 16));
  await shot(page, 'dark-theme-strip.png');
  await openPicker(page);
  await search(page, 'Apple');
  await row(page, 'Apple').locator('.pick__expand').click();
  await shot(page, 'dark-theme-picker.png');
  await ctxL.close();

  const external = allRequests.filter((r) => !r.url.startsWith(BASE));
  check('AC-13c', '0 external requests across every check', external.length === 0, `${allRequests.length} requests, external: ${external.map((r) => r.url).join(', ') || 'none'}`);
  check('ALL', 'No page errors, console errors or pop-up dialogs during the whole run', errors.length === 0, errors.join(' | ') || 'none');

  await browser.close();
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(7)} ${r.name}\n        ${r.detail}`);
  fs.writeFileSync(path.join(OUT, '..', 'browser-results.json'), JSON.stringify(results, null, 2));
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

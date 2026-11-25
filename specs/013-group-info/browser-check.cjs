// Browser check for spec 013 (group info in Trends). From the repo root:
//   python3 scripts/build_breach_stats.py && python3 -m http.server 8765 --directory site &
//   node specs/013-group-info/browser-check.cjs specs/013-group-info/evidence
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE = process.env.SITE || 'http://localhost:8765/';
const OUT = process.argv[2];
const results = [];
const check = (id, name, ok, detail = '') => results.push({ id, name, ok: Boolean(ok), detail: String(detail) });
const stats = JSON.parse(fs.readFileSync('site/data/breachwire-stats.json', 'utf-8'));
const groups = JSON.parse(fs.readFileSync('site/data/breachwire-groups.json', 'utf-8')).groups;
const byName = new Map(groups.map((g) => [g.name, g]));

async function open(browser, opts = {}, route) {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  const errors = [], requests = [];
  p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('request', (r) => requests.push(r.url()));
  if (route) await p.route(/breachwire-groups\.json$/, route);
  return { ctx, p, errors, requests };
}

(async () => {
  const browser = await chromium.launch();
  const latest = stats.months[stats.months.length - 1];
  const top = latest.groups.slice(0, 10);

  // AC-4: no profile request until Trends is opened
  {
    const { ctx, p, requests } = await open(browser, { viewport: { width: 1280, height: 900 } });
    await p.goto(SITE + 'breaches/', { waitUntil: 'networkidle' });
    const before = requests.filter((u) => /breachwire-groups\.json/.test(u)).length;
    await p.click('#tab-trends');
    await p.waitForSelector('#trends:not([hidden])');
    const after = requests.filter((u) => /breachwire-groups\.json/.test(u)).length;
    check('AC-4', 'The profiles are fetched only when Trends is opened', before === 0 && after === 1, `${before} → ${after}`);
    await ctx.close();
  }

  // AC-3: every top group with a profile has an (i); hover, focus, tap, Escape; the link
  {
    const { ctx, p, errors } = await open(browser, { viewport: { width: 1280, height: 900 } });
    await p.goto(SITE + 'breaches/#trends', { waitUntil: 'networkidle' });
    await p.waitForSelector('#trends:not([hidden])');
    const rows = await p.evaluate(() => [...document.querySelectorAll('#top-groups li')].map((li) => ({
      name: li.querySelector('.top-groups__name').firstChild.textContent,
      tip: Boolean(li.querySelector('.info-tip')),
    })));
    const expected = top.map((g) => byName.has(g.name));
    check('AC-3', 'Each top group with a profile has an (i), and only those', rows.length === 10 && rows.every((r, i) => r.tip === expected[i]),
      `${rows.filter((r) => r.tip).length} of ${rows.length} have one`);

    const first = top.find((g) => byName.has(g.name));
    const tip = p.locator('#top-groups .info-tip').first();
    await tip.hover();
    const hover = await p.evaluate(() => {
      const b = document.querySelector('#top-groups .info-tip__bubble');
      return { visible: getComputedStyle(b).display !== 'none', text: b.textContent };
    });
    const g = byName.get(first.name);
    check('AC-3', 'Hover shows the right profile, with the issue it came from', hover.visible && hover.text.includes(g.profile.slice(0, 40))
      && hover.text.includes(`№${g.issue}`), hover.text.slice(0, 120));
    await p.screenshot({ path: path.join(OUT, 'tip-desktop.png'), clip: { x: 0, y: (await tip.boundingBox()).y - 200, width: 1280, height: 420 } });

    await p.mouse.move(0, 0);
    await p.focus('#tab-trends');
    await tip.focus();
    await p.keyboard.press('Enter');
    const opened = await tip.getAttribute('aria-expanded');
    await p.keyboard.press('Tab');
    const inBubble = await p.evaluate(() => document.activeElement.closest('.info-tip__bubble') !== null && document.activeElement.textContent);
    const stillShown = await p.evaluate(() => getComputedStyle(document.querySelector('#top-groups .info-tip__bubble')).display !== 'none');
    await p.keyboard.press('Escape');
    const closed = await tip.getAttribute('aria-expanded');
    check('AC-3', 'Keyboard: Enter opens, Tab reaches "Open issue" inside it, Escape closes', opened === 'true' && inBubble === 'Open issue'
      && stillShown && closed === 'false', `${opened} → ${inBubble} → ${closed}`);

    const href = await p.locator('#top-groups .info-tip__bubble a').first().getAttribute('href');
    await p.locator('#top-groups .info-tip').first().click();
    await Promise.all([p.waitForNavigation(), p.locator('#top-groups .info-tip__bubble a').first().click()]);
    const landed = await p.evaluate(() => ({ url: location.search, tab: document.querySelector('[role=tab][aria-selected=true]').id }));
    check('AC-3', '"Open issue" goes to that day\'s issue', href === `?d=${g.date}` && landed.url === `?d=${g.date}` && landed.tab === 'tab-issue',
      JSON.stringify(landed));
    check('AC-4', 'No errors or CSP violations', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // AC-3 / AC-4: phone, dark, tap to open and tap elsewhere to close
  {
    const { ctx, p } = await open(browser, { ...devices['Pixel 5'], viewport: { width: 360, height: 780 }, colorScheme: 'dark' });
    await p.goto(SITE + 'breaches/#trends', { waitUntil: 'networkidle' });
    await p.waitForSelector('#trends:not([hidden])');
    const tip = p.locator('#top-groups .info-tip').first();
    await tip.scrollIntoViewIfNeeded();
    await tip.tap();
    const s = await p.evaluate(() => {
      const b = document.querySelector('#top-groups .info-tip__bubble');
      const r = b.getBoundingClientRect();
      return { shown: getComputedStyle(b).display !== 'none', left: Math.round(r.left), right: Math.round(r.right),
        page: document.documentElement.scrollWidth, width: innerWidth };
    });
    await p.screenshot({ path: path.join(OUT, 'tip-phone-dark.png') });
    await p.locator('#trends-h').tap();
    const closed = await tip.getAttribute('aria-expanded');
    check('AC-4', '360 px, dark: a tap opens the bubble inside the screen; a tap elsewhere closes it',
      s.shown && s.left >= 0 && s.right <= s.width && s.page <= s.width && closed === 'false', JSON.stringify({ ...s, closed }));
    await ctx.close();
  }

  // AC-4: without the profiles file, Trends works and shows no (i)
  {
    const { ctx, p, errors } = await open(browser, {}, (r) => r.fulfill({ status: 404, body: '' }));
    await p.goto(SITE + 'breaches/#trends', { waitUntil: 'networkidle' });
    await p.waitForSelector('#trends:not([hidden])');
    const n = await p.evaluate(() => [document.querySelectorAll('#top-groups li').length, document.querySelectorAll('#top-groups .info-tip').length]);
    check('AC-4', 'Without the profiles file, Trends works and shows no (i)', n[0] === 10 && n[1] === 0 && errors.length === 0, n.join(' rows, ') + ' tips');
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, '..', 'browser-results.json'), JSON.stringify(results, null, 1) + '\n');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();

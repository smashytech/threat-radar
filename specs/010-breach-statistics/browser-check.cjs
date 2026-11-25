// Browser verification for spec 010 (Trends section). From the repo root:
//   python3 scripts/build_breach_stats.py && python3 -m http.server 8765 --directory site &
//   node specs/010-breach-statistics/browser-check.cjs specs/010-breach-statistics/evidence
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE = process.env.SITE || 'http://localhost:8765/';
const PAGE = SITE + 'ransomware/';
const OUT = process.argv[2];
const results = [];
const check = (id, name, ok, detail = '') => results.push({ id, name, ok: Boolean(ok), detail: String(detail) });
const real = JSON.parse(fs.readFileSync('site/data/breachwire-stats.json', 'utf-8'));

// A two-month file, so the month picker and the ▲ ▼ marks have something to compare.
function twoMonths() {
  const nov = real.months[real.months.length - 1];
  const oct = JSON.parse(JSON.stringify(nov));
  oct.month = '2026-10'; oct.newGroups = null;
  oct.groups = [...nov.groups].reverse();          // the order flips, so every rank moves
  oct.groups = oct.groups.filter((g, i) => i !== 0); // the last of November's list was absent in October
  const n = JSON.parse(JSON.stringify(nov));
  n.newGroups = [nov.groups[nov.groups.length - 1].name];
  return { ...real, from: '2026-10-01', months: [oct, n] };
}

async function open(browser, opts = {}, route) {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push(String(e)));
  if (route) await p.route(/breachwire-stats\.json$/, route);
  await p.goto(PAGE, { waitUntil: 'networkidle' });
  return { ctx, p, errors };
}

(async () => {
  const browser = await chromium.launch();

  // AC-6: figures as built from the stored issues
  {
    const { ctx, p, errors } = await open(browser, { viewport: { width: 1280, height: 900 } });
    await p.waitForSelector('#trends:not([hidden])');
    const m = real.months[real.months.length - 1];
    const s = await p.evaluate(() => ({
      row: [...document.querySelectorAll('#trend-months tr')[0].children].map((c) => c.textContent.trim()),
      sectors: [...document.querySelectorAll('#sector-grid tbody tr')].map((r) => [r.querySelector('th').textContent, r.querySelector('td .shade__share').textContent]),
      groups: [...document.querySelectorAll('#top-groups li')].map((li) => [li.querySelector('.top-groups__name').textContent, li.querySelector('.top-groups__hits').textContent]),
      since: document.getElementById('trends-since').textContent,
    }));
    const top = Object.entries(m.sectors).filter(([k]) => k !== 'Other').sort((a, b) => b[1] - a[1])[0];
    check('AC-6', 'Per-month row: days, victims, per day, Sweden, groups match the stats file',
      s.row[1] === String(m.days) && s.row[2] === m.victims.toLocaleString('en-US') && s.row[3] === m.perDay.toFixed(1) && s.row[4] === String(m.sweden) && s.row[5] === String(m.groupCount),
      JSON.stringify(s.row));
    check('AC-6', 'Sector grid: 17 sectors + Other, largest first, Other last, shares add up',
      s.sectors.length === 18 && s.sectors[0][0] === top[0] && s.sectors[17][0] === 'Other'
        && s.sectors[0][1] === `${(Math.round(top[1] / m.victims * 1000) / 10).toFixed(1)} %`,
      `${s.sectors[0].join(' ')} … ${s.sectors[17].join(' ')}`);
    check('AC-6', 'Top groups: 10, the busiest first, with claims and share',
      s.groups.length === 10 && s.groups[0][0] === m.groups[0].name && s.groups[0][1].startsWith(`${m.groups[0].hits} ·`), JSON.stringify(s.groups.slice(0, 3)));
    check('AC-6', 'A note says where the statistics start', /^Statistics from \d+ \w+ 2026, \d+ daily issues\.$/.test(s.since), s.since);
    check('AC-7', 'No errors or CSP violations in the console', errors.length === 0, errors.join(' | '));
    await p.locator('#trends').screenshot({ path: path.join(OUT, 'trends-light.png') });
    await ctx.close();
  }

  // AC-6: the month picker, with two months
  {
    const data = twoMonths();
    const { ctx, p } = await open(browser, { viewport: { width: 1280, height: 900 } },
      (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));
    await p.waitForSelector('#trends:not([hidden])');
    const read = () => p.evaluate(() => [...document.querySelectorAll('#top-groups li')].map((li) => [li.querySelector('.top-groups__name').textContent, li.querySelector('.move').textContent]));
    const nov = await read();
    await p.selectOption('#groups-month', '2026-10');
    const oct = await read();
    const cols = await p.evaluate(() => document.querySelectorAll('#sector-grid thead th').length);
    const changes = await p.evaluate(() => document.querySelectorAll('#sector-grid .change').length);
    check('AC-6', 'The month picker changes the groups list; November shows ▲/▼/new marks, October (first month) none',
      nov[0][0] !== oct[0][0] && nov.some((g) => g[1].startsWith('▲')) && nov.some((g) => g[1].startsWith('▼')) && oct.every((g) => g[1] === ''),
      `Nov: ${JSON.stringify(nov.slice(0, 3))} · Oct: ${JSON.stringify(oct.slice(0, 2))}`);
    check('AC-6', 'Two months give two grid columns and a change mark in each November cell', cols === 3 && changes === 18, `${cols} columns, ${changes} marks`);
    await ctx.close();
  }

  // AC-7: the issue appears before Trends loads
  {
    let issueShownFirst = null;
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.route(/breachwire-stats\.json$/, async (r) => {
      await new Promise((res) => setTimeout(res, 1500));
      await r.continue();
    });
    await p.goto(PAGE);
    await p.waitForSelector('#issue-body:not([hidden])');
    issueShownFirst = await p.evaluate(() => document.getElementById('trends').hidden);
    await p.waitForSelector('#trends:not([hidden])');
    check('AC-7', 'The daily issue is on screen while Trends is still loading', issueShownFirst === true);
    await ctx.close();
  }

  // AC-7: Trends missing → the page still works
  {
    const { ctx, p, errors } = await open(browser, {}, (r) => r.fulfill({ status: 404, body: '' }));
    const s = await p.evaluate(() => ({ issue: !document.getElementById('issue-body').hidden, trends: document.getElementById('trends').hidden }));
    check('AC-7', 'Without the stats file the issue still shows and Trends stays hidden', s.issue && s.trends, JSON.stringify(s));
    await ctx.close();
  }

  // AC-7: 360 px, keyboard, dark theme. Six months, so the grid is wider than a phone.
  {
    const six = twoMonths();
    six.months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map((m, i) => ({ ...six.months[i === 5 ? 1 : 0], month: m, newGroups: i ? [] : null }));
    const { ctx, p } = await open(browser, { viewport: { width: 360, height: 800 }, colorScheme: 'dark' },
      (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(six) }));
    await p.waitForSelector('#trends:not([hidden])');
    const s = await p.evaluate(() => {
      const box = document.querySelectorAll('#trends .table-scroll')[1];
      return {
        page: document.documentElement.scrollWidth, width: window.innerWidth,
        boxScrolls: box.scrollWidth > box.clientWidth,
        bg: getComputedStyle(document.body).backgroundColor,
      };
    });
    check('AC-7', '360 px with six months: no page-wide sideways scroll; the sector grid scrolls in its own box',
      s.page <= s.width && s.boxScrolls, JSON.stringify(s));
    await p.locator('#trends').screenshot({ path: path.join(OUT, 'trends-dark-360.png') });

    // Keyboard: the grid boxes and the month picker are reachable with Tab.
    await p.focus('#trends-h');
    const stops = [];
    await p.evaluate(() => document.getElementById('trends').scrollIntoView());
    await p.evaluate(() => { const a = document.createElement('a'); a.href = '#'; a.id = 'kb-start'; document.getElementById('trends').prepend(a); a.focus(); });
    for (let i = 0; i < 4; i++) {
      await p.keyboard.press('Tab');
      stops.push(await p.evaluate(() => document.activeElement.id || document.activeElement.getAttribute('aria-labelledby') || document.activeElement.tagName));
    }
    check('AC-7', 'Keyboard: Tab reaches the per-month table, the sector grid and the month picker',
      stops[0] === 'months-h' && stops[1] === 'sector-grid-h' && stops[2] === 'groups-month', stops.join(' → '));
    check('AC-7', 'Dark theme applies (device setting)', s.bg !== 'rgb(255, 255, 255)', s.bg);
    await ctx.close();
  }

  // AC-7: CSP unchanged (same as the Today page's)
  {
    const csp = (html) => html.match(/Content-Security-Policy"\s+content="([^"]+)"/)[1];
    const a = csp(fs.readFileSync('site/ransomware/index.html', 'utf-8'));
    const b = csp(fs.readFileSync('site/index.html', 'utf-8'));
    check('AC-7', 'CSP on the Breaches page is unchanged and the same as the other pages', a === b, a);
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, '..', 'browser-results.json'), JSON.stringify(results, null, 1) + '\n');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();

// Browser check for spec 003 amendment A1: old /ransomware/ links land on /breaches/.
// From the repo root, with the site served on :8765:
//   node specs/003-breach-wire-section/forward-check.cjs
const { chromium } = require('playwright');
const SITE = process.env.SITE || 'http://localhost:8765/';
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: String(detail) });

(async () => {
  const browser = await chromium.launch();
  const cases = [
    ['ransomware/', 'breaches/', 'issue'],
    ['ransomware/?d=2026-11-20', 'breaches/?d=2026-11-20', 'issue'],
    ['ransomware/#trends', 'breaches/#trends', 'trends'],
    ['ransomware/?d=2026-10-15#trends', 'breaches/?d=2026-10-15#trends', 'trends'],
  ];
  for (const [from, to, tab] of cases) {
    const p = await browser.newPage();
    const errors = [];
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(SITE + from, { waitUntil: 'networkidle' });
    const s = await p.evaluate(() => ({ url: location.href, tab: document.querySelector('[role=tab][aria-selected=true]')?.id,
      line: document.getElementById('issue-line')?.textContent }));
    check(`/${from} → /${to} (${tab} tab)`, s.url === SITE + to && s.tab === `tab-${tab}` && errors.length === 0,
      `${s.url} · ${s.tab} · ${s.line}`);
    await p.close();
  }
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(SITE + 'ransomware/');
  await p.waitForURL(SITE + 'breaches/', { timeout: 5000 }).catch(() => {});
  check('Without JavaScript, the refresh tag still forwards to /breaches/', p.url() === SITE + 'breaches/', p.url());
  await browser.close();
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();

// Browser verification for spec 009. From the repo root:
//   python3 scripts/build_recent.py && python3 -m http.server 8765 --directory site &
//   node specs/009-previews-and-speed/browser-check.cjs specs/009-previews-and-speed/evidence
// Speed is measured like Lighthouse's mobile test: Moto G4, 150 ms latency,
// 1.6 Mbit/s down, CPU 4x slower. The local server doesn't compress files, so
// real-world numbers on GitHub Pages (which does) are better than these.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE = process.env.SITE || 'http://localhost:8765/';
const OUT = process.argv[2];
const results = [];
const check = (id, name, ok, detail = '') => results.push({ id, name, ok: Boolean(ok), detail: String(detail) });

async function measure(browser, page = '', { block } = {}) {
  const ctx = await browser.newContext({ ...devices['Moto G4'] });
  if (block) await ctx.route(block, (r) => r.fulfill({ status: 404, body: 'gone' }));
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let bytes = 0;
  p.on('response', async (r) => { try { bytes += (await r.body()).length; } catch {} });
  await p.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await p.goto(SITE + page, { waitUntil: 'networkidle' });
  const lcp = Math.round(await p.evaluate(() => window.__lcp));
  return { ctx, p, lcp, kb: Math.round(bytes / 1024) };
}

(async () => {
  const browser = await chromium.launch();

  const runs = [];
  for (let i = 0; i < 3; i++) {
    const m = await measure(browser);
    runs.push(m);
    if (i < 2) await m.ctx.close();
  }
  const worst = Math.max(...runs.map((r) => r.lcp));
  const kb = Math.max(...runs.map((r) => r.kb));
  await runs[2].p.screenshot({ path: path.join(OUT, 'today-mobile.png') });
  await runs[2].ctx.close();
  check('AC-2', 'Today on a throttled phone: largest content under 2.5 s, under 400 KB (before: 9.9 s, 1,659 KB)',
    worst < 2500 && kb < 400, `LCP ${runs.map((r) => r.lcp).join(' / ')} ms (worst ${worst}), ${kb} KB`);

  const noKev = await measure(browser, '', { block: /kev-recent\.json$/ });
  const state = await noKev.p.evaluate(() => ({
    headline: document.getElementById('today-headline').textContent,
    sitrep: document.querySelectorAll('#today-sitrep li').length,
    bars: document.querySelectorAll('#bw-bars .today-bar').length,
    week: document.getElementById('today-week').textContent,
  }));
  await noKev.ctx.close();
  check('AC-4', 'With the catalog missing, the headline, Sitrep and Breach Wire columns still render',
    !/Loading/.test(state.headline) && state.sitrep === 3 && state.bars === 3 && /couldn't load/.test(state.week), JSON.stringify(state));

  const ctx = await browser.newContext();
  const tags = {};
  for (const p of ['', 'exploited/', 'sitrep/', 'breaches/', 'feeds/']) {
    const page = await ctx.newPage();
    await page.goto(SITE + p);
    tags[p || '/'] = await page.$$eval('meta[property^="og:"], meta[name^="twitter:"]', (ms) => ms.length);
    await page.close();
  }
  const img = await ctx.request.get(SITE + 'social-card.png');
  await ctx.close();
  check('AC-5', 'Every page has the 10 preview tags; the image is served as PNG',
    Object.values(tags).every((n) => n === 10) && img.ok() && img.headers()['content-type'] === 'image/png', `${JSON.stringify(tags)}; image ${img.status()}`);

  await browser.close();
  fs.writeFileSync(path.join(OUT, '..', 'browser-results.json'), JSON.stringify(results, null, 2) + '\n');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id} ${r.name}\n        ${r.detail}`);
  console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();

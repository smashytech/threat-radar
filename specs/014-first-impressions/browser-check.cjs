// Browser check for spec 014. From the repo root:
//   node specs/014-first-impressions/browser-check.cjs specs/014-first-impressions/evidence
// Starts its own server that answers missing addresses with 404.html, like GitHub Pages.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 8766;
const SITE = `http://127.0.0.1:${PORT}/`;
const OUT = process.argv[2];
const results = [];
const check = (id, name, ok, detail = '') => results.push({ id, name, ok: Boolean(ok), detail: String(detail) });
const JS_PAGES = ['', 'exploited/', 'sitrep/', 'breaches/'];
const NOTE = 'Threat Radar builds this page with JavaScript';

(async () => {
  const server = spawn('python3', ['specs/014-first-impressions/serve-like-pages.py', String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  try {
    // AC-1: JavaScript off
    const off = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
    for (const page of [...JS_PAGES, 'feeds/']) {
      const p = await off.newPage();
      await p.goto(SITE + page);
      const s = await p.evaluate((note) => {
        const visible = (el) => el && el.offsetParent !== null;
        const text = document.body.innerText;
        return { note: text.includes(note), loading: /Loading/.test(text), h1: [...document.querySelectorAll('h1')].filter(visible).map((h) => h.textContent.trim()),
          feedsLink: [...document.querySelectorAll('.noscript-note a')].map((a) => a.getAttribute('href')) };
      }, NOTE);
      if (page === 'feeds/') {
        check('AC-1', 'JavaScript off, Feeds: unchanged, no note (its list of feeds is plain HTML)', !s.note && s.h1.length === 1, JSON.stringify(s));
      } else {
        check('AC-1', `JavaScript off, /${page}: the note, one heading, no "Loading…"`, s.note && !s.loading && s.h1.length === 1, JSON.stringify(s));
      }
      if (page === '') await p.screenshot({ path: path.join(OUT, 'today-no-js.png'), clip: { x: 0, y: 0, width: 1280, height: 620 } });
      await p.close();
    }
    const fp = await off.newPage();
    await fp.goto(SITE);
    await Promise.all([fp.waitForNavigation(), fp.click('.noscript-note a')]);
    check('AC-1', 'JavaScript off: the note\'s Feeds link works', fp.url() === SITE + 'feeds/', fp.url());
    await off.close();

    // AC-2: JavaScript on, no note anywhere
    const on = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    for (const page of JS_PAGES) {
      const p = await on.newPage();
      await p.goto(SITE + page, { waitUntil: 'networkidle' });
      const s = await p.evaluate((note) => ({ note: document.body.innerText.includes(note), loading: /Loading/.test(document.body.innerText) }), NOTE);
      check('AC-2', `JavaScript on, /${page}: no note, content loads`, !s.note && !s.loading, JSON.stringify(s));
      await p.close();
    }
    await on.close();

    // AC-3: the 404 page at a deep address, light and dark, 360 px; its links work
    for (const [w, scheme] of [[1280, 'light'], [360, 'dark']]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, colorScheme: scheme });
      const p = await ctx.newPage();
      const failed = [], errors = [];
      p.on('response', (r) => { if (r.status() >= 400 && r.url() !== SITE + 'a/b/c') failed.push(`${r.status()} ${r.url()}`); });
      p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
      const res = await p.goto(SITE + 'a/b/c', { waitUntil: 'networkidle' });
      const s = await p.evaluate(() => ({ h1: document.querySelector('h1').textContent, styled: getComputedStyle(document.querySelector('.site-header')).display !== 'inline',
        dark: document.documentElement.matches(':root:not([data-theme="light"])') && matchMedia('(prefers-color-scheme: dark)').matches,
        bg: getComputedStyle(document.body).backgroundColor, overflow: document.documentElement.scrollWidth > innerWidth,
        links: [...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute('href')) }));
      check('AC-3', `404 at /a/b/c, ${w} px ${scheme}: status 404, styled page, no failed files, no sideways scroll`,
        res.status() === 404 && s.h1 === 'Page not found' && s.styled && failed.length === 0 && errors.length === 0 && !s.overflow,
        JSON.stringify({ status: res.status(), bg: s.bg, failed, errors }));
      if (w === 1280) {
        const unique = [...new Set(s.links)];
        const bad = [];
        for (const href of unique) { const r = await p.request.get(SITE + href.slice(1)); if (r.status() !== 200) bad.push(`${r.status()} ${href}`); }
        check('AC-3', 'Every link on the 404 page works', bad.length === 0 && unique.length === 5, `${unique.length} links; ${bad.join(', ') || 'none broken'}`);
      }
      await p.screenshot({ path: path.join(OUT, `404-${w}-${scheme}.png`) });
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  fs.writeFileSync(path.join(OUT, '..', 'browser-results.json'), JSON.stringify(results, null, 1) + '\n');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();

# Verification: First impressions

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · [plan.md](./plan.md) · [tasks.md](./tasks.md) |
| **Date** | 2026-11-25 |
| **Result** | All acceptance criteria met; two changes during build (below) |

| AC | How it was checked | Result |
|---|---|---|
| **AC-1** | [`browser-check.cjs`](./browser-check.cjs), JavaScript off: Today, Exploited, Sitrep and Breaches show the note, exactly one visible heading and no "Loading…"; Feeds has no note; the note's Feeds link works | ✅ |
| **AC-2** | JavaScript on: no note on any of the four pages and their content loads. Earlier browser checks still pass: 007 (15), 010 (19), 013 (8); the full-site crawl is clean on all 14 page × size × theme combinations | ✅ |
| **AC-3** | A local server that answers missing addresses with `404.html`, like GitHub Pages ([`serve-like-pages.py`](./serve-like-pages.py)): `/a/b/c` returns status 404 with the styled page, no failed files, no sideways scroll, at 1280 px light and 360 px dark; all 5 linked pages answer 200 | ✅ |
| **AC-4** | `test_site_chrome.py`: `404.html` is in the shared header/footer list, every address in it starts at the site root, it has the CSP and `noindex`, no page scripts. `site.test.mjs`: the four pages carry the note and the no-JavaScript stylesheet; Feeds doesn't. Live check: *(after deploy)* | ✅ |

Browser check: 13/13. Screenshots: [Today without JavaScript](evidence/today-no-js.png) · [404, desktop](evidence/404-1280-light.png) · [404, phone, dark](evidence/404-360-dark.png)

## Changes during build

1. **Without JavaScript, the empty parts are hidden too**, not only "Loading…" (FR-2 asked for that only). Otherwise the pages showed headings over empty boxes and "–" counters. Each JavaScript-only part is marked `needs-js` and hidden by `noscript.css`, a stylesheet the browser loads only when JavaScript is off (an inline style would break the security policy).
2. **The 404 page loads `theme.js`** (the site's own light/dark script), so the toggle works there too. It has no page scripts, and everything on it works without JavaScript.

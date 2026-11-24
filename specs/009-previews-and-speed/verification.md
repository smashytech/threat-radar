# Verification: Social previews and a faster Today page

Date: 2026-11-24 · Measured like Lighthouse's mobile test (Moto G4, 150 ms latency, 1.6 Mbit/s, CPU 4× slower), local server without compression

| | Before | After |
|---|---|---|
| Largest content (the headline) appears | **9.9 s** | **2.2 s** (3 runs: 2204 / 2236 / 2264 ms) |
| Downloaded | 1,659 KB, of which `kev.json` 1,433 KB | 192 KB; `kev-recent.json` 73 KB (11 KB compressed) |

| AC | Result | Evidence |
|---|---|---|
| **AC-1** | ✅ | `scripts/test_build_recent.py` (5 tests): 400-day boundary, six fields, future dates kept, byte-identical, broken catalog refused. Today: 346 of 1,792 entries |
| **AC-2** | ✅ | Table above; [browser-results.json](browser-results.json), [today-mobile.png](evidence/today-mobile.png) |
| **AC-3** | ✅ | Spec 007's browser check, unchanged: 15 / 15 (same numbers, lists, chart, themes, keyboard, 360 px) |
| **AC-4** | ✅ | With `kev-recent.json` blocked: headline, 3 Sitrep highlights and 3 Breach Wire bars render; the week line says part of the briefing couldn't load |
| **AC-5** | ✅ | All five pages carry 10 preview tags with absolute `https://zelin.se/` addresses, written by `site_chrome.py` from each page's own title and description (tests). `social-card.png`: 1200×630 PNG, 102 KB |

## Changes during build

| Change | Why |
|---|---|
| `modulepreload` for the Today page's 8 script modules and `preload` for the headline font | Removing the catalog wait brought the headline to 2.48 s, right at the limit; fetching the script chain in parallel gave a steady 2.2 s |
| Data files are **not** preloaded | `loadJSON` fetches with `cache: "no-cache"` so visitors always get the latest issue, which makes a preload unreliable to reuse |
| Owner's request: a small **coffee cup** before "buy me a coffee" (Today page and footer), drawn as an inline icon in the warm accent colour rather than an emoji | Matches the site's fonts and both themes; it tilts slightly on hover unless the visitor prefers reduced motion |

Out of scope (needs a CDN in front of GitHub Pages, the owner's decision): CSP/HSTS/X-Frame-Options/Permissions-Policy/Cross-Origin headers, a web application firewall, DNSSEC.

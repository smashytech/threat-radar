# Verification: Morning-briefing redesign with dark mode

Date: 2026-11-17 · Data: CISA KEV catalog 2026.11.13 (1,781 entries), Sitrep 2026-11-17, Breach Wire №85

## Automated tests

| Suite | Result |
|---|---|
| Node (`npm test`, includes new `contrast`, `theme`, `today` tests) | 143 / 143 |
| Python (`scripts/test_*.py`, includes new `test_site_chrome.py` and the new feed/Slack link tests) | 135 / 135 |

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| **AC-1** | ✅ | Browser check: headline, week line ("CISA added 2 exploited flaws this week: Check Point and UnrealIRCd."), numbers 2 / 33 / 22 / 0, the 4 newest CVEs, 3 Sitrep highlights, Breach Wire №85 bars 22 / 6 / 5 and 12 months, all equal to values computed from the data files. [today-light.png](evidence/today-light.png), [today-dark.png](evidence/today-dark.png) |
| **AC-2** | ✅ | `tests/today.test.mjs`: sentence ends, bracketed asides, 160-character cut at a word, 0/1/2/3/5-vendor week lines. Live headline: 115 characters, no brackets |
| **AC-3** | ✅ | Sitrep and Breach Wire indexes removed: "This week in exploited vulnerabilities", "No Sitrep has been published yet.", "No Breach Wire issue has been published yet.", claims "–", no errors |
| **AC-4** | ✅ | A victim name planted in the Breach Wire index never appears on the page; `wireBars` reads only three counts (unit test with a planted `victimNames` field) |
| **AC-5** | ✅ | Earlier browser checks re-run at `/exploited/`: spec 004 **24 / 24** ([results](rerun-004/browser-results.json)), spec 005 **10 / 10** ([results](rerun-005/browser-results.json)), spec 006 **13 / 13** ([results](rerun-006/browser-results.json)) |
| **AC-6** | ✅ | `/#CVE-2026-123039` opens the entry, `/#mystack` the picker, `/#stack=…` the share offer, all on `/exploited/`. All 50 KEV feed entries link to `/exploited/#CVE-…`; IDs unchanged (`tag:zelin.se,2026:kev/…`); Slack links tested in `test_notify_slack.py` |
| **AC-7** | ✅ | Device light → light, device dark → dark (no `data-theme`); the toggle switches, stores `dark`, and all five pages open dark with `data-theme="dark"` **set before `<body>` exists** (no flash); tapping again → light; blocked storage → still toggles. `tests/theme.test.mjs` (7 tests). [Dark pages](evidence/) |
| **AC-8** | ✅ | `tests/contrast.test.mjs`: every text colour on every background, labels on their tinted chips, button text and control borders, in both themes; the two dark blocks are identical |
| **AC-9** | ✅ | 360 px: all five pages 360 px wide ([phone-today.png](evidence/phone-today.png), [phone-exploited.png](evidence/phone-exploited.png)). Keyboard: Skip link → logo → Today → Exploited → Sitrep → Breaches → Feeds → Dark mode, each with a visible focus ring; Enter toggles. 497 requests, 0 external; no errors. CSP unchanged (site test) |
| **AC-10** | ✅ | Inter, Space Grotesk and JetBrains Mono load from `/fonts/` only. 111 KB total; checksums and licences in [`site/fonts/`](../../site/fonts/README.md) |

| **AC-11** | ✅ | Added 2026-11-18. 2 overdue tags, 2 tips. Hover and keyboard focus show the explanation, leaving hides it; on a phone a tap opens it without opening the entry, it fits the 360 px screen (44–344 px), and Escape or a tap elsewhere closes it. [overdue-info-phone.png](evidence/overdue-info-phone.png) |

Browser results: [browser-results.json](browser-results.json) (15 / 15).

## Found and fixed during verification

- The "Subscribe in a feed reader" prefetch asked for `/exploited/feeds/vendors.json` (404) after the move. It now uses the site root. Found by re-running spec 004's check.
- Today's headline filled five lines because of a long bracketed aside. Asides are now dropped.

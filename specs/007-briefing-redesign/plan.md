# Plan: Morning-briefing redesign with dark mode

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) |
| **Status** | Draft v1, waiting for "go" |

## 1. The big picture

```
 before                          after
 /            Radar (list)       /             Today (briefing)       ← new
                                 /exploited/   Radar (list), moved    ← old "/"
 /sitrep/     Sitrep             /sitrep/      Sitrep      (new look)
 /ransomware/ Breaches           /ransomware/  Breaches    (new look)
 /feeds/      Feeds              /feeds/       Feeds       (new look)

 every page <head>:  theme.js  → sets <html data-theme> before drawing
 every page header:  logo · Today · Exploited · Sitrep · Breaches · Feeds · ☾
```

## 2. Key choices

| Choice | Why |
|---|---|
| **Design tokens** (CSS variables) in one block per theme: `:root` = light, `:root[data-theme="dark"]` = dark, and `@media (prefers-color-scheme: dark)` applies dark when no choice is stored | One place to change colours; the existing pages already use variables, so most CSS only changes values |
| `site/theme.js`: a tiny **classic script** (not a module) in `<head>`, so it runs before the page is drawn: read the stored choice, set `data-theme`; it also wires the toggle buttons | Prevents the flash; external file keeps the CSP unchanged |
| `site/today/logic.js`: **pure functions** (`headline`, `weekLine`, `todayNumbers`, `overdue`) tested in Node | Same pattern as `stats.js` and `sitrep-logic.js` |
| The current `index.html` + `app.js` move to `site/exploited/`, with relative paths adjusted | Behaviour unchanged; existing tests point at the new path |
| `site/today.js` forwards old hashes with `location.replace()` before rendering | Old links work and don't leave a useless history entry |
| `scripts/build_feeds.py` and `scripts/notify_slack.py`: entry links → `exploited/#CVE-…`; `tag:` IDs untouched | Feed readers keep their read/unread state |
| Fonts: `.github/workflows/fetch-fonts.yml`, run once by hand: downloads the pinned `@fontsource` packages from npm, copies the Latin woff2 files to `site/fonts/` with `OFL.txt`, opens a pull request with their SHA-256 sums in the description | My workspace can't reach the internet; GitHub can. A PR lets the owner see exactly what's added |
| `tests/contrast.test.mjs` reads the palette from `styles.css` and checks every text/background pair against WCAG AA | Contrast stays correct when colours are tweaked later |

## 3. Tests first

| Test | Covers |
|---|---|
| `tests/today.test.mjs` | headline cut and fallback, week line (0/1/2/4+), numbers, overdue, missing data → AC-1–AC-4 |
| `tests/contrast.test.mjs` | AC-8 |
| `tests/theme.test.mjs` | stored / device / blocked-storage choice → AC-7 (logic part) |
| `scripts/test_build_feeds.py`, `test_notify_slack.py` | new link paths, unchanged IDs → AC-6 |
| `tests/site.test.mjs` (existing) | picks up the new pages: no inline code, CSP present, `SITE_LOCALE` → NFR-1 |
| `browser-check.cjs` | both themes on all five pages, no flash, redirects, 360 px, keyboard, 0 external requests, spec 004/006 checks re-run on `/exploited/` → AC-3, AC-5–AC-7, AC-9 |

## 4. Risks

| Risk | Mitigation |
|---|---|
| Moving the Radar breaks bookmarks | Hash forwarding (FR-8) plus a plain link "Looking for the full list? → Exploited" on Today |
| A long Sitrep sentence makes a huge headline | 160-character cut, and the heading size steps down for long text |
| Font workflow fetches something unexpected | Pinned versions, PR with file list and checksums, owner merges |
| Larger change touches every page | Done in phases with the full test suite after each; screenshots of every page in both themes in `evidence/` |

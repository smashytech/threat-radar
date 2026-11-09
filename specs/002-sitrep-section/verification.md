# Verification report: Cyber Sitrep section

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) |
| **Verified** | 2026-11-06 · **All 11 acceptance criteria pass** |
| **Test suite** | 53 Python tests (21 KEV + 32 gatekeeper) + 34 JavaScript tests, all passing; `add_sitrep.py --check` OK |
| **Browser** | Headless Chrome (1280 px and 360 px, dark and light) + the live site in the desktop browser pane |

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| **AC-1** Weekday issue appears on the site with no human action | ✅ Pass | First live publisher run (fired 2026-11-06 21:51 CET) found the week's sent Sitreps, published the 3 missing days inside its window (Nov 3, 4, 5) as commit `5c98a2e` without touching anything outside `site/data/sitrep/`, and the push deployed automatically. Live archive: 4 issues, `?d=2026-11-03` renders with 3 In-KEV chips. Spot check of the AI's copies: 0 wrapped links, 0 numbered titles, 0 leftover HTML entities |
| **AC-2** TL;DR, emerging, every item with source link, action text | ✅ Pass | Live page: 10 incidents + 2 emerging + TL;DR + action box, matching the 2026-11-06 email. Source links point straight to the articles (Gmail redirect unwrapped) |
| **AC-3** `?d=` opens an issue; bad dates get a friendly message; archive complete | ✅ Pass | `sitrep.test.mjs` (7 hostile values incl. `../data/kev`, `%2e%2e%2f`, `<script>`). Browser: notice shown, latest issue displayed, **no** request for any file outside the index |
| **AC-4** Homepage teaser; hidden when no issues | ✅ Pass | Browser: "Today's Sitrep · Fri, Nov 6", Action needed badge, link `sitrep/?d=2026-11-06`. With no data folder the teaser is hidden and the Radar renders normally |
| **AC-5** "In KEV" badge for KEV CVEs → Radar detail | ✅ Pass | Live: exactly 3 KEV chips (CVE-2026-7273, CVE-2026-111497, CVE-2024-27834); 3 non-KEV CVEs link to NVD. Clicking CVE-2024-27834 opened `/#CVE-2024-27834` with its detail dialog |
| **AC-6** Invalid data refused, nothing written | ✅ Pass | `test_add_sitrep.Refused`: 18 variants (bad JSON, not an object, missing fields, unknown fields, http/`javascript:`/credential links, impossible and path-like dates, oversized text, item counts, control characters) |
| **AC-7** Booby-trapped issue renders as text | ✅ Pass | Browser: `<script>`, `<img onerror>`, `<svg onload>`, `<iframe>`, `<b>` all shown literally, **0** injected elements, **0** alerts ([screenshot](./evidence/sitrep-xss.png)). `site.test.mjs` scans every site JS file for HTML-injection APIs |
| **AC-8** Republishing changes nothing | ✅ Pass | `test_add_sitrep.Idempotent`: byte-identical issue and index files |
| **AC-9** Only the owner's own sent Sitreps | ✅ Pass | Publisher task searches `in:sent from:me` **and** requires the owner's own address as sender. The live run published only the owner's sent issues (Nov 3–5); Monday's issue was correctly left out as outside the 3-day window |
| **AC-10** Email task unchanged | ✅ Pass | "Daily cybersecurity bulletin" task not modified (same prompt, same `1 7 * * 1-5` schedule) |
| **AC-11** 360 px, strict CSP, 0 external requests | ✅ Pass | `scrollWidth − clientWidth = 0` (Sitrep dark and light, Radar with teaser); CSP test covers `site/sitrep/index.html`; live page: 0 external requests, 0 console errors |

## Changes during the build

| Change | Why |
|---|---|
| Gatekeeper **unwraps Gmail's `google.com/url?q=` redirects** itself | Every link in the real email was wrapped. The site should link straight to the source, and the AI shouldn't have to get this right |
| `site/ui.js` shared helper module | Both pages need the same safe DOM helpers; one copy, covered by the same tests |
| Publisher schedule **08:00 UTC** (owner's request: 09:00 CET) | An hour of buffer after the email (which actually lands about 07:06 UTC). Kept in UTC like the email task, so the gap stays an hour through daylight-saving changes |

![Sitrep page](./evidence/sitrep-desktop.png)

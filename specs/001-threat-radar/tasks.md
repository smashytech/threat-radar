# Tasks: Threat Radar

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · **Plan** | [plan.md](./plan.md) |
| **Rule** | Tests are written **before** the code they test. A task is done only when its tests pass. |

Legend: `[ ]` to do · `[x]` done · **→ AC-n** means this task produces the evidence for that acceptance criterion.

---

## Phase 1: Skeleton
- [x] **T01** Create the folder layout from plan §4, plus `.gitignore` (ignores `site/data/status.json`) and a starter `README.md`.

## Phase 2: Data pipeline (Python)
- [x] **T02** Create test fixtures in `tests/fixtures/`:
  - `kev_valid.json`: about 12 realistic entries spanning several months and vendors, including Log4j `CVE-2021-44228` and some ransomware-linked entries.
  - `kev_broken.json`: not valid JSON.
  - `kev_missing_field.json`: one entry with no `cveID`.
  - `kev_empty.json`: an empty `vulnerabilities` list.
  - `kev_xss.json`: a description containing `<script>alert(1)</script>`.
- [x] **T03** Write `scripts/test_fetch_kev.py`, covering validation, sorting, trimming, determinism and "no files written on failure". **→ AC-2, AC-3**
- [x] **T04** Implement `scripts/fetch_kev.py` until T03 passes. It can read from a URL (default) or a local file (`--source`), so tests never touch the network.

## Phase 3: Site logic (JavaScript, tested)
- [x] **T05** Write `tests/stats.test.mjs` for totals, last-7/30-day counts (with a fixed "today"), ransomware count, monthly buckets, top vendors, search and filters. **→ AC-4, AC-5**
- [x] **T06** Implement `site/stats.js` (pure functions, no DOM) until T05 passes.

## Phase 4: Site UI
- [x] **T07** Build `site/index.html`: semantic structure, a CSP meta tag (`default-src 'self'`), and no external resources. **→ AC-7**
- [x] **T08** Build `site/styles.css`: dark radar theme plus a light variant, a fluid layout and visible keyboard focus states. **→ AC-8 (partial)**
- [x] **T09** Build `site/app.js`: load data, render the summary cards, the latest list with "show more", search and filters, the detail view and an empty state. All feed text goes in via `textContent`. **→ AC-6**
- [x] **T10** Add SVG charts to `app.js`: monthly additions (12 months) and top 10 vendors.
- [x] **T11** Add a test asserting that `app.js` contains no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`, and that `index.html` has the CSP tag. **→ AC-6, AC-7**

## Phase 5: Automation
- [x] **T12** Write `.github/workflows/refresh-and-deploy.yml` per plan §3, with pinned actions and least-privilege permissions. **→ AC-9**
- [x] **T13** Write `.github/dependabot.yml` (github-actions ecosystem, weekly). **→ AC-10**

## Phase 6: Verify
- [x] **T14** Run the full test suite locally and confirm all tests pass.
- [x] **T15** Generate sample data from the valid fixture and preview the site in a browser at 360 px and 1280 px. Check: no sideways scroll, search for `CVE-2021-44228` works, XSS entry displays as text. **→ AC-5, AC-6, AC-8**
- [x] **T16** Write the verification report: each AC with its evidence (test name, screenshot or file).

## Phase 7: Go live
- [ ] **T17** Get the code into the owner's GitHub repo.
- [ ] **T18** Owner switches Pages source to "GitHub Actions" (one setting, about 30 seconds).
- [ ] **T19** Trigger the first run, confirm a green check, live site and real data. **→ AC-1**

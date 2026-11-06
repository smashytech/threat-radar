# Tasks: Cyber Sitrep section

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · **Plan** | [plan.md](./plan.md) |
| **Rule** | Tests before code. Done = tests pass. |

## Phase 1: Data gatekeeper (Python)
- [ ] **T01** Fixtures: `sitrep_valid.json` (built from the real 2026-11-06 email), invalid variants (missing field, http link, `javascript:` link, oversized text, unknown field, bad date, too few items), and `sitrep_xss.json`.
- [ ] **T02** `scripts/test_add_sitrep.py`: validation, CVE extraction, index rebuild, idempotency, `--check`. **→ AC-6, AC-7, AC-8**
- [ ] **T03** `scripts/add_sitrep.py` until T02 passes.

## Phase 2: Page logic (JavaScript, tested)
- [ ] **T04** `tests/sitrep.test.mjs`: `?d=` parsing, CVE↔KEV matching, action-needed detection. **→ AC-3, AC-5**
- [ ] **T05** `site/sitrep-logic.js` until T04 passes.

## Phase 3: UI
- [ ] **T06** `site/sitrep/index.html` + `sitrep.js`: issue view, archive, unknown-date message, KEV badges. **→ AC-2, AC-3, AC-5**
- [ ] **T07** Homepage: Sitrep teaser, `#CVE-…` deep links, Radar · Sitrep nav. **→ AC-4, AC-5**
- [ ] **T08** Extend `site.test.mjs` to cover the new page and JS. **→ AC-7, AC-11**

## Phase 4: Automation
- [ ] **T09** Workflows run `add_sitrep.py --check` and the new tests.
- [ ] **T10** Seed `site/data/sitrep/` with today's real issue.

## Phase 5: Verify
- [ ] **T11** Full test suite green.
- [ ] **T12** Browser checks: issue page, archive, `?d=` bad input, teaser, deep link, XSS issue, 360 px, 0 external requests. **→ AC-2…5, AC-7, AC-11**

## Phase 6: Go live
- [ ] **T13** Push; confirm deploy and live pages.
- [ ] **T14** Create the "Sitrep publisher" scheduled task; report its approval setting. **→ AC-9, AC-10**
- [ ] **T15** Fire it once now; confirm it catches up the last 3 days' issues and publishes them. **→ AC-1**
- [ ] **T16** `verification.md` with evidence for every AC.

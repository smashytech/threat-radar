# Tasks: Breach Wire section

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · **Plan** | [plan.md](./plan.md) |
| **Rule** | Tests before code. Done = tests pass. |

## Phase 1: Gatekeeper (Python)
- [x] **T01** Fixture `breachwire_valid.json` from the real Issue №75, plus `breachwire_xss.json`.
- [x] **T02** `scripts/test_add_breachwire.py`: valid publish, each consistency rule, the name guard (invented victim names, see plan §6), invalid input, idempotency, `--check`. **→ AC-3, AC-4, AC-6, AC-8**
- [x] **T03** `scripts/add_breachwire.py` until T02 passes.

## Phase 2: Page logic (JavaScript)
- [x] **T04** `tests/breachwire.test.mjs` + `site/breachwire-logic.js` (Sweden status, KEV ransomware filter, chart scaling, `?d=` reuse). **→ AC-11, AC-12**

## Phase 3: UI
- [x] **T05** `site/ransomware/index.html` + `breachwire.js`. **→ AC-2, AC-11, AC-12**
- [x] **T06** Homepage Breach Wire teaser; third nav button on all three pages. **→ AC-11**
- [x] **T07** Static safety tests automatically cover the new page. **→ AC-7, AC-13**

## Phase 4: Automation & seed
- [x] **T08** Workflows run `add_breachwire.py --check` + new tests.
- [x] **T09** Seed Issue №75 (6 Nov) through the gatekeeper with the name guard.

## Phase 5: Verify
- [x] **T10** Full suite green; browser checks (desktop/mobile, XSS, bad `?d=`, empty state, 0 external requests). **→ AC-2, AC-7, AC-12, AC-13**

## Phase 6: Go live
- [x] **T11** Push; confirm deploy.
- [x] **T12** Create the Breach Wire publisher task (daily 09:00 UTC); fire once to catch up 3–5 Nov, including the multi-part/corrected 5 Nov issue. **→ AC-1, AC-5, AC-9, AC-10**
- [x] **T13** Live check: published files contain none of the emails' victim names. **→ AC-3**
- [x] **T14** `verification.md`.

# Tasks: My stack

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · **Plan** | [plan.md](./plan.md) |
| **Rule** | Tests before code. Done = tests pass. |

## Phase 1: Logic (tested first)
- [ ] **T01** `tests/stack.test.mjs`: index, search, matching, summary, stale names, mentions, share round trip, hostile inputs. **→ AC-1, AC-2, AC-3, AC-9**
- [ ] **T02** `site/stack-logic.js` until T01 passes.
- [ ] **T03** `site/stack-store.js` (storage with in-memory fallback) + tests with a fake and a throwing storage. **→ AC-4**

## Phase 2: Radar
- [ ] **T04** Picker dialog: search, vendor and product ticks, counts, stale notes, copy link, clear; `#mystack` opens it. **→ AC-1, AC-2**
- [ ] **T05** "My stack only" filter, badges, summary strip (incl. new since last visit), blip highlights. **→ AC-6**
- [ ] **T06** Share-link offer banner. **→ AC-8**

## Phase 3: Other pages
- [ ] **T07** Sitrep: CVE chip tags, vendor-mention tags, stack line. **→ AC-7**
- [ ] **T08** Ransomware: KEV panel highlights, ransomware count, stack line. **→ AC-7**
- [ ] **T09** Footer privacy line on all pages; workflows run `tests/stack.test.mjs`.

## Phase 4: Verify
- [ ] **T10** Full suite green; browser checks: persistence, storage blocked, no stack data in requests or cookies, share link, hostile stored data, 360 px, keyboard. **→ AC-4, AC-5, AC-8, AC-9, AC-10**
- [ ] **T11** Push, confirm deploy, check live.
- [ ] **T12** `verification.md`.

# Tasks: My stack

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · **Plan** | [plan.md](./plan.md) |
| **Rule** | Tests before code. Done = tests pass. |

## Phase 1: Logic (tested first)
- [x] **T01** `tests/stack.test.mjs`: index, search, matching, summary, stale names, mentions, share round trip, hostile shares. **→ AC-1, AC-2, AC-3, AC-12**
- [x] **T02** `site/stack-logic.js` until T01 passes.
- [x] **T03** `tests/presets.test.mjs`: preset operations, name rules, last-preset protection, shared naming, lastSeen, hostile records. **→ AC-5, AC-11, AC-12**
- [x] **T04** `site/presets.js` until T03 passes.
- [x] **T05** `tests/stack-store.test.mjs` with fake and throwing storages; `site/stack-store.js` until it passes. **→ AC-4, AC-6, AC-7**

## Phase 2: Radar
- [ ] **T06** Picker dialog: preset bar (dropdown, Save as, Rename, Delete), search, vendor and product ticks, counts, stale notes. **→ AC-1, AC-2, AC-5**
- [ ] **T07** Remember tickbox, "Copy link to this preset", "Forget everything", the Remember hint, the storage-unavailable message. **→ AC-4, AC-6, AC-7**
- [ ] **T08** "My stack only" (saved per preset), badges, summary strip (incl. new since last visit), blip highlights, `#mystack`. **→ AC-9**
- [ ] **T09** Share-link offer banner → new preset. **→ AC-11**

## Phase 3: Other pages
- [ ] **T10** Sitrep: CVE chip tags, vendor-mention tags, stack line. **→ AC-10**
- [ ] **T11** Ransomware: KEV panel highlights, ransomware count, stack line. **→ AC-10**
- [ ] **T12** Footer privacy line on all pages; workflows and `package.json` run the new tests.

## Phase 4: Verify
- [ ] **T13** Full suite green; browser checks: remember on/off across tabs, unticking clears storage, forget, storage blocked, no stack data in requests or cookies, share link, hostile stored data, presets end to end, 360 px, keyboard. **→ AC-4–8, AC-11–13**
- [ ] **T14** Push, confirm deploy, check live.
- [ ] **T15** `verification.md`.

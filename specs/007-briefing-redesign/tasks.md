# Tasks: Morning-briefing redesign with dark mode

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · **Plan** | [plan.md](./plan.md) |
| **Rule** | Tests before code. Done = tests pass. |

## Phase 1: Foundations
- [x] **T01** `tests/contrast.test.mjs`; new light/dark palette in `styles.css` until it passes. **→ AC-8**
- [x] **T02** `tests/theme.test.mjs`; `site/theme.js` + toggle. **→ AC-7**
- [x] **T03** Font workflow; owner merges the font PR. **→ AC-10**

## Phase 2: Move the Radar
- [x] **T04** Move to `/exploited/`; existing tests and spec 004/006 checks pass there. **→ AC-5**
- [x] **T05** Feed and Slack links → `/exploited/`, IDs unchanged (tests first). **→ AC-6**

## Phase 3: Today page
- [x] **T06** `tests/today.test.mjs`, then `site/today/logic.js`. **→ AC-1–AC-4**
- [x] **T07** Today page markup and rendering, hash forwarding. **→ AC-1, AC-3, AC-6**

## Phase 4: New look everywhere
- [x] **T08** Shared header/footer and restyle of Exploited, Sitrep, Breaches, Feeds. **→ AC-9**

## Phase 5: Verify and ship
- [x] **T09** Browser checks, both themes, all pages, screenshots. **→ AC-3, AC-5–AC-7, AC-9**
- [x] **T10** Deploy, live check, README, `verification.md`.

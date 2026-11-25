# Tasks: Breach statistics over time

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · **Plan** | [plan.md](./plan.md) |
| **Rule** | Tests before code. Done = tests pass. |

- [x] **T01** Tests: the 111-label fixture, sector rules, group keys and aliases. Then `SECTOR_RULES`, `group_key`, `GROUP_ALIASES` in the gatekeeper. **→ AC-1, AC-3**
- [x] **T02** `--rebuild` all stored issues; check totals. **→ AC-2**
- [x] **T03** Tests, then `scripts/build_breach_stats.py`; workflow step; `.gitignore`. **→ AC-4, AC-5**
- [x] **T04** Tests, then `site/breach-stats-logic.js`; Trends markup and rendering. **→ AC-6**
- [x] **T05** Browser check; deploy; `verification.md` with the label → sector table for the owner. **→ AC-6, AC-7**

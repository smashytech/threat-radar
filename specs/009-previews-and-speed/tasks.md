# Tasks: Social previews and a faster Today page

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) |
| **Rule** | Tests before code. Done = tests pass. |

- [x] **T01** `scripts/test_build_recent.py`, then `scripts/build_recent.py`; workflow step; `.gitignore`. **→ AC-1**
- [x] **T02** `today.js`: read `kev-recent.json`, draw each part as its data arrives. **→ AC-3, AC-4**
- [x] **T03** Social tags via `site_chrome.py` (tests first); preview image from `scripts/social-card.html`. **→ AC-5**
- [x] **T04** Measure before/after; spec 007 browser check; deploy; `verification.md`. **→ AC-2, AC-3**

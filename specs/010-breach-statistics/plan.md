# Plan: Breach statistics over time

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) |
| **Status** | Draft v1, waiting for "go" |

## 1. The big picture

```
 publisher bot → raw sector labels, group names
   → add_breachwire.py (gatekeeper)
        map labels → 17 sectors (+ Other, printed)   ← new
        merge groups by key + alias                    ← new
   → site/data/breachwire/<date>.json, index.json      (committed, as today)

 deploy → scripts/build_breach_stats.py → site/data/breachwire/stats.json   (derived)
 Breaches page → issue first, then stats.json → Trends section
```

## 2. Key choices

| Choice | Why |
|---|---|
| `SECTOR_RULES`: an ordered list of (sector, regular expression) in `add_breachwire.py`; first match on the label's main part (before " / ") wins | Readable, testable, easy to extend in an amendment. Order matters: "Advertising technology" must hit Professional services before Technology |
| The existing Retail rule becomes one of the rules | No behaviour lost |
| `group_key(name)`: lower case, keep letters and digits; `GROUP_ALIASES`: key → display name | Merges case and spacing variants without a list of every gang |
| `scripts/build_breach_stats.py`, pure functions + CLI, reads only the allow-listed fields | Same pattern as `build_feeds.py` and `build_recent.py` |
| `site/breach-stats-logic.js` (pure: shares, changes, ranks) + rendering in `breachwire.js` | Tested in Node like the other logic files |
| The sector grid is an HTML `<table>` with a caption and row headers | Screen readers read it as a table; it scrolls in its own box on phones |

## 3. Tests first

| Test | Covers |
|---|---|
| `scripts/test_add_breachwire.py` (extended) | All 111 current labels → expected sector (fixture); Other share; merging adds counts; group keys and aliases; rebuild keeps totals → AC-1–AC-3 |
| `scripts/test_build_breach_stats.py` | Month by window date, averages, Sweden, top groups, first-seen groups, display names, planted name and planted field never copied, byte-identical → AC-4, AC-5 |
| `tests/breach-stats.test.mjs` | Shares, percentage-point changes, rank changes, "so far", sorting |
| `specs/010-…/browser-check.cjs` | Trends section figures, month picker, 360 px, keyboard, themes, issue before Trends → AC-6, AC-7 |

## 4. Risks

| Risk | Mitigation |
|---|---|
| A rule maps a label to the wrong sector | The full table is reviewed by the owner in `verification.md`; fixing a rule is a small change, and `--rebuild` re-applies it to every issue |
| The rebuild changes stored issues, which the deploy gate checks against the previous rules | The previous rules accept any sector label, so the rebuilt issues pass them; the rebuild is a normal (non-publisher) commit |
| Statistics over 3 weeks look thin | Expected; spec 012 adds October, and every month makes it more useful |

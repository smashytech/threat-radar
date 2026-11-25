# Plan: Short briefs for threat groups

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) |
| **Status** | Approved 2026-11-25 ("go" 21:30). In progress |

```
 content/group-briefs.json  (written once, reviewed by the owner)  ─┐
 stored issue files (checked) ─► build_breach_stats.py ─────────────┴─► breachwire-groups.json
                                                                        name · brief · first seen ·
                                                                        days active per month · latest issue
 Trends → (i) → brief + "First seen … · active on X of Y days in <month>" + "Latest issue →"
```

| Step | What |
|---|---|
| T01 | Tests, then the new `breachwire-groups.json` (facts + briefs, no ledger text) |
| T02 | Draft 23 briefs → a review page for the owner → owner's edits/OK |
| T03 | Tests, then the popup (brief, facts for the picked month, latest-issue link) |
| T04 | Browser check, deploy, verification, specs index; spec 013 marked as replaced in part |

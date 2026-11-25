# Plan: Group info in Trends

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) |
| **Status** | Draft v1, waiting for "go" |

```
 stored issue files (checked by gatekeeper + 011)
   → build_breach_stats.py  → breachwire-stats.json   numbers only (unchanged)
   → build_breach_stats.py  → breachwire-groups.json  name, profile, issue date/no.   ← new
 Breaches → Trends tab opened → both files → (i) popup per gang
```

| Choice | Why |
|---|---|
| Same script (`build_breach_stats.py`) writes the second file | Same inputs, same `group_key` merging, one workflow step |
| Popup logic in `breach-stats-logic.js` (pure), rendering in `breachwire.js` | Testable in Node like the rest |
| Reuse the Overdue tooltip's CSS and behaviour | Consistent, already accessible and tested |

## Tests first

| Test | Covers |
|---|---|
| `scripts/test_build_breach_stats.py` (extended) | AC-1, AC-2 |
| `tests/breach-stats.test.mjs` (extended) | Picking the profile by display name; missing file |
| `specs/013-group-info/browser-check.cjs` | AC-3, AC-4 |

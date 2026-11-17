# Plan: Vendor chart period

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) |

| File | Change |
|---|---|
| `site/stats.js` | `topVendors(entries, n, { days, today })`: when `days > 0`, reuses `filterEntries` with `windowDays` so the period rule is identical to the list's |
| `site/index.html` | A `segmented` radio group (`name="vendor-period"`) in the vendor panel; subtitle gets an id; the list's "Added" group gains `1y` (365) |
| `site/app.js` | `state.vendorDays = 365`; `renderVendors()` uses it and writes the subtitle; tapping a bar also sets the list window to `vendorDays` |
| `site/styles.css` | Panel header row with the switch beside the title (wraps on phones) |
| `tests/stats.test.mjs` | AC-1 tests first |
| `browser-check.cjs` | AC-2 – AC-5 in a real browser |

Radio buttons (not buttons) give arrow-key behaviour and screen-reader "1 of 3" for free,
and match the existing "Added" control.

## Changes during build

| Change | Why |
|---|---|
| A hidden legend no longer inherits the `width: 100%` meant for visible legends | The browser check found it pushed the page 32 px wider than a 360 px phone |
| Switch labels never wrap | "90 days" broke onto two lines on a phone |
| Periods widened to **7d · 30d · 90d · 1y · All**, same labels as the list filter (was 12 mo · 90 days · All time) | Owner's request, 2026-11-17: "so it matches the period ticker below" |

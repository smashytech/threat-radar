# Verification: Vendor chart period

Date: 2026-11-17 · Data: CISA KEV as published that morning (1,781 entries)

| AC | Result | Evidence |
|---|---|---|
| **AC-1** | ✅ | `tests/stats.test.mjs` "top vendors can be counted for a period": 90 days, 7 days, all time unchanged, empty period. Full suite 109/109 |
| **AC-2** | ✅ | Opens on 12 months (Microsoft 42, Cisco 22, Google 12); 90 days (Cisco 7, Linux 6, Microsoft 6); All time (Microsoft 391, Cisco 103). [12-months.png](evidence/12-months.png), [90-days.png](evidence/90-days.png) |
| **AC-3** | ✅ | Tapping the top bar in each period: Microsoft 42 → 42 matches with Added = 1y; Cisco 7 → 7 with 90d; Microsoft 391 → 391 with All |
| **AC-4** | ✅ | Arrow key moves 12 mo → 90 days with a visible focus ring; 360 px: 0 px overflow, switch inside the screen. [phone-360.png](evidence/phone-360.png) |
| **AC-5** | ✅ | 0 external requests, 0 console errors; all existing tests pass |
| FR-6 | ✅ | Swedish browser shows "last 12 months · tap to filter" |

Browser results: [browser-results.json](browser-results.json) (10/10).

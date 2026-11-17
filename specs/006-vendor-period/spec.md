# Feature spec: Vendor chart period

| | |
|---|---|
| **Spec ID** | 006-vendor-period |
| **Status** | Approved v1 (owner: "option A seems the best fit", 2026-11-17). Built and verified |
| **Owner** | smashytech |
| **Builds on** | [001](../001-threat-radar/spec.md) |
| **Created** | 2026-11-17 |

## 1. Summary

The **Most-exploited vendors** chart gets a period switch with the same choices as the list's "Added" filter: **7d · 30d · 90d · 1y · All**.
The bars recount for the chosen period. The default is **12 months**.

## 2. Why

"All time" adds up more than 20 years of history, so Microsoft (391, of which Windows
alone is 175) dwarfs everyone else and the chart says little about *now*.

| Period | #1 | #2 | Ratio |
|---|---|---|---|
| All time | Microsoft 391 | Cisco 103 | 3.8× |
| 12 months | Microsoft 42 | Cisco 22 | 1.9× |
| 90 days | Cisco 7 | Microsoft 6 | ≈1× |

(Counts on 2026-11-17.) The bars stay honest: lengths still match the numbers.

## 3. Requirements

- **FR-1** A switch in the vendor panel with exactly the list filter's periods and labels: 7d, 30d, 90d, 1y (365 days), All. Default: 1y.
- **FR-2** The top 10 vendors and their counts recount for the chosen period, counting today as day 1 (same rule as the list's "Added" filter).
- **FR-3** The panel subtitle names the period ("last 12 months · tap to filter").
- **FR-4** Tapping a vendor filters the list **to the same period**, so the list shows the same number as the bar. The list's "Added" filter gains a **1y** option for this.
- **FR-5** Fewer than 10 vendors in a period → show what there is; none → "Nothing added in this period."
- **FR-6** Works with the keyboard, at 360 px, and in a Swedish browser; CSP unchanged; no new requests.

## 4. Out of scope

- Remembering the chosen period between visits.
- Log scales, broken bars, or hiding vendors.

## 5. Acceptance criteria

| AC | Criterion |
|---|---|
| **AC-1** | `topVendors` with a period counts only entries in that period, ties alphabetical; with no period, it behaves as before |
| **AC-2** | The page opens on 12 months; switching to 90 days / All time redraws the bars and the subtitle |
| **AC-3** | Tapping a bar in the 12-month view filters the list to that vendor **and** 1y, and the match count equals the bar's count |
| **AC-4** | Keyboard: the switch is reachable and changeable with Tab and arrow keys; 360 px: no horizontal scroll |
| **AC-5** | Existing tests still pass; no new external requests |

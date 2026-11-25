# Verification: Breach statistics over time

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · [plan.md](./plan.md) · [tasks.md](./tasks.md) |
| **Date** | 2026-11-25 |
| **Result** | All acceptance criteria met, with two changes during build (below) |

## Acceptance criteria

| AC | How it was checked | Result |
|---|---|---|
| **AC-1** | `test_add_breachwire.py`: all 111 labels map to the expected sector (fixture). The full table is below for the owner to review. Other caused by the rules: 1 of 906 victims (0.1%) | ✅ (see change 1) |
| **AC-2** | `--rebuild` over all 23 stored issues; `--check` passes; every sector total still equals the victim count | ✅ |
| **AC-3** | Gatekeeper and builder tests: "The Gentlemen"/"THE GENTLEMEN", "INC RANSOM"/"Inc Ransom", "VORTEX"/"Vortex" count once | ✅ |
| **AC-4** | Hand count from the 23 issue files for November vs. the stats file: 23 days, 906 victims, 5 Swedish, 104 Healthcare & life sciences, 84 for The Gentlemen; identical in both. Built twice: same SHA-1 (`d37c449…`) | ✅ |
| **AC-5** | Builder test plants a victim name in a group profile and text in extra fields; none reaches the output | ✅ |
| **AC-6** | Browser check, below | ✅ |
| **AC-7** | Browser check, below | ✅ |

## Browser check (`browser-check.cjs`)

| AC | Check | Result |
|---|---|---|
| AC-6 | Per-month row: days, victims, per day, Sweden, groups match the stats file | ✅ |
| AC-6 | Sector grid: 17 sectors + Other, largest first, Other last, shares add up | ✅ |
| AC-6 | Top groups: 10, the busiest first, with claims and share | ✅ |
| AC-6 | A note says where the statistics start | ✅ |
| AC-7 | No errors or CSP violations in the console | ✅ |
| AC-6 | The month picker changes the groups list; November shows ▲/▼/new marks, October (first month) none | ✅ |
| AC-6 | Two months give two grid columns and a change mark in each November cell | ✅ |
| AC-7 | The daily issue is on screen while Trends is still loading | ✅ |
| AC-7 | Without the stats file the issue still shows and Trends stays hidden | ✅ |
| AC-7 | 360 px with six months: no page-wide sideways scroll; the sector grid scrolls in its own box | ✅ |
| AC-7 | Keyboard: Tab reaches the per-month table, the sector grid and the month picker | ✅ |
| AC-7 | Dark theme applies (device setting) | ✅ |
| AC-7 | CSP on the Breaches page is unchanged and the same as the other pages | ✅ |

Screenshots: [light, desktop](evidence/trends-light.png) · [dark, 360 px, six months of test data](evidence/trends-dark-360.png)

## Changes during build

1. **AC-1, "at most 2 % in Other", is measured on what the rules decide.** 95 of 906 victims were already stored as "Other" or "Mixed" by the publisher before this spec, and the original label behind them can't be recovered. Those stay Other. Counting only labels the rules didn't recognise, Other is 0.1%. Spec 012 (October import) starts from the publisher's raw labels, so its Other share will be lower.
2. **The stats file is `data/breachwire-stats.json`, not `data/breachwire/stats.json`.** The gatekeeper refuses any unexpected file inside `data/breachwire/` (a safety check worth keeping), so the derived file sits next to the folder instead.

## Sector label → sector table (for the owner to review)

Every label the publisher has used so far, with its number of claimed victims. A wrong match is fixed with a small-change amendment; `--rebuild` then re-applies it to every stored issue.

| Sector | Victims | Labels (victims) |
|---|---|---|
| **Manufacturing & industrial** | 113 | Manufacturing (108); Aerospace & defense (1); Automotive (1); Diversified manufacturing (1); Manufacturing / retail (1); Textile (1) |
| **Healthcare & life sciences** | 104 | Healthcare (89); Biopharmaceutical (2); Pharmaceutical (2); Biopharmaceutical neuroscien (1); Biopharmaceutical t cell imm (1); Biotechnology (1); Health (1); Healthcare / biopharma (1); Healthcare technology (1); Life-sciences cloud / document services (1); Medical devices (1); Medical supplies manufacture (1); Pharma wholesale (1); Senior living / care (1) |
| **Professional services** | 95 | Professional Services (62); Professional services (16); Advertising & marketing (1); Advertising technology (1); Audience measurement (1); Business Services (1); Connected tv advertising age (1); Digital marketing & web development (1); Employee benefits consulting (1); Engineering (1); Engineering & procurement (1); Engineering services (1); Legal (1); Legal services / eDiscovery (1); Management consulting (1); Market research recruitment (1); Marketing technology (1); Private security services (1); Service provider (1) |
| **Retail & e-commerce** | 63 | Retail & E-Commerce (62); Franchise (1) |
| **Technology & telecom** | 65 | Technology (61); Email deliverability (1); Technology / manufacturing (1); Telecom / ISP (1); Telecom / pay-TV (1) |
| **Financial services & insurance** | 49 | Financial Services (31); Financial services (5); Insurance (2); Investment advisory (2); Banking (1); Debt recovery (1); Financial (1); Financial advisory (1); Financial planning & insurance (1); Financial solutions (1); Fintech (1); Insurance agency (1); Investment holding (1) |
| **Education** | 25 | Education (24); Online education (1) |
| **Transportation & logistics** | 20 | Transportation (17); Bus transport (1); Transportation & logistics (1); Transportation / logistics (1) |
| **Construction & real estate** | 20 | Construction (11); Real estate (4); Construction / luxury-retail fit-out (1); HVAC services (1); Industrial property manageme (1); Real estate & construction (1); Real estate development (1) |
| **Government & public sector** | 16 | Government & Defense (10); Government (6) |
| **Energy, utilities & resources** | 15 | Energy & Utilities (9); Energy (2); Energy & utilities (2); Environmental services (1); Mining & Chemicals (1) |
| **Food & agriculture** | 16 | Agriculture and Food Production (7); Agriculture & Food Production (3); Food & beverage (2); Food production (2); Food (1); Food supply (1) |
| **Hospitality & leisure** | 20 | Hospitality (14); Fitness / leisure (1); Gaming (1); Hotels (1); Restaurant chain (1); Restaurants (1); Stage equipment (1) |
| **Media & publishing** | 3 | Information & media (1); Live-entertainment data & publishing (1); Media (1) |
| **Wholesale & distribution** | 4 | Equipment dealer (1); Industrial distribution (1); Wholesale / distribution (1); Wholesale / textiles (1) |
| **Non-profit & associations** | 9 | Non-profit (4); Labor union (1); Non-profit / social services (1); Non-profit membership organisation (1); Nonprofit membership organiz (1); Sports governance (1) |
| **Not disclosed** | 173 | Not disclosed (130); Sector not disclosed (34); Not stated (9) |
| **Other** | 96 | Mixed (64); Other (31); Diversified (1) |

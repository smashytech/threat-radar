# Feature spec: Breach statistics over time

| | |
|---|---|
| **Spec ID** | 010-breach-statistics |
| **Status** | Approved v1 (owner confirmed the choices, 2026-11-25 10:21). In progress |
| **Owner** | smashytech |
| **Builds on** | [003](../003-breach-wire-section/spec.md), [008](../008-security-hardening/spec.md) |
| **Followed by** | 011 (independent victim-name check), 012 (import October issues) |
| **Created** | 2026-11-25 |

---

## 1. Summary

The Breaches page gets a **Trends** section: claimed victims, sectors and groups
**per month**, so changes over time become visible. To make the numbers
trustworthy, sectors move to a **fixed list of 17**, and group names are
**normalised** so one gang is never counted as two.

## 2. Why

23 daily issues (3–25 November, 906 claimed victims) show the problem:

- **111 different sector labels**, many meaning the same thing: "Not disclosed" /
  "Sector not disclosed" / "Not stated"; "Professional Services" /
  "Professional services"; one-offs cut off mid-word ("Biopharmaceutical
  neuroscien"); a catch-all "Mixed" hiding 64 victims.
- **Duplicate group names**: "The Gentlemen" / "THE GENTLEMEN", "INC RANSOM" /
  "Inc Ransom", "VORTEX" / "Vortex" are counted as separate groups.

Monthly statistics on that data would be wrong. A fixed list also lets the
statistics grow over time without the categories drifting.

## 3. Decisions

| Question | Answer (owner, 2026-11-25) |
|---|---|
| Sector list | The 17 below, built from the real labels |
| Healthcare and pharma | One sector |
| Older issues | Imported later, from 1 October, in spec 012, after the independent victim-name check (spec 011) |
| Where Trends goes | **Below** the daily issue, so the page still opens with today's news |

**The 17 sectors**

| Sector | Typical labels it covers |
|---|---|
| Manufacturing & industrial | manufacturing, industrial, automotive, aerospace & defence, textiles |
| Healthcare & life sciences | healthcare, hospitals, medical devices, pharma, biotech, senior care |
| Professional services | legal, consulting, accounting, engineering services, marketing & advertising, recruitment |
| Retail & e-commerce | retail, shops, e-commerce, fashion, consumer goods, franchises |
| Technology & telecom | IT, software, cloud, data services, telecom, ISPs |
| Financial services & insurance | banking, insurance, investment, fintech, debt collection |
| Education | schools, universities, online education |
| Transportation & logistics | transport, logistics, shipping, airlines, bus and rail |
| Construction & real estate | construction, real estate, property management, HVAC |
| Government & public sector | government, municipalities, public agencies |
| Energy, utilities & resources | energy, utilities, oil and gas, mining, chemicals, environmental services |
| Food & agriculture | agriculture, food production, beverages |
| Hospitality & leisure | hotels, restaurants, travel, fitness, gaming, sports, entertainment |
| Media & publishing | media, publishing, broadcasting |
| Wholesale & distribution | wholesale, distribution, equipment dealers, supply |
| Non-profit & associations | non-profits, charities, unions, membership organisations |
| Not disclosed | "not disclosed", "not stated", "unknown" |
| *(Other)* | anything no rule recognises; reported so the list can grow |

Builder proposals (the owner can change any of these before "go"):

| Proposal | Why |
|---|---|
| Sectors are mapped by the **gatekeeper** (`add_breachwire.py`) from the publisher's raw labels, with ordered keyword rules; stored issues are re-mapped once with the existing `--rebuild` | One place decides; the publisher's instructions don't change |
| A label no rule recognises goes to **Other**, and the gatekeeper prints it; a new sector or rule is added as a small-change amendment | The list grows deliberately, not by accident |
| Groups are merged by a **key** (lower case, letters and digits only) plus a short alias list for spellings that differ more ("INC RANSOM" → "INC Ransom"); a group is shown by its alias, or else by its most common spelling | New gangs appear daily (52 of 128 groups so far were seen once), so a fixed group list is impossible; normalising is |
| A month = the **day the claims were posted** (the issue's `window`, UTC), not the issue's send date | A claim posted on 31 October belongs to October even if the digest went out on 1 November |
| Monthly figures show **total and average per day**, and a month still in progress is marked "so far" | November's first days and a full October must be comparable |
| Statistics are built at deploy into `data/breachwire/stats.json`, from the issue files, like the feeds | Derived, never committed; always matches the published issues |

## 4. User stories

1. As a **visitor**, I see whether claimed victims are rising or falling month to month.
2. As a **visitor in healthcare**, I see how my sector's share changes over time.
3. As a **visitor tracking gangs**, I see the top groups each month, who climbed, and who is new.
4. As the **owner**, I can trust that one gang is never counted twice and that sectors don't multiply.

## 5. Functional requirements

**Sectors**
- **FR-1** The gatekeeper maps every sector label onto the 17 sectors or Other, adds up counts that land on the same sector, and refuses nothing it didn't refuse before (the victim total still has to match).
- **FR-2** Unrecognised labels are listed in the gatekeeper's output (labels only, never victim names).
- **FR-3** All stored issues are re-mapped (`--rebuild`); every daily issue from then on is stored with the fixed sectors.

**Groups**
- **FR-4** Group names are merged by key and alias within each issue; the stored name is the alias if one exists.
- **FR-5** Across issues, a group's display name is its alias, or else its most common spelling (ties: alphabetical).

**Statistics** (`data/breachwire/stats.json`, built at deploy)
- **FR-6** Per month: number of issues (days covered), claimed victims (total and average per day), Swedish victims, victims per sector, the top 15 groups with their claims, and the number of groups seen for the first time that month.
- **FR-7** Built only from allow-listed numeric fields, sector names and group names. **Never** group profiles, free text or anything that could carry a victim name.

**Trends section** (Breaches page, below the daily issue)
- **FR-8** **Per month**: one row or bar per month: issues, claimed victims, average per day, Sweden; "so far" on the current month.
- **FR-9** **Sectors over time**: a grid with the 17 sectors as rows and months as columns, each cell the sector's share of that month's victims (shaded by size), plus the change against the previous month in percentage points. Sorted by the latest month.
- **FR-10** **Top groups**: pick a month; see its top 10 groups with claims, share, rank change against the previous month (▲ / ▼ / –), and a "new" mark for first-time groups.
- **FR-11** A note says where the statistics start ("from 3 November 2026", later "from 1 October 2026"), that these are claims, not confirmed breaches, and how a month is counted.
- **FR-12** Works at 360 px (the grid scrolls inside its own box), with the keyboard, in both themes; no new requests besides `stats.json`.

## 6. Non-functional requirements

- **NFR-1** Python standard library and vanilla JS, like the rest; deterministic output (same issues → same bytes).
- **NFR-2** CSP unchanged; data shown as text only.
- **NFR-3** The Trends section loads after the daily issue and never delays it.

## 7. Out of scope

- Importing older issues (spec 012) and the independent victim-name check (spec 011).
- Per-country trends (possible later with the same machinery).
- Changing the publisher bot's instructions.

## 8. Acceptance criteria

| AC | Criterion |
|---|---|
| **AC-1** | Each of today's 111 labels maps to the intended sector; the full label → sector table is in `verification.md` for the owner to review; at most 2% of victims land in Other |
| **AC-2** | After `--rebuild`, every stored issue uses only the 17 sectors and Other, and each issue's sector total still equals its victim count |
| **AC-3** | "The Gentlemen" / "THE GENTLEMEN", "INC RANSOM" / "Inc Ransom" and "VORTEX" / "Vortex" each count as one group |
| **AC-4** | `stats.json` per month matches a hand count from the issue files (issues, victims, Sweden, one sector, one group); same input, same bytes |
| **AC-5** | A planted victim name in a group profile or a planted extra field never reaches `stats.json` |
| **AC-6** | The Trends section shows the per-month row, the sector grid and the top-groups list with the right figures; the month picker changes the groups list |
| **AC-7** | 360 px without page-wide sideways scroll; keyboard; both themes; CSP unchanged; the daily issue appears before Trends loads |

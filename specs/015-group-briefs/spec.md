# Feature spec: Short briefs for threat groups

| | |
|---|---|
| **Spec ID** | 015-group-briefs |
| **Status** | Approved 2026-11-25 ("go" 21:30). In progress |
| **Owner** | smashytech |
| **Replaces** | [013](../013-group-info/spec.md)'s source of text (the newest ledger profile) |
| **Created** | 2026-11-25 |

---

## 1. Summary

The (i) on each gang in Trends shows a **short written brief** of who the gang is,
plus a **facts line** computed from the data, instead of the newest ledger profile.

## 2. Why

Ledger profiles are day-to-day notes ("Two of those today … were excluded as
masked"), not a description of the gang. The owner wants "a very short brief
about the threat actor" (owner's choice of option, 2026-11-25).

## 3. Decisions (proposals; the owner confirms or changes them before "go")

| Question | Proposal | Why |
|---|---|---|
| Where briefs live | `content/group-briefs.json` in the repo, one entry per gang (keyed like Trends merges names) | Written once, reviewed, versioned; outside the Breach Wire data folder, which only the publisher writes |
| Brief format | One or two sentences, **at most 160 characters**: what kind of group, since when, a notable habit. Plain English, no victim names, no web addresses or leak-site domains | Short enough for a phone popup; tests enforce it |
| What a brief may be based on | Breach Wire's own ledger notes about the gang, plus well-established public reporting. When little is known: say so plainly ("Little public reporting so far.") | No guessing about obscure gangs |
| Who writes them | This build session drafts briefs for the **23 gangs** that have been in any month's top 15; **the owner reviews them before they go live** | A human checks every sentence |
| Facts line (automatic) | "First seen 2 Oct 2026 · active on 21 of 25 days in October", for the month chosen in the picker | Always current, no free text |
| Gang without a brief | Facts line only | Honest; no fallback to ledger fragments |
| Link | "Latest issue: Tue 24 Nov →", the newest issue that lists the gang | Full context one tap away |
| Ledger profiles | No longer copied into `breachwire-groups.json` | Less free text from emails on the page = smaller risk |
| New gangs later | Facts only until a brief is added; adding briefs is a trivial change (owner asks, or reviews a batch) | Keeps upkeep in your hands |

## 4. Functional requirements

- **FR-1** `content/group-briefs.json`: `{ "<group key>": { "name": "...", "brief": "..." } }`; validated by tests (known key format, length ≤ 160, no URLs/domains/".onion", no characters outside normal text).
- **FR-2** At deploy, `build_breach_stats.py` writes `breachwire-groups.json` with, per gang: display name, brief (if any), first-seen date, per-month days active, and the latest issue date. No ledger text.
- **FR-3** The (i) shows the brief (if any), the facts line for the picked month, and the latest-issue link.
- **FR-4** Briefs never name a victim. Controls: the owner reviews every brief before it goes live (AC-2), and a test refuses web addresses, domains and ".onion" in briefs.

## 5. Acceptance criteria

| AC | Criterion |
|---|---|
| **AC-1** | Tests: brief format rules; facts computed correctly (first seen, days active per month, latest issue); no ledger text in the output; same input, same bytes |
| **AC-2** | The owner has reviewed all 23 drafted briefs before deploy (recorded in verification) |
| **AC-3** | Browser: the popup shows brief, facts for the picked month (changes with the picker) and a working latest-issue link; a gang without a brief shows facts only; phone and desktop, both themes |

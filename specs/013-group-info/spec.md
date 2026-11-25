# Feature spec: Group info in Trends

| | |
|---|---|
| **Spec ID** | 013-group-info |
| **Status** | Approved 2026-11-25 ("go" 12:39). Done, see [verification.md](./verification.md) |
| **Owner** | smashytech |
| **Builds on** | [003](../003-breach-wire-section/spec.md) (group profiles), [010](../010-breach-statistics/spec.md) (Trends), [011](../011-victim-name-check/spec.md) (independent name check) |
| **Created** | 2026-11-25 |

---

## 1. Summary

Each gang in Trends → Top groups gets an **(i)** that shows what Breach Wire last
wrote about it, with the issue it came from.

## 2. Why

Trends shows *who* is most active but not *who they are*. The profiles already
exist in the daily issues, but Trends can't reach them: `breachwire-stats.json`
holds no free text on purpose (spec 010 FR-7).

## 3. Decisions (proposals; the owner confirms or changes them before "go")

| Question | Proposal | Why |
|---|---|---|
| Where the text comes from | The gang's **most recent non-empty profile** from a published issue | That text has already passed the gatekeeper and the independent name check, so nothing new is published |
| Where it's stored | A **separate** derived file, `breachwire-groups.json`, built at deploy | `breachwire-stats.json` stays numbers-only, as spec 010 promised |
| Fields copied | Display name, profile, issue date and number. Nothing else | Allow-list, like the statistics |
| Day-specific sentences ("Today: four postings…") | **Shown as written**, with "From Breach Wire №N · date" under it | No rewriting of text; the date makes the context clear |
| No profile for a gang | "No profile yet." | Honest |
| How it opens | An (i) button after the name: hover, keyboard focus or tap; Escape closes. Same behaviour as the "Overdue" (i) on Exploited (spec 007 A1) | One pattern across the site |
| Link | "Open issue" goes to that day's issue on the Breaches page | Full context is one click away |

## 4. Functional requirements

- **FR-1** At deploy, build `breachwire-groups.json`: for every gang (merged by `group_key`, display name as in Trends), its most recent non-empty profile, with that issue's date and number.
- **FR-2** Built only from stored, checked issue files; only the fields in §3.
- **FR-3** Top groups shows an (i) after each gang's name that opens a small popup with the profile, the source line and "Open issue".
- **FR-4** The popup opens on hover, focus and tap, closes on Escape, moving away or tapping elsewhere; it is announced to screen readers.
- **FR-5** The file is fetched only when Trends is opened, with the statistics.
- **FR-6** If the file is missing, Trends works as today, without (i) buttons.

## 5. Acceptance criteria

| AC | Criterion |
|---|---|
| **AC-1** | Builder tests: the newest non-empty profile wins; spelling variants merge; empty profiles fall back to an older one; only allow-listed fields reach the file; same input, same bytes |
| **AC-2** | A text planted in any other field (countries, sectors, extra keys) never reaches the file |
| **AC-3** | Browser: every top group has an (i); hover, focus and tap open the right profile; Escape closes; "Open issue" goes to the right day |
| **AC-4** | 360 px, both themes, CSP unchanged, no new request until Trends is opened; Trends still works without the file |

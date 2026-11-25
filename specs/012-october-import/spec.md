# Feature spec: Import the October Breach Wire issues

| | |
|---|---|
| **Spec ID** | 012-october-import |
| **Status** | Draft v1, waiting for "go" |
| **Owner** | smashytech |
| **Builds on** | [003](../003-breach-wire-section/spec.md) (gatekeeper), [010](../010-breach-statistics/spec.md) (statistics), [011](../011-victim-name-check/spec.md) (independent name check) |
| **Created** | 2026-11-25 |

---

## 1. Summary

The site's Breach Wire archive starts on 3 November, when the publisher bot
began. The email archive goes back further. This spec imports the issues
covering **1 October – 1 November 2026** once, through the same safety checks
as a daily issue, so the Trends section gets a full October and a complete November.

## 2. Why

- Trends compares months. With only November, there is nothing to compare with.
- November is missing its first day (1 Nov, issue №71), because the publisher started a day later.

## 3. What's in the email archive (checked 2026-11-25)

| | |
|---|---|
| Issues found | №39 (1 Oct) to №72 (3 Nov), sent to yourself |
| In scope | №40–№71: claims posted **1 October – 1 November** (UTC) |
| Not in scope | №39 (claims from 30 September); №72 onwards (already on the site) |
| Duplicate | №65 and №66 both cover 27 October. №66 is a re-run with 0 incidents, so №65 (corrected) is used |
| Sent in parts | №51 came in 6 parts, combined in order |
| Corrected copies | Many issues have a "(corrected)" resend; the newest corrected copy is used, as the publisher does |
| Gaps | At least one day has no issue (claims from 12 October); gaps are listed, never filled in |

## 4. Decisions (proposals; the owner confirms or changes them before "go")

| Question | Proposal | Why |
|---|---|---|
| Who does the import | **This build session**, following the daily publisher's written rules exactly, one issue at a time | Same rules, same checks; no new bot and no change to the publisher's scheduled task |
| Safety checks | Every issue goes through the **gatekeeper** with its own victim-name list (kept in /tmp, deleted afterwards), and then the **independent check** (spec 011) at deploy | An imported issue is held to exactly the same bar as a daily one |
| An issue that can't be filled in without guessing | **Skip it and list it**; never estimate a number | Older issues may lack a section (e.g. data-quality flags); a guessed number would pollute the statistics |
| Slack | **No Slack alert for imported issues**: alerts only announce issues dated within the last 3 days | 31 old issues at once would flood the channel |
| Feeds | Imported issues appear in the Breach Wire feed with their **original dates** | Feed readers sort by date, so they show up as older entries |
| Note on the page | The Trends note already says where the statistics start ("from 1 October 2026"). The archive adds: "Issues before 3 November were added on 25 November from the email archive." | Honest about when the data arrived |

## 5. Functional requirements

- **FR-1** Import issues №40–№71, except №66 (§3), each stored under its send date like a daily issue.
- **FR-2** Per issue: the newest "(corrected)" copy if one exists; otherwise all parts combined in order; a missing part → skip and list.
- **FR-3** Each issue passes `add_breachwire.py` with a full victim-name list for that issue. The list lives only in /tmp and is deleted after the import.
- **FR-4** The deploy's independent name check (spec 011) checks every imported issue before any of them is published. If it holds them back, they stay unpublished until it passes.
- **FR-5** Slack alerts announce only Breach Wire issues dated within the last 3 days.
- **FR-6** The archive shows the note from §4.
- **FR-7** Sector labels no rule recognises are listed for the owner; a new rule is a small-change amendment to spec 010.
- **FR-8** One commit with prefix `breachwire:`, changing only `site/data/breachwire/` (the deploy gate's publisher lane). Code changes (FR-5, FR-6) go in separate commits.

## 6. Out of scope

- Issues before 1 October (possible later with the same steps).
- Changing the daily publisher's scheduled task.
- Re-sending or editing any email.

## 7. Acceptance criteria

| AC | Criterion |
|---|---|
| **AC-1** | Every in-scope issue is either stored or listed as skipped with a reason; numbers add up (gatekeeper) |
| **AC-2** | Every stored issue passed the gatekeeper with its name list, and the independent check passed at deploy |
| **AC-3** | No victim name in the repository, commit messages, logs or this conversation's summaries; the /tmp name lists are deleted |
| **AC-4** | Trends shows October and November; a hand count of October from the files matches the page |
| **AC-5** | A test shows Slack would not announce an issue older than 3 days |
| **AC-6** | The archive note is shown; deploy passes |

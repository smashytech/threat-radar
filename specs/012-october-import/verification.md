# Verification: Import the October Breach Wire issues

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · [plan.md](./plan.md) · [tasks.md](./tasks.md) |
| **Date** | 2026-11-25 |
| **Result** | 26 issues imported, 5 left out with a reason. All acceptance criteria met; three owner decisions during build (below) |

## What was imported

| | Issues | Claims from |
|---|---|---|
| **Imported** | 26: №40–43, №45–53, №54–57, №62–65, №67–71 | 1–4, 6–11 and 13–19 October; 24–31 October; 1 November |
| Left out: the email's own numbers don't add up | 4: №58–61 | 20–23 October. The ledger counts one posting under two gangs, or masked postings, or a country line is incomplete. Fixing it would mean guessing |
| Left out: the name guard refuses it | 1: №44 | 5 October. A victim's short alias is an ordinary industry word that also appears in one of the fixed sector names (spec 010), so the gatekeeper sees a "name". Loosening the guard is a separate decision (see follow-up) |
| Not imported by design | №39 (30 September), №66 (a 0-incident re-run of 27 October) | |
| No issue was sent | – | 12 October |

October therefore has **25 of 31 days**.

## Acceptance criteria

| AC | How it was checked | Result |
|---|---|---|
| **AC-1** | Every in-scope issue is either stored (26) or listed above with a reason (5). The gatekeeper accepted all 26; `--check` passes on all 49 stored issues | ✅ |
| **AC-2** | Each issue passed `add_breachwire.py` with its own victim-name list. An extra check matched all 49 issues against **every** day's list (1,334 names): 2 matches, both ordinary words that are also short victim aliases ("some", "forum"), read by hand, not names. The deploy's independent check (spec 011) then passed all 26 against Ransomware.live (114–269 names per issue) | ✅ |
| **AC-3** | No victim name in the repo, commits or reports; the helpers returned only dates, counts and reasons; `/tmp/import012` (name lists and drafts) was deleted after the deploy passed | ✅ |
| **AC-4** | Hand count of October from the issue files: 25 days, 865 victims, 13 Swedish, 87 in manufacturing; `breachwire-stats.json` and the page show the same. November gained its first day: 24 days, 925 victims | ✅ |
| **AC-5** | `test_notify_slack.py`: a Breach Wire issue older than 3 days is not announced, a fresh one is | ✅ |
| **AC-6** | Browser: the archive note shows; the Data quality panel shows "not recorded" for new groups on an imported issue; spec 010's Trends check passes on the real two months (13/13, after fixing that check to read the latest month's column). Deploy passed | ✅ |

Screenshot: [Trends with October and November](evidence/trends-two-months.png)

## Owner decisions during build

1. **Helper agents** did the reading (each email is 30–120 KB of HTML; 31 of them would not fit in one conversation). They worked from a shared copy of the publisher's rules, checked their numbers in scratch folders only, and could not change the site; every issue was published by the build session through the gatekeeper.
2. **New groups "not recorded".** Older emails don't record the number of brand-new groups. Instead of skipping them or storing a guessed 0, the gatekeeper now accepts `null` for it, and the page shows "not recorded". Trends computes new groups itself, so it is unaffected. The gatekeeper change went live in its own commit first, so the deploy gate's old-rules check never saw it together with the data.
3. **№51 from its 6 parts**, because its "(corrected)" copy was only a short note without data.

## Follow-up (not done, for the owner)

- **№44 (5 October):** the name guard could ignore words that are part of the 17 fixed sector names, since those come from our own list, not from the email. That loosens a security rule, so it would be a small-change amendment to spec 003, with a test. After it, №44 could be imported.
- During the gatekeeper-only deploy, GitHub briefly failed to store the `breachwire-checked` tag ("missing necessary objects"). The next deploy moved it correctly; nothing to do.

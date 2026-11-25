# Verification: Independent victim-name check

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · [plan.md](./plan.md) · [tasks.md](./tasks.md) |
| **Date** | 2026-11-25 |
| **Result** | All acceptance criteria met. One rule added by the owner during build (FR-5a), and three smaller changes during build (below) |

## Acceptance criteria

| AC | How it was checked | Result |
|---|---|---|
| **AC-1** | `test_check_victim_names.py`: a made-up name in a group profile, present in the source list but not in the bot's list, gives `found`; the report gives line, field, word count and length, and the name appears in no output (report, printout, `$GITHUB_OUTPUT`) | ✅ |
| **AC-2** | [`rehearsal.py`](./rehearsal.py) in a throwaway clone, running the workflow's own "Hold Breach Wire back" commands: source unreachable → `held`, the new issue is not in the folder that gets published, the index and statistics come from the checked data; next run with the source back → the held issue is checked and passes | ✅ |
| **AC-3** | Tests: a source name equal to a gang, country, region or sector is skipped and counted | ✅ |
| **AC-4** | Tests and rehearsal: a KEV-only commit → `none`, no call to the source; only issue files changed since `breachwire-checked` are checked | ✅ |
| **AC-5** | First real runs against Ransomware.live (below). With the placeholder rule: all 23 issues pass, 144–371 names checked per issue, tag `breachwire-checked` set. The first run, with every stored issue and two months to fetch, took 67 s (one 65 s pause for the rate limit); a normal day needs one call and a few seconds | ✅ |
| **AC-6** | `SECURITY.md`: "A victim name reached the repository", five numbered steps | ✅ |

## What the first real run found

The first run (all 23 stored issues) flagged **6 issues**. Using the field and
shape reported by the check, the flagged fields were read by hand: **all
six were false alarms**, because Ransomware.live lists placeholders as victims.

| Issues | Matched text (shape) | What it was |
|---|---|---|
| 5, 6, 7, 8 Nov | 1 word, 9 characters, in country and sector fields, in 22 other issues | "disclosed", from "Not disclosed" |
| 19 Nov | 7 words, 50 characters, in a group profile | A gang's descriptive post title ("An independent … firm in …"), quoted as an example of the gang's habit |
| 19 Nov | 2 words, 13 characters, in a group profile | "Name upcoming", a placeholder |
| 23 Nov | 2 words, 11 characters, in a group profile | "Company #2xx", a masked victim number |

No victim name had reached the site or the repository.

## Changes during build

1. **FR-5a, placeholders (owner's decision, 2026-11-25).** Source "names" that are part of an issue word, masked placeholders, or descriptions starting with "a"/"an" of 4+ words are skipped and counted. Chosen over "approve each alarm by hand" because these placeholders recur every day.
2. **A match is described, never named.** The report gives the line in the source list, the issue field (e.g. `groups[2].profile`), the word count, length, and how many other issues contain the same text. This is what made the false alarms above easy to judge.
3. **The check is not in the deploy gate's `GATEKEEPERS` list** (the plan said it would be). That list is for offline data validators that the gate re-runs with the previous rules; this check needs the network. It is still protected: publisher commits may only change their own data folder, and any code change triggers the gate's heads-up.
4. **Rehearsal instead of a branch dry run.** The workflow pushes its KEV commit to `main` and Pages only deploys from `main`, so a branch run isn't safe. `rehearsal.py` runs the real script and the workflow's own restore commands in a throwaway clone.

## Known limitation

If Breach Wire is held back while Slack alerts are set up, the held issue is
not announced in Slack when it is published later (the alert bookmark moves on
with the rest of the deploy). It still appears on the site and in the feed.
Slack is not set up yet; worth an amendment if it is.

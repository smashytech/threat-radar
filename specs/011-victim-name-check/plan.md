# Plan: Independent victim-name check

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) |
| **Status** | Approved 2026-11-25. Done; changes during build are in [verification.md](./verification.md) |

## 1. The big picture

```
 deploy (refresh job)
   security gate (spec 008)
   tests
   ► victim-name check (new)        scripts/check_victim_names.py
       changed issue files since tag breachwire-checked
       → fetch Ransomware.live month list(s), keep window −2 … +1
       → match against each stored issue file
       pass        → ok, move breachwire-checked after deploy
       unreachable → restore site/data/breachwire from breachwire-checked (workspace only)
       name found  → same restore, then fail the run
   fetch KEV, commit
   build feeds, Today slice, Breach Wire statistics   ← from whatever Breach Wire data is in place
   publish
 deploy job: move "deployed"; move "breachwire-checked" only if the check passed
```

## 2. Key choices

| Choice | Why |
|---|---|
| A separate tag, `breachwire-checked` | `deployed` moves on every deploy. If a held issue were only compared with `deployed`, the next run would see it as "already deployed" and publish it unchecked |
| Restore the folder in the workspace (`git checkout breachwire-checked -- site/data/breachwire` after removing the folder), never a commit | Holding back changes nothing in the repo; the next run tries again by itself |
| Reuse `normalize` and the matching from `add_breachwire.py` | One definition of "contains a name" |
| Fetching in one small function that takes a `fetch` callable | Tests pass fixtures; no network in tests |
| The check writes `name_check=pass|held|found` to `$GITHUB_OUTPUT` and a report without names | Later steps and the Slack message read the outcome, never the names |
| The deploy gate's lane rules stay unchanged | The new script is a gatekeeper file: added to `GATEKEEPERS` so loosening it needs the owner's `accept_rule_change` |
| First run with no `breachwire-checked` tag: check every stored issue once, then set the tag | A clean starting point; 23 issues fit in one or two month calls |

## 3. Tests first

| Test | Covers |
|---|---|
| `scripts/test_check_victim_names.py` | Day range and month selection (incl. across a month boundary); names filtered by date; a planted name found (AC-1) and reported by line only; skipped vocabulary words (AC-3); unreachable / bad JSON / too few names → held; changed-file selection (AC-4); the report and output contain no names |
| Workflow dry run on a branch, with the source blocked | Rest of the site deploys, Breach Wire is the last checked data (AC-2) |
| First real deploy | AC-5 |

## 4. Risks

| Risk | Mitigation |
|---|---|
| A false alarm (a victim name that is also an ordinary word in the issue) | Vocabulary skip (FR-5), at least 4 characters, whole words; the owner can review because the report gives the line number and issue, and the source list is public |
| The source changes its API or goes away | Treated as unreachable: Breach Wire is held, never published unchecked. A lasting outage shows up in Slack twice a day and needs an amendment |
| Rate limit hit | One call per month needed (usually one); a 429 counts as unreachable and the next run retries |
| The name is already in the public repo when it's caught | Unavoidable with a bot that commits directly (out of scope); the alert is immediate and SECURITY.md has the removal steps |

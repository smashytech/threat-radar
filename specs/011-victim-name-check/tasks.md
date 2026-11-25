# Tasks: Independent victim-name check

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · **Plan** | [plan.md](./plan.md) |
| **Rule** | Tests before code. Done = tests pass. |

- [x] **T01** Tests, then `scripts/check_victim_names.py`: day range, fetching with fixtures, matching, vocabulary skip, outcomes, report without names. **→ AC-1, AC-3, AC-4**
- [x] **T02** Workflow: the check step, the workspace restore when held, the `breachwire-checked` tag, Slack heads-up; add the script to the deploy gate's `GATEKEEPERS`. **→ AC-2, AC-4**
- [x] **T03** `SECURITY.md`: steps to remove a leaked name from the repo. **→ AC-6**
- [x] **T04** Dry run on a branch with the source blocked; then the first real deploy; `verification.md`; update `specs/README.md`. **→ AC-2, AC-5**

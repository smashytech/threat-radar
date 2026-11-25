# Tasks: Import the October Breach Wire issues

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · **Plan** | [plan.md](./plan.md) |
| **Rule** | Tests before code. Done = tests pass. |

- [ ] **T01** Test, then the 3-day Slack filter in `notify_slack.py`. **→ AC-5**
- [ ] **T02** Test, then the archive note. **→ AC-6**
- [ ] **T03** Import №40–№71 in batches through the gatekeeper; list skipped issues and unknown sector labels; delete the /tmp name lists. **→ AC-1, AC-3**
- [ ] **T04** One `breachwire:` commit; deploy; read the independent check's result. **→ AC-2**
- [ ] **T05** Hand count of October against the page; `verification.md`; update `specs/README.md`. **→ AC-4, AC-6**

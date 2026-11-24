# Verification: Security hardening

Date: 2026-11-24

## Automated tests

| Suite | Result |
|---|---|
| Node (`npm test`, incl. https-only links) | 144 / 144 |
| Python (incl. new `test_deploy_gate.py` 14, `test_security_txt.py` 4, gate messages in `test_notify_slack.py`) | 168 / 168 |

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| **AC-1** | ✅ | Unit and end-to-end tests (temporary git repo). **Live:** commit ab3bde6 titled `breachwire: deploy gate live test` added a file outside `site/data/breachwire/`; the gate printed `STOP: ab3bde6 … changes: specs/008-security-hardening/evidence/live-test.md` and the run failed with *Publish to GitHub Pages = skipped* (run 45382009222). **Real history:** run against the range before 18 Nov, the gate stops both Breach Wire commits that edited `scripts/add_breachwire.py` |
| **AC-2** | ✅ | Unchanged: the tests step still runs both gatekeepers' `--check` before every deploy |
| **AC-3** | ✅ | End-to-end test: rules loosened in one commit + data needing them in the next → stopped; `--accept-rule-change` → passes; a rule change the data didn't need → passes with `rules_changed` noted; a planted `json.py` next to the scripts is never imported |
| **AC-4** | ✅ | Live: deploy 1b5e594 printed "Code changed: …" and passed; data-only ranges produce no heads-up (tests). The Slack post itself waits for the `SLACK_WEBHOOK_URL` secret (spec 005 T13): the step reported "Nothing to send (no Slack secret)" |
| **AC-5** | ✅ | Live: the stopped run left the site on the previous deploy (`deployed` tag stayed at 1b5e594) and the "Tell Slack the deploy was stopped" job ran. Messages are built from commit titles and file names only; escaping tested with `<!channel>` |
| **AC-6** | ✅ | Live first run (3152f57): "First run: no earlier deploy to compare with", tag `deployed` set after the deploy |
| **FR-7b** | ✅ | Live: a manual run with *approve publisher commits* printed `APPROVED: ab3bde6 …`, deployed, and moved `deployed` to ab3bde6 |
| **AC-7** | ⏳ Owner | GitHub refuses ruleset creation from the builder's connection (403). Click-by-click steps: README → Security → Owner's checklist, step 1 |
| **AC-8** | ✅ | `tests/ui.test.mjs`: https → link; http, `javascript:`, `data:`, `user:pass@` → plain text |
| **AC-9** | ✅ / ⏳ | `site/.well-known/security.txt` (Contact, Expires 2027-11-24, Canonical, Policy) and `SECURITY.md` exist; the deploy log lists `./.well-known/security.txt` in the Pages package. The builder can't fetch zelin.se: owner to open https://zelin.se/.well-known/security.txt once |
| **AC-10** | ⏳ Owner / ✅ | Wiki and `fonts` branch: refused from the builder's connection (owner checklist step 6). Publisher instructions already contain the rule (see plan §4) |

# Plan: Security hardening

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) |
| **Status** | Draft v1, waiting for "go" |

## 1. Where the gate sits

```
 refresh job:  tests → gatekeepers --check → fetch KEV → commit data
               → deploy_gate.py  (new: ① lanes ② ③ old/new rules ④ code report)
               → build feeds → package
 deploy job:   publish to GitHub Pages
 alert job:    Slack (news, as today) + gate report (code heads-up)
               → move the "deployed" tag
 gate fails  → refresh job fails → no deploy; a small "blocked" job posts the reason to Slack
```

## 2. Key choices

| Choice | Why |
|---|---|
| `scripts/deploy_gate.py`: pure functions (`lane_violations(commits)`, `changed_outside_data(files)`) plus a thin git wrapper | Testable without a real repository; tests also run it against a temporary git repo end to end |
| Lanes decided by the **commit message prefix** | The only signal that tells publishers apart, since all pushes share one account. A bot that fakes a non-publisher prefix still meets ③ and ④ |
| Old rules: `git show deployed:scripts/add_<x>.py` into a temporary folder, run with `-I` (isolated) and `--check --out site/data/<x>` | Exactly the rules that were live; isolated mode stops a planted file in the folder from being imported |
| `accept_rule_change` is a `workflow_dispatch` boolean input | Only people with write access can start a manual run, and starting one is a deliberate act |
| `deployed` tag moved in the alert job, after the deploy succeeded | Same pattern as `alerts-sent` (spec 005); a failed deploy never moves it |
| `safeWebUrl` accepts `https:` only | Defence in depth; the Sitrep gatekeeper already requires https |
| `security.txt` with `Expires` one year ahead; a test fails 30 days before it expires | RFC 9116 requires `Expires`; the test is the reminder to renew |
| Publisher instructions updated with the scheduled-task tools (the builder created both tasks) | FR-8 |

## 3. Tests first

| Test | Covers |
|---|---|
| `scripts/test_deploy_gate.py` | lanes (allowed / extra file / unknown prefix), rules changed + old-rules failure, accept input, code-change report, first run, report text never contains a planted victim name or the webhook → AC-1–AC-6 |
| `tests/ui.test.mjs` (extended) | `http://` → plain text, `https://` → link, `javascript:` still blocked → AC-8 |
| `scripts/test_security_txt.py` | required fields, `Expires` in the future and more than 30 days away, no email address → AC-9 |
| Live | a deliberately bad test push on a throwaway branch is **not** used (it would deploy); instead the gate is run in CI against a temporary repo; then the real first run sets the tag → AC-6 |

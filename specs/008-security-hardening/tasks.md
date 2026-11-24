# Tasks: Security hardening

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · **Plan** | [plan.md](./plan.md) |
| **Rule** | Tests before code. Done = tests pass. |

- [ ] **T01** `scripts/test_deploy_gate.py`, then `scripts/deploy_gate.py`. **→ AC-1–AC-6**
- [ ] **T02** Workflow: gate step, `accept_rule_change` input, `deployed` tag, Slack heads-up and "blocked" message. **→ AC-3–AC-6**
- [ ] **T03** `safeWebUrl` https-only (tests first). **→ AC-8**
- [ ] **T04** `SECURITY.md`, `site/.well-known/security.txt` and its test. **→ AC-9**
- [ ] **T05** `main` rule (or owner steps), remove the `fonts` branch and the wiki. **→ AC-7, AC-10**
- [ ] **T06** Publisher instructions: "stop and report". **→ AC-10**
- [ ] **T07** README: security section and the owner's click-by-click steps.
- [ ] **T08** Deploy; first run sets `deployed`; `security.txt` live; `verification.md`.

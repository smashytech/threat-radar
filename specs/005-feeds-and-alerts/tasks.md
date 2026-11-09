# Tasks: Feeds & Slack alerts

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · **Plan** | [plan.md](./plan.md) |
| **Rule** | Tests before code. Done = tests pass. |

## Phase 1: Feeds (tested first)
- [ ] **T01** `scripts/test_build_feeds.py`: Atom validity, order, sizes, issue feeds, Breach Wire allowlist, vendor slugs, hostile text, byte-identical output. **→ AC-1–AC-5**
- [ ] **T02** `scripts/build_feeds.py` until T01 passes.

## Phase 2: Slack alerts (tested first)
- [ ] **T03** `scripts/test_notify_slack.py`: what's new, message contents and caps, escaping, no victim fields, test message, fake Slack server responses, the address never printed. **→ AC-9–AC-11, AC-13**
- [ ] **T04** `scripts/notify_slack.py` until T03 passes.

## Phase 3: Site
- [ ] **T05** `tests/opml.test.mjs`, then `site/opml.js` until it passes. **→ AC-8**
- [ ] **T06** Feeds page (`site/feeds/`): feed list, copy buttons, vendor finder, how-tos, subscribe button. **→ AC-7, AC-8**
- [ ] **T07** "Subscribe in a feed reader" in the My stack picker. **→ AC-8**
- [ ] **T08** Feed autodiscovery tags and a "Feeds" footer link on every page. **→ AC-6**

## Phase 4: Workflow
- [ ] **T09** Refresh job: `configure-pages` (pinned) → `build_feeds.py`; `.gitignore`; new tests in both workflows and `package.json`. **→ AC-5, AC-6**
- [ ] **T10** Alert job: `alerts-sent` tag, secret only in the posting step, first-run behaviour, "Send a test message" input. **→ AC-12, AC-13**

## Phase 5: Verify and ship
- [ ] **T11** Browser checks (Feeds page, OPML download, 360 px, keyboard, 0 external requests). **→ AC-7, AC-8**
- [ ] **T12** Deploy; W3C Feed Validation Service on the live feeds; a feed reader finds them from the site address. **→ AC-6**
- [ ] **T13** Owner adds the Slack secret; first run records the starting point; test message arrives. **→ AC-12, AC-13**
- [ ] **T14** README section, `verification.md` with evidence for every AC.

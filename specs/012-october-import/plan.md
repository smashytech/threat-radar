# Plan: Import the October Breach Wire issues

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) |
| **Status** | Draft v1, waiting for "go" |

## 1. Steps

```
 Gmail (read-only)            this session                         repo / deploy
 ─────────────────            ────────────                         ─────────────
 №40 … №71  ──read──►  issue JSON + /tmp name list  ──►  add_breachwire.py (gatekeeper)
                                                              │ refused → skip and list
                                                              ▼
                                                   site/data/breachwire/<date>.json
                                                              │ one "breachwire:" commit
                                                              ▼
                                       deploy: deploy gate → independent name check (011)
                                               → statistics, feed, page
```

## 2. Key choices

| Choice | Why |
|---|---|
| Follow the publisher prompt's §1–§3 word for word (which copy to use, how to count sectors, which sentences to drop from profiles) | Imported issues look exactly like daily ones |
| Work in batches of about 8 issues; run the gatekeeper after each | A mistake is caught early; the work can stop and resume |
| `notify_slack.py`: a `MAX_ALERT_AGE_DAYS = 3` filter on Breach Wire issues, with a test | Small, testable, and also protects against any future catch-up |
| The archive note in `breachwire.js`, shown when the oldest listed issue is before 3 November | No new data field needed |

## 3. Tests first

| Test | Covers |
|---|---|
| `scripts/test_notify_slack.py` | An issue older than 3 days is not announced; a fresh one is → AC-5 |
| `tests/breachwire.test.mjs` | The archive note appears only when older issues exist → AC-6 |
| Gatekeeper on every imported issue | AC-1, AC-2 |
| Deploy log of the independent check | AC-2 |

## 4. Risks

| Risk | Mitigation |
|---|---|
| Older emails use a slightly different layout | Read one early issue first; a section that can't be filled without guessing → skip and list |
| A victim name slips into a profile | Gatekeeper with the full name list, then the independent check; profiles are copied with victim-naming sentences removed |
| The work is long (31 emails) | Batches; each batch is checked before the next |

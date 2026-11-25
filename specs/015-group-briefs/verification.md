# Verification: Short briefs for threat groups

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · [plan.md](./plan.md) · [tasks.md](./tasks.md) |
| **Date** | 2026-11-25 |
| **Result** | All acceptance criteria met; one change during build (below) |

| AC | How it was checked | Result |
|---|---|---|
| **AC-1** | `test_build_breach_stats.py`: facts (first day seen, days active per month, latest issue), briefs attached by group key, no ledger text in the output (planted text in profile, countries and sectors never appears), names match Trends, same bytes; the briefs file's format rules (≤ 160 characters, no web addresses, domains or ".onion", plain text, key matches name, exact fields). Real data: 106 gangs, 23 with a brief, longest 144 characters | ✅ |
| **AC-2** | The owner reviewed all 23 briefs in the conversation and replied "Approved" (2026-11-25 21:35). Basis: Breach Wire's own ledger notes for every gang, plus well-established public reporting for the long-running ones; obscure gangs say "Little public reporting" | ✅ |
| **AC-3** | [`browser-check.cjs`](./browser-check.cjs) 10/10: brief, facts for the picked month and latest-issue link on hover; the facts change with the month picker; a gang without a brief shows facts and link only; keyboard; link lands on the issue; 360 px dark; works without the file; no request until Trends is opened; no console errors. [Phone screenshot](evidence/brief-phone-dark.png) | ✅ |

## Changes during build

1. **The facts line says "In Breach Wire since …"**, and "since our records began (1 Oct 2026)" for gangs seen on our first day. The draft wording "First seen 1 Oct 2026" contradicted briefs such as N0n's ("tracked since September 2026"), because 1 October is only when our records start.
2. Spec 013's popup content (the newest ledger profile and "From Breach Wire №…") is replaced; its browser check is superseded by this spec's.

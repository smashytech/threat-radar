# Feature spec: Independent victim-name check

| | |
|---|---|
| **Spec ID** | 011-victim-name-check |
| **Status** | Draft v1, waiting for "go" |
| **Owner** | smashytech |
| **Builds on** | [003](../003-breach-wire-section/spec.md) (the victim-name rule), [008](../008-security-hardening/spec.md) (the deploy gate) |
| **Followed by** | 012 (import October issues) |
| **Created** | 2026-11-25 |

---

## 1. Summary

Before a Breach Wire issue goes live, the deploy fetches the **public list of
claimed victims** for that day straight from Ransomware.live and checks that
none of those names appear in the issue. The check no longer depends only on
the list the publisher bot hands in.

## 2. Why

Today the gatekeeper refuses an issue that contains a victim name, but it
checks against a list **the publisher bot supplies**. The bot reads email
built from criminal leak sites. A bot tricked by hostile text in that email
could leak a name **and** leave that name off its own list. Both halves of
the check then come from the same source, so the check passes.

The fix is a second check whose list comes from somewhere the bot can't touch.

```
 today:   bot ──► issue + bot's own name list ──► gatekeeper        (one source)

 011:     bot ──► issue + bot's list ──► gatekeeper
                       deploy ──► Ransomware.live victim list ──► independent check
                                                    (a second source the bot can't touch)
```

## 3. Decisions (proposals; the owner confirms or changes them before "go")

| Question | Proposal | Why |
|---|---|---|
| Which source | **Ransomware.live API v2**, month listing (`/victims/<year>/<month>`). Free, no key | One of the two sources Breach Wire is built from; a single call covers a month, well inside the rate limit of about 1 call per minute |
| RansomLook too? | **Not in v1.** Possible later as an amendment | Its API has to be confirmed first; one independent source already closes the hole above |
| Which days | The issue's day, **2 days before and 1 after** | Aggregators date posts slightly differently than the digest; a wider range only adds false alarms |
| Source unreachable | **Hold Breach Wire back, publish everything else.** The site keeps the last checked Breach Wire data; the next run (at most about 12 hours later) tries again | KEV and Sitrep updates should not wait on a third-party API; an unchecked issue is never published |
| A name is found | Hold Breach Wire back, **fail the run**, Slack heads-up with the issue date and "line N of the source list". Never the name | The commit with the name is already in the public repo, so the owner has to act (see FR-8) |
| Names that are also ordinary issue words | A source name that is exactly a **group, country, region or sector name** in the issue is skipped and only counted | Otherwise a victim called e.g. "Akira" or "Education" would stop every issue that mentions the gang or sector |
| Terms of use | Ransomware.live's free API is for personal, non-commercial use, with attribution. Threat Radar is a personal site with no ads and already credits it in the footer | Stays inside the terms; would need revisiting if the site ever turns commercial |

## 4. User stories

1. As the **owner**, I can trust that a tricked publisher bot can't get a victim name onto the site by also leaving it off its own list.
2. As the **owner**, I'm told immediately when a name was caught, so I can remove it from the repo.
3. As a **visitor**, I still get the day's KEV and Sitrep updates when the victim source is down.

## 5. Functional requirements

**When it runs**
- **FR-1** Every deploy runs the check on each Breach Wire issue file added or changed since the **last checked** commit (a new tag, `breachwire-checked`). The KEV and Sitrep lanes are not affected.
- **FR-2** A manual run can re-check **all** stored issues (used by spec 012's import).

**The check**
- **FR-3** For each issue, fetch the source's victims for the months covering the day range (the issue's window day −2 … +1) and keep the names whose discovery date falls in that range.
- **FR-4** Use the gatekeeper's existing matching (same normalisation, whole-word, at least 4 characters) against the **stored issue file**, which is exactly what gets published.
- **FR-5** Skip source names that equal a group, country, region or sector name in that issue; print only how many were skipped.

**Outcomes**
- **FR-6** **Pass:** the issue is published and `breachwire-checked` moves forward.
- **FR-7** **Source unreachable, rate-limited or malformed** (bad JSON, unexpected shape, implausibly few names for the range): Breach Wire is held back. The deploy publishes the rest of the site with the Breach Wire data from `breachwire-checked`, and the derived files (index, feed, statistics) are built from that same data. Slack: "Breach Wire held back: source unreachable" with the issue dates.
- **FR-8** **A name is found:** Breach Wire is held back as in FR-7, the run fails (GitHub also emails the owner), and Slack says which issue and which line of the source list matched, plus a pointer to the removal steps in `SECURITY.md`. The name never appears in logs, Slack, commits or the report.

**Never**
- **FR-9** The source's victim list is kept in memory only: never written to disk, logs, artifacts or the repo.

## 6. Non-functional requirements

- **NFR-1** Python standard library only; HTTPS only; a 20-second timeout per call and at most one call per month needed.
- **NFR-2** The check adds under 1 minute to a deploy on a normal day.
- **NFR-3** The existing gatekeeper check with the bot's list stays as it is (defence in depth).
- **NFR-4** All logic is testable without the network (fixtures).

## 7. Out of scope

- RansomLook as a second source (possible amendment later).
- Checking before the commit. The publisher bot commits directly; an earlier check would need the bot's own environment to reach the source, and the bot is the party we don't trust.
- Rewriting git history automatically. Removing a leaked name from the repo stays a manual owner step (documented in `SECURITY.md`).

## 8. Acceptance criteria

| AC | Criterion |
|---|---|
| **AC-1** | A test issue containing a name that is in the source list (but not in the bot's list) is held back and fails the run; the name appears nowhere in the output |
| **AC-2** | Source unreachable (simulated): the rest of the site deploys, the live Breach Wire data is the last checked data, and the next run with the source back publishes the held issue |
| **AC-3** | A source name equal to a group, country, region or sector in the issue is skipped and counted, not matched |
| **AC-4** | Only issue files changed since `breachwire-checked` are checked; a KEV-only deploy makes no call to the source |
| **AC-5** | A real deploy checks the day's real issue against the real source and passes, in under 1 minute; the report shows the number of names checked |
| **AC-6** | `SECURITY.md` has short, numbered steps for removing a leaked name from the repo |

# Feature spec: Threat Radar

| | |
|---|---|
| **Spec ID** | 001-threat-radar |
| **Status** | Approved by owner 2026-11-06 (all defaults accepted) · Built & verified, see `verification.md` |
| **Owner** | smashytech |
| **Builder** | Claude (spec-driven, hands-off for owner) |
| **Created** | 2026-11-06 |

> This file describes **what** we're building and **why**. It deliberately says
> nothing about code. The **how** lives in `plan.md`, and the step-by-step work
> lives in `tasks.md`.

---

## 1. Summary

Threat Radar is a public website that shows which software vulnerabilities
attackers are **actively exploiting right now**. It is built from the official
CISA Known Exploited Vulnerabilities (KEV) catalog. The site refreshes itself
on a schedule, so nobody ever has to update it by hand.

## 2. Why

- The KEV catalog is the most actionable "patch this first" list in
  cybersecurity. In its raw form, though, it's a large JSON file that humans
  can't easily read.
- This project is also a **spec-driven development (SDD) trial**. The owner
  writes and approves specs. The builder implements against them and proves
  each acceptance criterion is met.

## 3. Who it's for

| User | What they want |
|---|---|
| **Owner** (primary) | Glance at the site to see what's being exploited, learn how the pieces work |
| **Curious visitor** | Understand current threats without reading raw data |

## 4. User stories (priority order)

**P1: See what's new.** As a visitor, I open the site and immediately see
the most recently added exploited vulnerabilities. I can also see how fresh
the data is.

**P1: Trust it's current.** As the owner, I want the site to update itself
at least once a day without me doing anything.

**P2: Find something specific.** As a visitor, I can search by CVE ID,
vendor, product or keyword. I can also narrow results to ransomware-linked
entries or to a time window (7 days / 30 days / 90 days / all).

**P2: See the trends.** As a visitor, I can see how many vulnerabilities were
added each month over the last 12 months. I can also see which vendors appear
most often.

**P3: Dig into one entry.** As a visitor, I can open any entry to read its full
details: description, required action, federal due date, weakness types (CWEs)
and notes. From there I can follow a link to the official NVD page.

## 5. Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | Data comes from the official CISA KEV JSON feed and is fetched automatically **at least once per day**. |
| FR-2 | Fetched data is **validated before publishing**. If the feed is unreachable or malformed, the last good data stays live and the run is visibly marked as failed. Broken or empty data is never published. |
| FR-3 | Processed data is stored **in the repo**, so every change to the catalog shows up in the git history. A commit happens **only when the data actually changed**. |
| FR-4 | The site shows when it was **last checked** and the catalog's own **version and release time**. |
| FR-5 | Summary cards show: total entries, added in the last 7 days, added in the last 30 days, and the number linked to ransomware campaigns. |
| FR-6 | A list shows the latest additions, newest first. It starts with 25 rows and has a "show more" control. |
| FR-7 | Search and filters work as described in the P2 story above. |
| FR-8 | There are two charts: additions per month (last 12 months) and the top 10 vendors (all time). |
| FR-9 | Each entry has a detail view that links to its NVD page. |
| FR-10 | The owner can trigger a refresh manually ("run now") from GitHub. |
| FR-11 | Dependabot keeps the project's GitHub Actions up to date automatically (weekly). |

## 6. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 **Security** | No third-party scripts, CDNs, trackers or cookies. The page loads resources from its own origin only. |
| NFR-2 **Security** | All text from the feed is displayed as plain text, never interpreted as HTML (prevents injection/XSS). |
| NFR-3 **Security** | The automation runs with the minimum permissions it needs, and third-party actions are pinned. |
| NFR-4 **Cost** | $0. Free GitHub tier, public repo, no API keys, no servers. |
| NFR-5 **Speed** | The total page download, including data, is under 1 MB compressed. |
| NFR-6 **Devices** | The site works from phone width (360 px) up to desktop with no sideways scrolling. |
| NFR-7 **Accessibility** | The site is usable by keyboard alone and readable in both light and dark system themes. |

## 7. Out of scope for v1

- Watching a personal software list and sending alerts. This would be a future spec, 002.
- Enrichment with EPSS exploit-probability scores or CVSS severity.
- Email/Slack notifications.
- Custom domain name.

## 8. Acceptance criteria

The build is "done" only when every box below can be ticked with evidence.

- [ ] **AC-1** When the workflow runs, the data files update and the site is live at `https://<username>.github.io/threat-radar/`.
- [ ] **AC-2** If the feed returns invalid JSON or entries are missing required fields, the run fails **and** the published data is unchanged.
- [ ] **AC-3** If the feed content hasn't changed, no new commit is created.
- [ ] **AC-4** The numbers on the summary cards match an independent recount of the data (automated test).
- [ ] **AC-5** Searching `CVE-2021-44228` shows the Log4j entry. Searching a vendor (e.g. `Microsoft`) shows only that vendor's entries.
- [ ] **AC-6** A feed entry whose description contains `<script>` is shown as literal text and does not run (automated test with a booby-trapped sample).
- [ ] **AC-7** The page's security policy blocks requests to any domain other than its own.
- [ ] **AC-8** At 360 px width, the page has no horizontal scroll.
- [ ] **AC-9** The workflow has a schedule (at least daily) and a manual "run now" trigger.
- [ ] **AC-10** A Dependabot config watching GitHub Actions is present.

## 9. Decisions (owner accepted all defaults on 2026-11-06)

1. **Repo name**: **`threat-radar`**
2. **Refresh frequency**: **twice a day**
3. **Look and feel**: **dark "radar" theme with a light-mode variant**
4. **Delivery**: **Claude pushes the code to the owner's repo directly.** The fallback is a zip the owner uploads.

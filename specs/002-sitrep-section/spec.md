# Feature spec: Cyber Sitrep section

| | |
|---|---|
| **Spec ID** | 002-sitrep-section |
| **Status** | Draft, awaiting owner review |
| **Owner** | smashytech |
| **Builds on** | [001-threat-radar](../001-threat-radar/spec.md) |
| **Created** | 2026-11-06 |

---

## 1. Summary

Every weekday morning a scheduled task emails the **📰 Cyber Sitrep**, a
prioritised bulletin of the last 24–48 hours in cybersecurity. This feature
publishes each issue on Threat Radar as well, as a **Sitrep sub-page with an
archive**, plus a **teaser of the latest issue on the homepage**. CVEs mentioned
in the Sitrep are **connected to the KEV data**: if a CVE is being actively
exploited, it gets a badge linking straight to its Radar entry.

## 2. Why

- The Sitrep currently lives only in two inboxes. On the site it becomes
  browsable, linkable and shareable, with a history.
- News and exploit data reinforce each other. "This CVE is in today's news
  **and** in CISA's exploited list" is a stronger signal than either alone.

## 3. Decisions already made (owner, 2026-11-06)

| Question | Decision |
|---|---|
| Which daily send | **Cyber Sitrep** (not Breach Wire) |
| Email | **Keeps going out unchanged**; the site gets a copy |
| Placement | **Sub-page `/sitrep/` with archive + teaser on the homepage** |
| Public? | **Yes.** It summarises public sources only |

## 4. User stories

**P1: Read today's Sitrep on the web.** As a visitor, I open `/sitrep/` and see
today's issue: TL;DR, emerging threats, the top items with sources and dates,
and whether action is needed.

**P1: Hands-off publishing.** As the owner, I never publish anything manually.
Each weekday's issue appears on the site shortly after the email goes out.

**P2: See it from the homepage.** As a visitor on the Radar, I see the latest
Sitrep's date and TL;DR, with a link to the full issue.

**P2: Exploited-CVE connection.** As a visitor, when a Sitrep item mentions a CVE
that's in the KEV catalog, I see an "In KEV" badge. Clicking it opens that CVE's
detail on the Radar.

**P3: Browse past issues.** As a visitor, I can open any earlier issue from an
archive list, and share a direct link to a specific day.

## 5. Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | Each weekday's Sitrep is published to the site automatically, after the email is sent, with no human step. |
| FR-2 | The published issue contains the same TL;DR, emerging threats, items (title, description, source name, link, date where given) and action text as the email. |
| FR-3 | Only Sitrep emails **sent from the owner's own Gmail account** are published. Anything else is ignored. |
| FR-4 | Issue data is **validated before it is committed**. Invalid data is refused, nothing is committed, and the owner gets a push notification. |
| FR-5 | Publishing the same day twice changes nothing (idempotent). Days missed within the last 3 days are caught up automatically. |
| FR-6 | `/sitrep/` shows the latest issue by default; `/sitrep/?d=YYYY-MM-DD` shows a specific issue; an archive lists all issues, newest first. |
| FR-7 | The homepage shows a teaser of the latest issue. If no issues exist yet, the teaser is hidden and nothing else breaks. |
| FR-8 | CVE IDs in items are detected automatically. Those in the current KEV data get an "In KEV" badge linking to `/#CVE-…`, which opens that entry's detail on the Radar. |
| FR-9 | The existing email task is **not modified**. |

## 6. Non-functional requirements

All of spec 001's NFRs carry over (no third-party code, text never becomes HTML,
least privilege, $0, phone to desktop, keyboard + both themes). In addition:

| ID | Requirement |
|---|---|
| NFR-8 **Untrusted input** | Issue content was written by an AI from web sources, so it is treated as untrusted. It goes through strict schema validation, gets https-only links and length limits, and is rendered as text only. |
| NFR-9 **No coupling to failure** | A failed or skipped publish never affects the email, the KEV refresh or the existing site. |

## 7. Out of scope (v2)

- Breach Wire on the site
- Search across past Sitreps, RSS feed
- Changing the email's content or format

## 8. Acceptance criteria

- [ ] **AC-1** After a weekday Sitrep email is sent, the same issue appears at `/threat-radar/sitrep/` with no human action.
- [ ] **AC-2** The page shows TL;DR, emerging threats, every item (title, description, source link) and the action text, matching the email.
- [ ] **AC-3** `/sitrep/?d=<date>` opens that issue. An unknown or malformed date shows a friendly message and the archive. The archive lists every published issue.
- [ ] **AC-4** The homepage teaser shows the latest issue's date, TL;DR and a link. With no issues, the teaser is hidden and the Radar still works.
- [ ] **AC-5** A CVE that's in KEV shows an "In KEV" badge linking to `/#CVE-…`, and opening that link shows the CVE's detail. CVEs not in KEV show no badge.
- [ ] **AC-6** Invalid issue data (bad JSON, missing fields, non-https link, oversized text, unknown fields, bad date) is refused, with nothing written (automated tests).
- [ ] **AC-7** A booby-trapped issue (`<script>` in text, `javascript:` link) renders as literal text, and the link is refused (automated test + browser check).
- [ ] **AC-8** Publishing an already-published issue again produces byte-identical files, so there's no commit (automated test).
- [ ] **AC-9** The publisher only reads Sitrep emails sent from the owner's account (verified in the task definition and the first live run).
- [ ] **AC-10** The existing "Daily cybersecurity bulletin" task is unchanged.
- [ ] **AC-11** At 360 px the Sitrep page has no horizontal scroll, the same strict CSP applies, and there are 0 external requests.

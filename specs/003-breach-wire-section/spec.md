# Feature spec: Breach Wire (ransomware) section

| | |
|---|---|
| **Spec ID** | 003-breach-wire-section |
| **Status** | Approved by owner 2026-11-06 · Built, live and verified, see `verification.md` |
| **Owner** | smashytech |
| **Builds on** | [001](../001-threat-radar/spec.md), [002](../002-sitrep-section/spec.md) (same publishing pattern) |
| **Created** | 2026-11-06 |

---

## 1. Summary

Every day a scheduled task emails **💥 Breach Wire**, a digest of ransomware and
extortion leak-site postings from the previous UTC day. This feature adds a
**Ransomware** section to Threat Radar that mirrors each issue as **statistics
and threat-group intelligence, never victim names**. It also connects to the
Radar by listing the KEV vulnerabilities known to be used in ransomware campaigns.

## 2. Why

- It shows the shape of the extortion economy day by day: how many victims, where,
  which sectors, which groups are active, and whether Sweden was hit.
- Victim names come from criminals' leak sites and are unverified claims. They
  stay in the owner's private email. The public page shows patterns, not targets.

## 3. Decisions already made (owner, 2026-11-06)

| Question | Decision |
|---|---|
| Victim names on the public page | **No.** Stats, groups, Sweden status and data quality only |
| Email | **Unchanged** (same as spec 002) |
| Publishing schedule | **Daily, 10:00 CET** (09:00 UTC, about 2.5 h after the email) |
| Navigation | Third button: **Radar · Sitrep · Ransomware** |

## 4. User stories

**P1: Today's ransomware picture.** As a visitor, I open `/ransomware/` and see the
latest issue: claimed victims, active groups, countries and regions hit, and a
clear statement of whether any Swedish organisation was claimed.

**P1: Hands-off.** As the owner, each day's issue appears on the site without me
doing anything, including big days that arrive as several email parts or a
corrected resend.

**P2: Who is doing it.** As a visitor, I can read the threat-actor ledger: each
active group, its number of postings, a short profile, and the countries and sectors it hit.

**P2: Where and which sectors.** As a visitor, I see claimed victims by region and
country, and by sector.

**P2: Can I trust the numbers?** As a visitor, I see the data-quality summary:
how many claims were single-sourced or had no evidence, the source health, and
the reconciliation.

**P2: Connection to the Radar.** As a visitor, I see the KEV vulnerabilities most
recently confirmed as used by ransomware, each linking to its Radar entry.

**P3: History.** As a visitor, I can browse past issues and see claimed victims per day over time.

## 5. Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | Each Breach Wire issue is published automatically after it's emailed. Days missed in the last 3 days are caught up. |
| FR-2 | **No victim organisation name is ever written to the repository or shown on the site.** A per-run list of that issue's victim names is checked by the gatekeeper, and any match refuses the whole issue. |
| FR-3 | The page shows the issue's headline stats, Sweden status, regions and countries with counts, sectors with counts, the threat-actor ledger, data quality and run health. |
| FR-4 | The numbers must add up. The gatekeeper refuses an issue whose country counts, sector counts or group postings don't sum to the victim total, or whose reconciliation (victims + masked + reposts + non-victims = merged) fails. |
| FR-5 | Multi-part issues are combined; when a "(corrected)" resend exists, it replaces the original. |
| FR-6 | Only Breach Wire emails sent from the owner's own account are used. |
| FR-7 | `/ransomware/?d=YYYY-MM-DD` opens a specific issue; an archive lists all issues with a victims-per-day chart. |
| FR-8 | A "Known ransomware use" panel lists recent KEV entries with `knownRansomwareCampaignUse = Known`, linking to `/#CVE-…`. |
| FR-9 | The Radar homepage gets a Breach Wire teaser next to the Sitrep teaser, plus the third nav button on all pages. |
| FR-10 | The existing Breach Wire email task is not modified. |

## 6. Non-functional requirements

Spec 001 and 002 NFRs carry over (untrusted input, text-only rendering, strict
CSP, no third-party code, $0, 360 px to desktop, failures never affect the email
or the rest of the site).

## 7. Out of scope

- Victim-level detail of any kind (names, domains, data types, ransom notes)
- Links to leak sites or aggregator victim pages
- Changing the email

## 8. Acceptance criteria

- [x] **AC-1** A Breach Wire issue appears at `/threat-radar/ransomware/` with no human action (live publisher run).
- [x] **AC-2** The page shows stats, Sweden status, regions/countries, sectors, ledger and data quality, matching the email's numbers.
- [x] **AC-3** No victim names: the issue format has no field for them; an issue containing any name from the victim list is refused (tests); published files contain none of the email's victim names (live check).
- [x] **AC-4** Inconsistent numbers are refused: country sum, sector sum, group postings, reconciliation, Sweden count (tests).
- [x] **AC-5** A multi-part / corrected issue is published correctly (live catch-up of the 5 Nov issue, which arrived as 4 parts plus a correction).
- [x] **AC-6** Invalid data is refused and nothing is written (tests).
- [x] **AC-7** Hostile text renders as literal text (test + browser).
- [x] **AC-8** Republishing the same issue changes nothing (test).
- [x] **AC-9** Only the owner's own sent Breach Wire emails are used.
- [x] **AC-10** The Breach Wire email task is unchanged.
- [x] **AC-11** The "Known ransomware use" panel lists KEV entries linking to the Radar; the homepage teaser links to the page.
- [x] **AC-12** `?d=` and archive behave like the Sitrep (bad dates get a friendly message, no stray file requests).
- [x] **AC-13** 360 px with no horizontal scroll, strict CSP, 0 external requests.

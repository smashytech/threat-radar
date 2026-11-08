# Feature spec: My stack

| | |
|---|---|
| **Spec ID** | 004-my-stack |
| **Status** | Draft, awaiting owner review |
| **Owner** | smashytech |
| **Builds on** | [001](../001-threat-radar/spec.md), [002](../002-sitrep-section/spec.md), [003](../003-breach-wire-section/spec.md) |
| **Created** | 2026-11-08 |

---

## 1. Summary

Visitors can **tick the vendors and products they use**. Threat Radar then
highlights what affects *their* stack on every page: exploited vulnerabilities
on the Radar, news on the Sitrep, and ransomware-linked vulnerabilities on the
Ransomware page. The stack is stored **only in the visitor's own browser**.

## 2. Why

- Out of 1,769 exploited vulnerabilities, most visitors care about the handful
  that touch software they run. "Is anything in *my* stack being exploited right
  now?" is the question that turns the site from interesting into useful.
- Keeping the stack in the browser means no accounts, no server and no tracking.
  It also means a visitor's software list (useful reconnaissance for an attacker)
  is never published or collected.

## 3. Decisions already made (owner, 2026-11-08)

| Question | Decision |
|---|---|
| Scope | **Ticks on the site only.** Email alerts are a possible later spec |
| What can be ticked | **Vendors, optionally narrowed to specific products** |
| Where the stack lives | **Only in the visitor's browser** (plus an optional share link) |

## 4. User stories

**P1: Pick my stack.** As a visitor, I open a "My stack" picker, search for
vendors or products, tick a vendor (all its products), or narrow it to the
products I actually run.

**P1: See what affects me on the Radar.** As a visitor with a stack, I can
filter the list to "My stack only". Entries in my stack carry a "Your stack"
badge, and a summary tells me how many are in my stack, how many were added in
the last 30 days, and how many are **new since my last visit**.

**P2: See it on the other pages.** On the Sitrep, CVE chips in my stack are
tagged, and news items that mention a ticked vendor are tagged "Mentions
<vendor>". On the Ransomware page, KEV entries in my stack are highlighted in
the "Known ransomware use" panel.

**P2: Use the same stack on another device.** I can copy a link that carries my
stack. Opening it elsewhere *offers* to load that stack; it never silently
replaces one.

**P3: Find renamed vendors.** Searching "vmware" also finds VMware products
that CISA now lists under Broadcom.

## 5. Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | The picker lists every vendor in the current KEV catalog with its entry count. Each vendor expands to its products with counts. |
| FR-2 | Search matches vendor **and** product names, case-insensitively. |
| FR-3 | A vendor can be ticked as "all products" or narrowed to a set of products. |
| FR-4 | The stack is saved in the browser and survives reloads. If browser storage is unavailable (e.g. some private modes), the feature still works for that visit without errors. |
| FR-5 | **No stack data ever leaves the browser:** not in requests, not in cookies, not in the page address sent to the server. |
| FR-6 | Radar: "My stack only" filter, "Your stack" badge, stack summary (in catalog / last 30 days / new since last visit), radar blips in the stack highlighted. |
| FR-7 | Sitrep: KEV CVE chips in the stack tagged; items mentioning a ticked vendor (whole word) tagged. |
| FR-8 | Ransomware page: stack entries highlighted in the KEV panel, with a count of the stack's ransomware-linked entries. |
| FR-9 | Share link: the stack goes after `#` in the address (never sent to the server). Opening it shows an in-page offer, "Use this stack" / "Ignore". |
| FR-10 | Stored or shared stack data is validated. Malformed, oversized or hostile data is ignored, never rendered as HTML, and never breaks the page. |
| FR-11 | Vendors or products in a stack that are no longer in the catalog are kept and shown as "not in the current catalog", not silently dropped. |
| FR-12 | Without a stack, nothing changes except a small "Tick your stack" prompt. |

## 6. Non-functional requirements

All earlier NFRs carry over: strict CSP, no third-party code, text-only
rendering, $0, 360 px to desktop, keyboard and screen-reader usable, both themes.
The footer states: "Your stack is saved only in this browser."

## 7. Out of scope

- Email or push alerts (a later spec, with the watchlist kept private in a scheduled task, never in the public repo)
- Accounts or cross-device sync beyond the share link
- Version-level matching ("Windows 11 23H2"), because KEV doesn't carry versions

## 8. Acceptance criteria

- [ ] **AC-1** The picker lists all vendors (291 today) with counts; vendors expand to products with counts.
- [ ] **AC-2** Searching "vmware" finds Broadcom's VMware products; searching a product name finds its vendor.
- [ ] **AC-3** Matching is correct for vendor-all, product subsets and unknown names (tests).
- [ ] **AC-4** The stack survives a reload; with storage blocked, the page works with no errors (browser test).
- [ ] **AC-5** After ticking and reloading, no network request and no cookie contains stack data (browser test).
- [ ] **AC-6** Radar shows the filter, badges, summary (incl. "new since last visit") and highlighted blips.
- [ ] **AC-7** Sitrep tags in-stack KEV CVEs and vendor mentions; the Ransomware KEV panel highlights stack entries.
- [ ] **AC-8** A share link opened in a fresh browser offers the stack and applies it only after "Use this stack".
- [ ] **AC-9** Hostile or malformed stored and shared data (bad JSON, huge lists, markup in names) is ignored safely (tests + browser).
- [ ] **AC-10** 360 px without horizontal scroll, keyboard-only use of the picker, strict CSP unchanged, 0 external requests, all existing tests still pass.

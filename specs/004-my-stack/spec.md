# Feature spec: My stack

| | |
|---|---|
| **Spec ID** | 004-my-stack |
| **Status** | Draft v2 (presets added), awaiting owner review |
| **Owner** | smashytech |
| **Builds on** | [001](../001-threat-radar/spec.md), [002](../002-sitrep-section/spec.md), [003](../003-breach-wire-section/spec.md) |
| **Created** | 2026-11-08 |

---

## 1. Summary

Visitors can **tick the vendors and products they use**. Threat Radar then
highlights what affects *their* stack on every page: exploited vulnerabilities
on the Radar, news on the Sitrep, and ransomware-linked vulnerabilities on the
Ransomware page. Visitors can keep **several named presets** (for example
"Work", "Home lab", "Customer A") and choose with a **"Remember on this device"
tickbox** whether they're kept for their next visit. Everything stays **in the
visitor's own browser**.

## 2. Why

- Out of 1,769 exploited vulnerabilities, most visitors care about the handful
  that touch software they run. "Is anything in *my* stack being exploited right
  now?" is the question that turns the site from interesting into useful.
- People often look after more than one environment. Named presets make
  switching between them one click.
- A visible tickbox keeps the visitor in control. Nothing is stored on their
  device unless they ask for it, and on a shared computer they can leave it off.
- Keeping stacks in the browser means no accounts, no server and no tracking. A
  visitor's software list (useful reconnaissance for an attacker) is never
  published or collected.

## 3. Decisions

| Question | Decision | By |
|---|---|---|
| Scope | **Ticks on the site only.** Email alerts are a possible later spec | Owner, 2026-11-08 |
| What can be ticked | **Vendors, optionally narrowed to specific products** | Owner |
| Where data lives | **Only in the visitor's browser** (plus an optional share link) | Owner |
| Saving | **Named presets + a "Remember on this device" tickbox** | Owner |
| What a preset brings back | **The stack + the "My stack only" view** | Owner |
| Remember tickbox default | **Off** until the visitor ticks it, so nothing is stored without asking | Builder proposal, owner may overrule |
| Opening a share link | **Adds a new preset** ("Shared stack"); never replaces an existing one | Builder proposal, owner may overrule |

## 4. User stories

**P1: Pick my stack.** As a visitor, I open the "My stack" picker, search for
vendors or products, tick a vendor (all its products), or narrow it to the
products I actually run.

**P1: Come back to it.** As a visitor, I tick "Remember on this device" once.
Next time I open Threat Radar, my active preset is already applied, including
the "My stack only" view if I left it on.

**P1: See what affects me on the Radar.** As a visitor with a stack, I can
filter the list to "My stack only". Entries in my stack carry a "Your stack"
badge, and a summary tells me how many are in my stack, how many were added in
the last 30 days, and (when remembered) how many are **new since my last visit**.

**P2: Several presets.** As a visitor, I can save the current stack under a new
name, switch between presets, rename them and delete them. Each preset keeps its
own stack and its own "My stack only" setting.

**P2: Shared or work computer.** As a visitor, I leave "Remember" unticked and my
stack is gone when I close the tab. Unticking it later immediately removes what
was stored. "Forget everything on this device" wipes all Threat Radar data from
this browser.

**P2: See it on the other pages.** On the Sitrep, CVE chips in my stack are
tagged, and news items that mention a ticked vendor are tagged "Mentions
<vendor>". On the Ransomware page, KEV entries in my stack are highlighted in
the "Known ransomware use" panel.

**P2: Use a preset on another device.** I can copy a link that carries my active
preset's stack. Opening it elsewhere *offers* to add it as a new preset; it
never replaces one.

**P3: Find renamed vendors.** Searching "vmware" also finds VMware products
that CISA now lists under Broadcom.

## 5. Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | The picker lists every vendor in the current KEV catalog with its entry count. Each vendor expands to its products with counts. |
| FR-2 | Search matches vendor **and** product names, case-insensitively. |
| FR-3 | A vendor can be ticked as "all products" or narrowed to a set of products. |
| FR-4 | **Remember tickbox.** When ticked, presets, the active preset and the last-visit date are kept in `localStorage` (until cleared). When unticked (the default), they live in `sessionStorage` only and disappear when the tab closes. Unticking deletes anything previously stored in `localStorage` immediately. |
| FR-5 | **Presets.** Visitors can create ("Save as…"), switch, rename and delete presets. There is always at least one preset (default name "My stack"). Names are 1–40 characters and unique, with up to 20 presets. Each preset stores its stack and its "My stack only" setting. |
| FR-6 | On page load, the active preset's stack and "My stack only" view are applied. |
| FR-7 | **"Forget everything on this device"** removes every Threat Radar key from both storages. |
| FR-8 | **No stack data ever leaves the browser:** not in requests, not in cookies, not in the page address sent to the server. |
| FR-9 | If browser storage is unavailable (e.g. some private modes), the feature works in memory for that visit, the tickbox explains that remembering isn't available, and there are no errors. |
| FR-10 | Radar: "My stack only" filter, "Your stack" badge, stack summary (in catalog / last 30 days / new since last visit, the last only when remembered), matching radar blips highlighted. |
| FR-11 | Sitrep: KEV CVE chips in the stack tagged; items mentioning a ticked vendor (whole word) tagged "Mentions <vendor>". |
| FR-12 | Ransomware page: stack entries highlighted in the KEV panel, with a count of the stack's ransomware-linked entries. |
| FR-13 | Share link: the active preset's stack goes after `#` in the address (never sent to the server). Opening it shows an in-page offer, "Add as preset" / "Ignore"; accepting adds a new preset named "Shared stack" (numbered if taken). |
| FR-14 | Stored or shared data is validated. Malformed, oversized or hostile data is ignored, never rendered as HTML, and never breaks the page. |
| FR-15 | Vendors or products that are no longer in the catalog are kept and shown as "not in the current catalog", not silently dropped. |
| FR-16 | Without a stack, nothing changes except a small "Tick your stack" prompt. |

## 6. Non-functional requirements

All earlier NFRs carry over: strict CSP, no third-party code, text-only
rendering, $0, 360 px to desktop, keyboard and screen-reader usable, both themes.
The footer states: "Your stack is kept only in this browser, and only if you tick Remember."

## 7. Out of scope

- Email or push alerts (a later spec, with the watchlist kept private in a scheduled task, never in the public repo)
- Accounts or cross-device sync beyond the share link
- Remembering other Radar filters (time window, ransomware-only, vendor dropdown)
- Version-level matching ("Windows 11 23H2"), because KEV doesn't carry versions

## 8. Acceptance criteria

- [ ] **AC-1** The picker lists all vendors (291 today) with counts; vendors expand to products with counts.
- [ ] **AC-2** Searching "vmware" finds Broadcom's VMware products; searching a product name finds its vendor.
- [ ] **AC-3** Matching is correct for vendor-all, product subsets and unknown names (tests).
- [ ] **AC-4** With **Remember ticked**, the active preset, its stack and its "My stack only" view are back after closing and reopening the browser tab. With it **unticked**, `localStorage` holds no Threat Radar data and the stack is gone in a new tab. Unticking removes stored data at once (browser test).
- [ ] **AC-5** Presets can be created, switched, renamed and deleted; each keeps its own stack and view; duplicate or empty names are refused; the last preset can't be deleted (tests + browser).
- [ ] **AC-6** "Forget everything on this device" leaves no Threat Radar keys in either storage (browser test).
- [ ] **AC-7** With storage blocked, the page works with no errors and the tickbox says remembering isn't available (browser test).
- [ ] **AC-8** After ticking and reloading, no network request and no cookie contains stack data (browser test).
- [ ] **AC-9** Radar shows the filter, badges, summary (incl. "new since last visit" when remembered) and highlighted blips.
- [ ] **AC-10** Sitrep tags in-stack KEV CVEs and vendor mentions; the Ransomware KEV panel highlights stack entries.
- [ ] **AC-11** A share link opened in a fresh browser offers to add the stack as a new preset; nothing changes until "Add as preset" is clicked, and existing presets are never overwritten.
- [ ] **AC-12** Hostile or malformed stored and shared data (bad JSON, huge lists, too many presets, markup in names) is ignored safely (tests + browser).
- [ ] **AC-13** 360 px without horizontal scroll, keyboard-only use of the picker and preset controls, strict CSP unchanged, 0 external requests, all existing tests still pass.

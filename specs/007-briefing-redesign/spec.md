# Feature spec: Morning-briefing redesign with dark mode

| | |
|---|---|
| **Spec ID** | 007-briefing-redesign |
| **Status** | Approved v1 (owner: "gooo", 2026-11-17). Built and verified |
| **Owner** | smashytech |
| **Builds on** | [001](../001-threat-radar/spec.md) – [006](../006-vendor-period/spec.md) |
| **Created** | 2026-11-17 |
| **Mockup** | Design canvas "Threat Radar redesign", artboard **B · Morning briefing** |

---

## 1. Summary

The site gets a modern look based on mockup B:

- **A new front page, "Today"**: one briefing that answers "what do I need to know this morning?" It has a headline, four key numbers, three columns (Newly exploited · Sitrep highlights · Breach Wire) and the monthly trend.
- **The current Radar page moves to `/exploited/`** unchanged in function: search, filters, charts, the live radar and My stack. Old links keep working.
- **One new look on every page** (Today, Exploited, Sitrep, Breaches, Feeds): a clean, light-first style with modern fonts, cards and clear hierarchy.
- **Dark mode** on every page: it follows the device setting, and a toggle in the header overrides it and is remembered.

## 2. Why

- The current green-on-black "radar screen" style reads as retro. The owner wants it to look modern.
- Most visits are a quick morning check. A briefing up front serves that better than a database view.
- A light theme is easier to read in daylight and to share with non-technical people. The dark mode keeps the old feel available to those who prefer it.

## 3. Decisions

Owner's answers (2026-11-17):

| Question | Answer |
|---|---|
| Direction | Mockup B, "Morning briefing" |
| Dark mode | Follows the device setting; the toggle overrides it and is remembered in the browser |
| Front page | "Today" briefing at `zelin.se`; the full list moves to a new **Exploited** page |
| Scope | All pages at once |
| Radar graphic | Small radar logo in every header; the live radar stays at the top of the Exploited page |

Builder proposals (the owner can change any of these before "go"):

| Proposal | Why |
|---|---|
| **Headline written automatically**: the first sentence of today's Sitrep summary; below it, a line built from the catalog ("CISA added 2 exploited flaws this week: Check Point, UnrealIRCd") | Works every day without extra writing. A short hand-written headline from the Sitrep publisher can be added later |
| **Sitrep highlights** = the titles of the first three Sitrep items | The data has no categories like "BREACH"; inventing them would be guessing |
| **Fonts stored on the site**, not loaded from Google: Inter (text), Space Grotesk (headings), JetBrains Mono (codes and dates), fetched once by a small GitHub workflow at fixed versions and committed with their licence (SIL Open Font License) | The site's security policy only allows files from zelin.se, and visitors' browsers then never contact Google |
| Theme choice stored under one key in the browser (`threat-radar.theme.v1`); if storage is blocked, the toggle still works for that page view | Same approach as My stack |
| A tiny theme script in each page's `<head>` sets the theme **before the page is drawn** | Avoids a white flash when a dark-mode visitor opens a page |
| Navigation: **Today · Exploited · Sitrep · Breaches · Feeds**, plus the theme toggle | Feeds becomes a first-class page instead of only a footer link |

## 4. User stories

1. As a **visitor in the morning**, I open zelin.se and within 10 seconds know the day's main threat, how many new exploited flaws there are, and whether Sweden was hit.
2. As a **visitor who prefers dark screens**, I tap the moon once and every page stays dark on my next visit.
3. As a **visitor with an old link** (`zelin.se/#CVE-2026-…` from a feed, Slack alert or bookmark), I land on that entry on the Exploited page.
4. As a **visitor with My stack**, the Today page tells me how many of this week's new entries hit my stack.
5. As the **owner**, nothing about the data, feeds, alerts or privacy rules changes.

## 5. Functional requirements

**Today page (`/`)**
- **FR-1** Header line: today's date and "Briefing". Headline: the first sentence of the latest Sitrep's summary (cut at 160 characters at a word boundary). Sub-line built from the catalog: new exploited flaws in the last 7 days and up to three vendor names, or "No new exploited flaws this week". Two buttons: "Read today's Sitrep" and "Check my stack".
- **FR-2** Four key numbers: new exploited (7 days), last 30 days, ransomware claims in the latest Breach Wire, Swedish victims claimed in it.
- **FR-3** Three columns:
  - Newly exploited: the 4 newest entries, each with its due date, marked "Overdue" when the date has passed.
  - Sitrep highlights: the first 3 item titles, linking to the Sitrep.
  - Breach Wire: victims, countries and groups as bars, plus the Sweden status. **Never victim names.**
- **FR-4** Monthly trend chart (last 12 months, the busiest month and the current month highlighted).
- **FR-5** With a stack: a line "Your stack: N of this week's new entries" linking to the Exploited page filtered to the stack.
- **FR-6** Missing data degrades gracefully: no Sitrep today → "No Sitrep yet today" with a link to the latest; no Breach Wire → that column says so.

**Exploited page (`/exploited/`)**
- **FR-7** Everything the current Radar page does, unchanged in behaviour: live radar, stats, trends with the period switch (spec 006), search, filters, list, details, My stack, share links.
- **FR-8** **Old links keep working**: `zelin.se/#CVE-…`, `#mystack` and `#stack=…` on the Today page forward to the same hash on the Exploited page.
- **FR-9** Feed entry links and Slack alert links point to `/exploited/#CVE-…`. Feed entry IDs do **not** change, so feed readers don't show old items again.

**Every page**
- **FR-10** New shared header (logo, navigation, theme toggle) and footer (sources, Feeds, GitHub, coffee line).
- **FR-11** **Theme**: no stored choice → follow the device. The toggle switches light ↔ dark, stores the choice, and is a real button with `aria-pressed` and a label that says what it does.
- **FR-12** Both themes meet **WCAG AA contrast** (4.5:1 text, 3:1 large text and UI parts) for every text/background pair in the palette.
- **FR-13** Dates and numbers stay English (spec 005's `SITE_LOCALE`).

## 6. Non-functional requirements

- **NFR-1** Content Security Policy unchanged (`default-src 'self'`); no inline scripts or styles; no third-party requests (fonts included).
- **NFR-2** Works at 360 px with no horizontal scroll; keyboard-usable; visible focus in both themes; respects reduced motion.
- **NFR-3** No flash of the wrong theme on load.
- **NFR-4** All existing tests keep passing; vanilla JS, no framework, no build step.
- **NFR-5** Font files total under 400 KB and load with `font-display: swap`, so text shows immediately.

## 7. Out of scope

- New data sources (see the earlier brainstorm), Swedish translation, a paid tier.
- Changing the Sitrep or Breach Wire publishers (a short hand-written headline could come later).

## 8. Acceptance criteria

| AC | Criterion |
|---|---|
| **AC-1** | The Today page shows the date, headline, sub-line, four numbers, three columns and trend, all from the live data, with the right figures |
| **AC-2** | Headline: built from the Sitrep summary's first sentence, cut at 160 characters at a word boundary; the sub-line handles 0, 1, 2 and 4+ new entries |
| **AC-3** | Missing Sitrep / Breach Wire / stack: the page still renders with a clear message, no errors |
| **AC-4** | The Breach Wire column and the whole Today page contain no victim names (built only from the allow-listed index fields) |
| **AC-5** | The Exploited page passes every existing Radar test and spec 004 and 006 browser checks at its new address |
| **AC-6** | `/#CVE-2026-123039`, `/#mystack` and `/#stack=…` forward to the Exploited page with the same hash; feed and Slack links point to `/exploited/`; feed IDs unchanged |
| **AC-7** | Theme: device dark → dark; device light → light; toggle switches and is remembered across pages and reloads; blocked storage → toggle still works; no flash of the other theme on load |
| **AC-8** | Every palette text pair passes WCAG AA in both themes (automated test) |
| **AC-9** | All five pages: 360 px without horizontal scroll, keyboard navigation with visible focus, 0 external requests, CSP unchanged |
| **AC-10** | Fonts served from zelin.se with their licence file; total under 400 KB |
| **AC-11** | *(Added 2026-11-18, owner's request.)* Each "Overdue" tag on Today has a small (i) that explains CISA's deadline on hover, keyboard focus and tap; Escape or a tap elsewhere closes it; tapping it never opens the entry |

# Amendments: Breach statistics over time (spec 010)

Small changes to the areas spec 010 owns: the Trends section and the sector and
group rules. Format: request, decision, acceptance check, verification.

## A1 · Trends in its own tab on the Breaches page (2026-11-25)

- **Request:** "should this maybe be a separate tab under breaches instead? like you have the main breaches, and then a tab with stats?" Owner chose option A (tabs on the same page) over a separate page.
- **Decision:**
  - Two tabs under the page heading: **"Today's issue"** (default) and **"Trends"**.
  - `zelin.se/ransomware/#trends` (since 003 A1: `/breaches/#trends`) opens straight to Trends; switching tabs updates the address, so the link can be shared and the back button works.
  - The archive sidebar and "Known ransomware use" belong to "Today's issue"; Trends uses the full width.
  - The statistics are fetched the first time Trends is opened, so the issue is never delayed (replaces "loads after the issue", NFR-3).
  - Standard tabs for keyboard and screen readers: one tab stop, arrow keys / Home / End switch tabs.
- **Check:** both tabs work with mouse and keyboard; `#trends` opens to Trends; no statistics request until Trends is opened; spec 010's browser check passes on the Trends tab; 360 px, both themes.
- **Verified:** 2026-11-25, spec 010 browser check 19/19, including 7 new tab checks: default tab fetches no statistics; clicking Trends fetches them once and sets `#trends`; back button; arrow keys and Home; one tab stop; `#trends` opens full width without the sidebar; a missing statistics file shows "No statistics yet." Screenshots: [desktop, light](evidence/tabs-desktop-light.png) · [phone, dark](evidence/tabs-phone-dark.png).

# Feature spec: Social previews and a faster Today page

| | |
|---|---|
| **Spec ID** | 009-previews-and-speed |
| **Status** | Approved v1 (owner: "yes" to the web-check fixes we can make in the site, 2026-11-24). Built and verified |
| **Owner** | smashytech |
| **Builds on** | [007](../007-briefing-redesign/spec.md), [008](../008-security-hardening/spec.md) |
| **Created** | 2026-11-24 |

## 1. Why

A web-check scan (2026-11-24) flagged 17 items. Most are response headers GitHub Pages can't send (a separate decision: a CDN such as Cloudflare). Two are ours to fix:

- **Performance score 69.** Measured with Lighthouse-like mobile throttling (150 ms latency, 1.6 Mbit/s, 4× slower CPU): the Today page downloads **1,659 KB**, of which `kev.json` is **1,433 KB (86%)**, and its largest content (the headline) appears after **9.9 s**. The page waits for all data before drawing anything, although the headline comes from the Sitrep, not the catalog.
- **Missing social tags.** A link to zelin.se shared in Slack, LinkedIn or Teams shows no title, description or image.

## 2. Requirements

**Speed**
- **FR-1** The deploy writes `data/kev-recent.json`: entries added in the last **400 days**, with only the fields the Today page uses (`cveID`, `dateAdded`, `dueDate`, `vendorProject`, `product`, `vulnerabilityName`). 400 days covers the 12-month chart plus margin for a deploy that's a day old. Derived like the feeds: built at deploy, never committed.
- **FR-2** The Today page reads `kev-recent.json` instead of `kev.json`, and **draws each part as soon as its own data arrives**: the headline and Sitrep column from the Sitrep, the Breach Wire column from its index, the numbers and lists from the catalog. One slow or missing file never holds up the others.
- **FR-3** Everything shown stays identical (same functions in `today-logic.js`, same numbers).

**Social previews**
- **FR-4** Every page carries Open Graph and Twitter Card tags: title, description, URL, site name, type, and a **1200×630 preview image** (`social-card.png`) with absolute `https://zelin.se/` addresses.
- **FR-5** The tags are written by `scripts/site_chrome.py` (like the header and footer), so they can't drift between pages.
- **FR-6** The preview image is generated from an HTML template in the site's own look (`scripts/social-card.html`, rendered once with the pre-installed browser) and committed with its source.

## 3. Out of scope

Response headers (CSP, HSTS, X-Frame-Options and friends), a firewall, DNSSEC: they need a CDN in front of GitHub Pages, which is the owner's call. OCSP stapling (Let's Encrypt has ended OCSP), PGP-signing `security.txt`, the "Server: GitHub.com" note and the www → apex redirect need no change.

## 4. Acceptance criteria

| AC | Criterion |
|---|---|
| **AC-1** | `build_recent.py` keeps exactly the entries of the last 400 days with only the six fields; deterministic; tested |
| **AC-2** | Under the same mobile throttling, the Today page's largest content appears in **under 2.5 s** and it downloads **under 400 KB** (before: 9.9 s, 1,659 KB) |
| **AC-3** | The Today page shows the same numbers, lists and chart as before (spec 007's browser check passes unchanged) |
| **AC-4** | With the catalog file missing, the headline, Sitrep and Breach Wire columns still render |
| **AC-5** | All five pages have the eight social tags with absolute https addresses; the image is 1200×630 PNG under 300 KB; a test keeps pages in sync |

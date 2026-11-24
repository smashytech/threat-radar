# Amendments: Morning-briefing redesign (spec 007)

Small changes to the areas spec 007 owns: the Today page, the shared header and
footer, page headings and the overall look. Format: request, decision, acceptance
check, verification.

## A1 · "Overdue" explained with an (i) tooltip (2026-11-18)

*Recorded after the fact; also added to the spec as AC-11.*

- **Request:** "can we add like a small (i) … to explain this?"
- **Decision:** an (i) button next to each "Overdue" tag explains CISA's deadline; it opens on hover, keyboard focus and tap; the due tag moved just outside the entry's link (a button inside a link is invalid HTML).
- **Check:** AC-11 in the browser check.
- **Verified:** browser check AC-11 (2026-11-18); since 2026-11-24 the check brings its own overdue entries so it doesn't depend on the day's data.

## A2 · Coffee cup on "buy me a coffee" (2026-11-24)

*Recorded after the fact; first logged in spec 009's "changes during build".*

- **Request:** "add a coffee-symbol to the buy me coffee sentence … so it pops out a little bit".
- **Decision:** a small outline cup in the warm accent colour, as an inline icon rather than an emoji; on the Today page and in every footer; the link in bold.
- **Check:** the cup shows in both places and both themes; no layout shift on phones.
- **Verified:** screenshots in [spec 009 evidence](../009-previews-and-speed/evidence/coffee-line.png); spec 007 browser check 15/15.

## A3 · "Connect with me on LinkedIn" in the footer (2026-11-24)

*Recorded after the fact.*

- **Request:** add "connect with me on LinkedIn" linking to the owner's profile; owner chose the footer.
- **Decision:** its own footer line on every page with "How this site works ↗"; a small outline "in" icon in the link colour; opens in a new tab with `rel="noopener noreferrer"`. Not on the Today page itself (one personal touch there is enough). The owner was told the link ties the site to their name.
- **Check:** present on all five pages via `scripts/site_chrome.py`; correct address, target and rel; no sideways scroll at 360 px.
- **Verified:** browser look (2026-11-24): address, `_blank`, `noopener noreferrer`, 0 px overflow, 0 errors; site-chrome test keeps pages in sync.

## A4 · Page headings follow the menu (2026-11-24)

*Recorded after the fact. Built, then partly reversed the same evening; this
amendment records the final decision.*

- **Request:** "Breach Wire" as the Breaches page heading felt redundant; "Sitrep" in the menu versus "Cyber Sitrep" as the heading felt inconsistent.
- **First build:** headings "Breaches" and "Sitrep".
- **Final decision:** menu labels stay short (`Sitrep`, `Breaches`) because a sixth word doesn't fit a phone menu; page headings may say more. Breaches page heading **"Breaches"**, with "Breach Wire №N" kept in the issue line as the digest's name. Sitrep page heading **"Cyber Sitrep"**. Browser-tab titles and link previews follow the headings.
- **Check:** headings, tab titles and preview titles as above; the issue line names the digest.
- **Verified:** browser look (2026-11-24): "Breaches · Breach Wire №93 · …", "Cyber Sitrep"; spec 005 browser check 10/10.
- **Lesson:** this is why choices with several reasonable answers are settled in writing first (now a rule in `CLAUDE.md`).

## A5 · Phone menu fits at 360 px (2026-11-24)

*Recorded after the fact.*

- **Finding:** on a 360 px phone the menu needed 345 px of 328, so "Feeds" was cut off.
- **Decision:** gaps between menu items on phones 16 px → 11 px.
- **Check:** all five items visible at 360 px and 390 px.
- **Verified:** measured 328 / 328 px at 360 px and 358 / 358 px at 390 px.

# Amendments: Breach Wire section (spec 003)

Small changes to the areas spec 003 owns: the Breaches page and how Breach Wire
issues are published. Format: request, decision, acceptance check, verification.

## A1 · The Breaches page moves to /breaches/ (2026-11-25)

- **Request:** "maybe we should also rename "/ransomware/" to breaches? its not always ransomware". Owner: "go ahead" on the proposal below.
- **Decision:**
  - New address `zelin.se/breaches/` (and `/breaches/#trends`). The page files move from `site/ransomware/` to `site/breaches/`.
  - `/ransomware/` stays **permanently** as a small forwarding page that keeps `?d=` and `#trends` (an external script, so the security policy is unchanged; a plain refresh tag for browsers without JavaScript; a canonical link for search engines).
  - Feed links point to the new address; feed entry IDs (`tag:` URIs) are unchanged, so feed readers don't show old issues as new.
  - Slack, the Today page, the Exploited teaser, the menu and link previews use `/breaches/`.
  - The label above the heading: "Daily ransomware digest" → **"Daily breach and extortion digest"**. "Known ransomware use" keeps its name (CISA's term).
  - Old spec documents stay as written; current docs, the specs index and the browser checks are updated.
  - Supersedes spec 005's note that "the address stays /ransomware/".
- **Check:** `/breaches/` works; `/ransomware/`, `/ransomware/?d=…` and `/ransomware/#trends` land on the same issue or tab under `/breaches/`; feed IDs unchanged; all browser checks pass.
- **Verified:** 2026-11-25. [`forward-check.cjs`](forward-check.cjs) 5/5: `/ransomware/`, `?d=`, `#trends` and both together land on the same issue and tab under `/breaches/`, also without JavaScript. Browser checks of specs 004 (24), 005 (10), 007 (15) and 010 (19) pass on the new address. All Python and Node tests pass; feed entry IDs are unchanged (`tag:` URIs). Spec 009's speed check only had its page list updated and was not re-run.

# Feature spec: First impressions (no-JavaScript note, "page not found" page)

| | |
|---|---|
| **Spec ID** | 014-first-impressions |
| **Status** | Draft v1, waiting for "go" |
| **Owner** | smashytech |
| **Builds on** | [007](../007-briefing-redesign/spec.md) (site look and shared header/footer) |
| **Created** | 2026-11-25 |

---

## 1. Summary

Two gaps found in the readiness check before sharing the site:

1. With JavaScript off, the pages stay on "Loading…" forever and never say why.
2. A mistyped address shows GitHub's generic error page instead of Threat Radar.

It is a feature because it adds a page (the change-size rule), even though it has no data or logic.

## 2. Decisions (proposals; the owner confirms or changes them before "go")

| Question | Proposal | Why |
|---|---|---|
| No-JavaScript note: which pages | Today, Exploited, Sitrep and Breaches (they build their content with JavaScript). Not Feeds: its list of feeds is plain HTML | Only where something is missing |
| Note text | "Threat Radar builds this page with JavaScript, from this site only (no trackers). Turn it on to see it, or follow the same data in a feed reader: Feeds." | Says why, reassures the NoScript crowd, offers a way that needs no JavaScript |
| Where it shows | Right under the page heading, styled like the site's other notices | Seen first, no layout shift for everyone else |
| "Loading…" text without JavaScript | Hidden by the same mechanism, so the note replaces it | No contradictory message |
| Page not found: content | Heading "Page not found", one line ("This address doesn't exist on Threat Radar. It may have moved."), the normal menu and footer, and links to the five pages | Same look as the site; gets visitors back on track |
| Page not found: technique | `404.html` in the site root (GitHub Pages serves it for any missing address). Links and styles use addresses from the site root (`/styles.css`), so it works at any depth. No JavaScript, same security policy, not indexed by search engines | Works everywhere, including without JavaScript |

## 3. Functional requirements

- **FR-1** Today, Exploited, Sitrep and Breaches show the note when JavaScript is off, and never when it's on.
- **FR-2** Without JavaScript, those pages don't show "Loading…".
- **FR-3** `site/404.html` with the shared header and footer, the text in §2 and links to all five pages; it uses root-based addresses and no JavaScript.
- **FR-4** Both use the existing security policy unchanged; the 404 page has `noindex`.

## 4. Acceptance criteria

| AC | Criterion |
|---|---|
| **AC-1** | Browser, JavaScript off: the four pages show the note, no "Loading…"; Feeds is unchanged |
| **AC-2** | Browser, JavaScript on: no note anywhere; all earlier browser checks still pass |
| **AC-3** | The 404 page renders correctly when served from a deep address (e.g. `/a/b/c`), light and dark, 360 px; all its links work |
| **AC-4** | Site tests: the 404 page is in the shared header/footer list and has the same CSP; live, a mistyped address on zelin.se shows it |

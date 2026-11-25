# Plan: First impressions

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) |
| **Status** | Approved 2026-11-25 ("go" 20:57). Done, see [verification.md](./verification.md) |

| Choice | Why |
|---|---|
| A `<noscript>` block under each heading, plus a `<noscript>` stylesheet rule that hides the "Loading…" elements | Browsers only show `<noscript>` content with JavaScript off; no script needed |
| `404.html` added to `site_chrome.py`'s page list with prefix `/` | Shared header and footer, kept in sync by the existing test; root-based links work at any depth |
| Test with a local server that serves `404.html` for missing paths, like GitHub Pages | Proves the deep-address case before deploying |

## Tests first

| Test | Covers |
|---|---|
| `scripts/test_site_chrome.py` (extended) | 404 page in the list, root-based links, noindex |
| `tests/site.test.mjs` (extended) | Each of the four pages has the note; Feeds doesn't; CSP unchanged |
| `specs/014-first-impressions/browser-check.cjs` | AC-1 – AC-3 |

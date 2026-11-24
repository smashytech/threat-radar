# Security policy

Threat Radar ([zelin.se](https://zelin.se)) is a static website: no accounts, no
forms, no cookies, no tracking and no third-party code. It shows public data:
CISA's Known Exploited Vulnerabilities catalog, the Cyber Sitrep, and Breach Wire
statistics (never victim names).

## Reporting a problem

Please report security problems **privately** through GitHub:
[Report a vulnerability](https://github.com/smashytech/threat-radar/security/advisories/new).
Don't open a public issue for them.

Useful to include: what you found, where (page, file or workflow), and how to
reproduce it. You'll get a reply within a week.

**In scope:** the site at zelin.se, the code in this repository, the GitHub
Actions workflows, the feeds and the Slack alerts. That includes a victim name
appearing anywhere on the site or in a feed, which would break a core rule of
this project.

**Out of scope:** the data sources themselves (CISA, Ransomware.live,
RansomLook), GitHub Pages' own infrastructure, and automated scanner output
without a concrete impact.

## How the site protects itself

A short overview; the details are in the [README](README.md#security) and the
specs under [`specs/`](specs).

- A strict Content Security Policy on every page: only this site's own files can
  run, with no inline code.
- Everything from data is shown as plain text; links must be `https://`.
- Workflows use pinned actions and the fewest permissions they need.
- A **deploy gate** (spec 008) checks every deploy: the bots that publish the
  Sitrep and Breach Wire may only change their own data, and gatekeeper rules
  can't be loosened and used in the same push without a manual approval.

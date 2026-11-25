# Specs

Every feature of Threat Radar was built the same way: a **spec** (what and why),
a **plan** (how), a **task list** (tests first), and a **verification** report
(proof that each acceptance criterion is met, with screenshots). Specs are kept as
a record of what was decided at the time; when a later spec changed something,
the table says so.

| Spec | What it added | Later changed by |
|---|---|---|
| [001 Threat Radar](001-threat-radar) | The KEV catalog page: live radar, trends, search and filters, twice-daily refresh | 006 (vendor chart period), 007 (moved to `/exploited/`, new look) |
| [002 Cyber Sitrep](002-sitrep-section) | The daily Sitrep with an archive; CVEs checked against KEV; the `add_sitrep.py` gatekeeper | 007 (new look) |
| [003 Breach Wire](003-breach-wire-section) | Ransomware leak-site statistics and group profiles; the `add_breachwire.py` gatekeeper with its victim-name guard | 007 (new look; page heading "Breaches"); 010 (fixed sector list, group names) |
| [004 My stack](004-my-stack) | Tick the software you run; named presets; stays in the browser | 007 (picker lives on `/exploited/`) |
| [005 Feeds and Slack alerts](005-feeds-and-alerts) | Atom feeds (KEV, Sitrep, Breach Wire, one per vendor), the Feeds page, OPML export, Slack alerts | 007 (feed links point to `/exploited/`) |
| [006 Vendor chart period](006-vendor-period) | 7d / 30d / 90d / 1y / All switch on the most-exploited-vendors chart | |
| [007 Briefing redesign](007-briefing-redesign) | The Today front page, light and dark mode, self-hosted fonts, shared header and footer | 009 (faster Today page); amendments A1–A5 |
| [008 Security hardening](008-security-hardening) | The deploy gate, https-only links, `security.txt`, `SECURITY.md`, protected `main` | |
| [009 Previews and speed](009-previews-and-speed) | Link previews for Slack, LinkedIn and Teams; Today page 9.9 s → 2.2 s on a slow phone | |
| [010 Breach statistics](010-breach-statistics) | A fixed list of 17 sectors, one name per gang, and a Trends section (per month, sectors over time, top groups) on the Breaches page | |
| [011 Victim-name check](011-victim-name-check) | An independent check of each new Breach Wire issue against the public victim list; Breach Wire waits if the list is unreachable | |

**Small changes** are recorded as amendments in the spec that owns the area:
[007 amendments](007-briefing-redesign/amendments.md) (tooltip, coffee cup, LinkedIn link,
page headings, phone menu) and [housekeeping](housekeeping.md) for repo-wide changes
(commit identity, README). How a change is sized (feature, small change, trivial) is
set out in [`CLAUDE.md`](../CLAUDE.md).

## Where things live

| Topic | Details in |
|---|---|
| How the Sitrep and Breach Wire are published, and the victim-name rule | 002, 003 |
| How My stack stores data (session vs. remembered, share links) | 004 §5 |
| Feeds, feed sizes, Slack alert behaviour and setup | 005 §5, §9 |
| Colours, themes, fonts, the header/footer tool (`scripts/site_chrome.py`) | 007 plan |
| The deploy gate: lanes, previous rules, manual approvals | 008 §3 |
| Threats and defences, all in one table | below |

## Threats and defences

| Threat | Defence | Spec |
|---|---|---|
| Malicious text in the data | Shown only as plain text (`textContent`); a test fails if HTML-injection methods appear in the code | 001 |
| Injected scripts anyway | A strict Content Security Policy: the browser refuses code not from this site | 001 |
| Broken or truncated CISA feed | Strict validation and a shrink guard (refuses a catalog that suddenly loses over 10%) | 001 |
| A victim name reaching the site | The Breach Wire gatekeeper checks every issue against that day's names; only allow-listed numeric fields are ever published | 003 |
| A tricked publisher bot leaving a leaked name off its own list | Every new issue is also checked against Ransomware.live's public victim list before publishing; held back if the list can't be fetched | 011 |
| Markup in feeds, `@channel` or fake links in Slack | Feeds written by an XML library after stripping forbidden characters; Slack text escaped, link previews off | 005 |
| The Slack webhook leaking | Only in a GitHub secret, visible to the alert steps, never printed | 005 |
| A visitor's software list | Kept only in their browser; shared stacks travel after `#`, which is never sent to a server | 004 |
| A publisher bot changing code or loosening its own rules | The deploy gate: bots may only change their data; loosened rules need a manual approval; code changes get a Slack heads-up | 008 |
| Links from data pointing somewhere unexpected | Only `https://` links without a user name or password become clickable | 008 |
| A hijacked GitHub Action | Pinned to exact commits; Dependabot proposes updates after a 7-day cooldown | 001 |
| Over-powered automation | Workflows start with no permissions; each job gets only what it needs | 001, 005, 008 |
| History rewritten or deleted | A ruleset on `main` blocks force-pushes and deletion | 008 |

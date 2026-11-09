# Plan: Feeds & Slack alerts

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) |
| **Status** | Approved v1 (owner: "Go", 2026-11-09). Built and live; Slack test message waits for the owner's secret |

## 1. The big picture

```
 every run of "Refresh data & deploy"
 ┌────────────────────────────────────────────────────────────────────────────┐
 │ refresh job        tests → fetch KEV → commit data                         │
 │                    → build_feeds.py → site/feeds/*.xml  (not committed)    │
 │                    → package site/                                         │
 │ deploy job         publish to GitHub Pages                                 │
 │ alert job (new)    compare data now vs. the "alerts-sent" marker           │
 │                    → notify_slack.py → Slack → move the marker             │
 └────────────────────────────────────────────────────────────────────────────┘
 in the visitor's browser
   My stack picker / Feeds page → opml.js → "threat-radar-<preset>.opml" download
```

## 2. Key choices

| Choice | Why |
|---|---|
| Feeds are **built during the deploy**, never committed | They're derived from data that's already committed; committing them would double every data change in the history |
| Feeds read **only** `kev.json`, `sitrep/index.json` and `breachwire/index.json`, through an **explicit list of fields** | The Breach Wire index has no victim field at all, and the allowlist keeps it that way even if someone adds one later (NFR-2) |
| **Atom 1.0**, written with Python's `xml.etree` | The library escapes `<`, `&` and quotes itself; the script additionally removes the control characters XML forbids (NFR-1) |
| Same data → **same bytes**: each feed's `updated` time comes from the data (newest date in it), never from the clock | Feeds don't "change" when nothing changed, so readers and the W3C validator stay calm (FR-5) |
| The site address comes from **`actions/configure-pages`** (`base_url` output, pinned to a commit) | It follows the custom domain automatically and switches to `https` the moment HTTPS is enforced (FR-6) |
| Vendor feed address: `feeds/vendors/<slug>.xml`, slug = vendor name in lower-case ASCII with dashes (`Microsoft` → `microsoft`); if two vendors collide, a short fingerprint of the full name is added | A fingerprint doesn't depend on other vendors, so an existing address never changes when a new vendor appears |
| Alert "starting point" = a **git tag `alerts-sent`** on the last commit whose data was alerted | No extra commits, nothing to clean up, and git can show the exact data at that point (`git show alerts-sent:site/data/kev.json`) |
| What's new = **compare data at the tag with data now** (new CVE IDs, new issue dates) | Works the same whether the run was triggered by the schedule, a publisher's push, or by hand (FR-13) |
| Alert job runs **after deploy**, in the same workflow run, so runs never overlap (existing `concurrency: pages`) | Links in the message always work; two runs can't both alert the same news |
| **One message per kind** (KEV, Sitrep, Breach Wire), built with Slack's Block Kit plus a plain-text fallback | Readable on phone and desktop; three messages at most per run |
| Slack text escaping: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;` on every data string; `unfurl_links`/`unfurl_media` false | In Slack, `<…>` is how mentions and links are written. Escaping makes `<!channel>` plain text (FR-15) |
| OPML is built in the browser by a **pure function** (`opml.js`) and downloaded from a `Blob` | Tested like the rest of the site logic, and nothing is sent anywhere (FR-9) |

## 3. Data shapes

**`feeds/vendors.json`** (built with the feeds; used by the Feeds page and the OPML button):
```json
{ "Microsoft": "feeds/vendors/microsoft.xml", "Broadcom": "feeds/vendors/broadcom.xml", "…": "…" }
```

**A KEV feed entry** (Atom):
```xml
<entry>
  <id>tag:zelin.se,2026:kev/CVE-2026-7273</id>
  <title>CVE-2026-7273: Zyxel … Command Injection Vulnerability</title>
  <link href="https://zelin.se/#CVE-2026-7273"/>
  <updated>2026-11-06T00:00:00Z</updated>
  <category term="Zyxel"/>
  <summary>Zyxel · … — Due 2026-11-27. Known ransomware use: No. …</summary>
</entry>
```
IDs use the `tag:` scheme with the domain and the year the feeds started (2026). They never change, even if the site moves.

**OPML file**:
```xml
<opml version="2.0">
  <head><title>Threat Radar: Work</title></head>
  <body>
    <outline type="rss" text="Microsoft" title="Microsoft" xmlUrl="https://zelin.se/feeds/vendors/microsoft.xml" htmlUrl="https://zelin.se/"/>
  </body>
</opml>
```
(`type="rss"` is what feed readers expect for any feed, Atom included.)

## 4. Code

| File | Does |
|---|---|
| `scripts/build_feeds.py` | Reads the data, writes `site/feeds/kev.xml`, `sitrep.xml`, `breachwire.xml`, `vendors/<slug>.xml` and `vendors.json`. Pure functions (`kev_entries`, `slugify`, `atom_feed`, `clean_text`) + a small CLI: `--base-url`, `--data`, `--out` |
| `scripts/notify_slack.py` | Pure functions: `new_kev(old, new)`, `new_issues(old_index, new_index)`, `slack_escape`, `kev_message`, `sitrep_message`, `breachwire_message`. CLI: `--old <dir> --new <dir> --site-url … [--test-message]`; reads `SLACK_WEBHOOK_URL` from the environment; posts with `urllib` (10 s timeout); exit code 1 if Slack refuses |
| `site/opml.js` | `buildOpml(presetName, vendors, vendorFeeds, baseUrl)` → text; escapes everything |
| `site/feeds/index.html` + `site/feeds/feeds.js` | The Feeds page: feed list with copy buttons, vendor finder, how-tos, "Subscribe in a feed reader" |
| `site/stack-picker.js` | Adds the "Subscribe in a feed reader" button next to "Copy link to this preset" |
| All three pages | `<link rel="alternate" type="application/atom+xml" …>` for the KEV, Sitrep and Breach Wire feeds; "Feeds" link in the footer |
| `.github/workflows/refresh-and-deploy.yml` | Refresh job: `configure-pages` → `build_feeds.py --base-url …` before packaging; outputs the data commit's SHA. New **alert** job (see §5) |
| `.gitignore` | `site/feeds/*.xml`, `site/feeds/vendors/`, `site/feeds/vendors.json` |

## 5. The alert job

```yaml
alert:
  needs: [refresh, deploy]
  permissions:
    contents: write        # only to move the alerts-sent tag
  steps:
    - checkout (full history + tags)
    - if no SLACK_WEBHOOK_URL secret → print "Slack alerts not set up; skipping" → stop
    - if no alerts-sent tag → set it on this run's data commit → stop   (first run: FR-13)
    - git show alerts-sent:site/data/… → /tmp/old     (old data)
    - python3 scripts/notify_slack.py --old /tmp/old --new site/data --site-url …
    - on success → move alerts-sent to this run's data commit, push the tag
```
- The secret is passed **only** to the one step that posts, as an environment variable. GitHub masks it in logs; the script never prints it, only "sent 2 messages" or Slack's error code.
- Manual runs get a **"Send a test message"** checkbox (`workflow_dispatch` input) for FR-17.
- A tag push made with the workflow's own token doesn't start another run.

## 6. Tests first

| Test file | Covers |
|---|---|
| `scripts/test_build_feeds.py` | Valid Atom (parsed back with `xml.etree`; required elements), newest-50 order and ties, issue feeds, Breach Wire allowlist (a planted `victims_list` field never appears), vendor slugs (unique, stable, collisions fingerprinted), hostile text and control characters, byte-identical output → **AC-1–AC-5** |
| `scripts/test_notify_slack.py` | New-entry and new-issue detection, 0 / 3 / 25 new, ransomware flag, Sweden flag, escaping `<!channel>` / `<url\|text>` / `&`, unfurl off, no victim fields, test message; sending against a local fake Slack server (200, 400 `invalid_payload`, 404 `no_service`, timeout) and that the webhook address is never printed → **AC-9–AC-13** |
| `tests/opml.test.mjs` | Valid XML, one outline per ticked vendor, full addresses, preset name escaped, empty stack → nothing → **AC-8** |
| `tests/site.test.mjs` (existing) | Picks up the Feeds page automatically: no HTML-injection APIs, no inline code, CSP present → **AC-7** |

Browser checks (like spec 004's `browser-check.cjs`): Feeds page, copy buttons, vendor finder, OPML download, autodiscovery tags, 360 px, keyboard, 0 external requests. Live: the W3C Feed Validation Service on the deployed feeds (AC-6), and a real test message in Slack (AC-13).

## 7. Risks

| Risk | Mitigation |
|---|---|
| The webhook address leaks | Only in a GitHub secret, only in one step, never printed; a test checks the script never prints it. Slack also revokes leaked addresses automatically |
| A flood of alerts (CISA adds 40 at once, or a long outage) | Max 10 entries listed per message, max 3 messages per run, nothing on the first run |
| CISA renames a vendor → its feed address changes | Rare; noted on the Feeds page. The old feed simply stops updating |
| Feed readers following `http://` addresses after HTTPS is switched on | GitHub redirects http → https once HTTPS is enforced; feed links switch automatically via `configure-pages` |
| Vendor subscriptions reveal interests to the feed reader's service | Stated next to the button (FR-9); it's the visitor's choice |
| 291 vendor feeds slow the deploy | They total about 3 MB and take well under a second to write |

## 8. Changes during build

| Change | Why |
|---|---|
| Vendor addresses on a collision: the vendor with **more catalog entries keeps the clean address**; the other gets the fingerprint | A fingerprint on *both* would change an established feed's address when a newcomer appears. Today no two of the 291 vendors collide |
| KEV feed summaries leave out CISA's "required action" | It's mostly the same long boilerplate and buried the useful part; the entry's link opens the full text |
| The vendor feed list (`feeds/vendors.json`) is fetched **ahead of time**, when the Feeds page loads or the picker opens | So "Subscribe in a feed reader" makes **zero** requests when clicked (AC-8) |
| "Copy address" falls back to selecting the address with a "Press Ctrl+C" hint | Browsers block the clipboard on plain-http sites, which zelin.se is until HTTPS is enforced |
| The alert job copies old data with `git archive`, and `notify_slack.py` treats an empty or broken file as "no starting point" for that kind | Found during a dry run: a file that didn't exist at the old commit would otherwise have crashed the alerts |
| The fake Slack server in the tests handles requests in parallel | One deliberately slow request was making the following tests time out |
| The top menu says **"Breaches"** instead of "Ransomware" on every page; the address stays `/ransomware/` | Owner's request mid-build (more descriptive); keeping the address means no existing link breaks |
| Dates, "time ago" and numbers always use **British English** (`SITE_LOCALE = "en-GB"` in `ui.js`), not the visitor's browser language | Owner's request mid-build: a Swedish browser showed "söndag 8 november 2026" and "i går" in English text. Covered by `tests/ui.test.mjs` (also run with a Swedish system language in CI), a site-test rule against formatters without the site language, and a browser check in Swedish |
| The W3C validator's one recommendation (entries sharing a timestamp) is left as is | CISA gives only a date, not a time; inventing times would be misleading, and every entry has its own permanent ID |

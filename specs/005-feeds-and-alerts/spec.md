# Feature spec: Feeds & Slack alerts

| | |
|---|---|
| **Spec ID** | 005-feeds-and-alerts |
| **Status** | Approved v1 (owner: "Go", 2026-11-09). Building |
| **Owner** | smashytech |
| **Builds on** | [001](../001-threat-radar/spec.md), [002](../002-sitrep-section/spec.md), [003](../003-breach-wire-section/spec.md), [004](../004-my-stack/spec.md) |
| **Created** | 2026-11-09 |

---

## 1. Summary

Threat Radar's data can **leave the site and flow into other tools**:

- **Feeds** that any feed reader or automation tool can follow: new KEV entries,
  Cyber Sitrep issues, Breach Wire issues, and **one feed per vendor**.
- A **Feeds page** that explains each feed and how to plug it into Slack,
  Outlook, Feedly, Zapier, n8n or Power Automate.
- **"Subscribe in a feed reader"** for My stack: the browser builds a small file
  that subscribes a feed reader to the feeds of every ticked vendor at once. The
  stack itself still never leaves the browser.
- **Slack alerts** to the owner's channel when new KEV entries land and when a
  new Sitrep or Breach Wire issue is published.

## 2. Why

- People don't revisit a website every day, but they do read their feed reader,
  inbox and Slack. Bringing the data to where people already are makes it useful.
- Feeds are a standard that hundreds of tools already understand, so one format
  covers readers, chat apps and automation platforms with no extra work.
- The owner wants a push, not a pull: "something new is being exploited" should
  arrive in Slack without anyone opening the site.

## 3. Decisions

Owner's answers (2026-11-09):

| Question | Answer |
|---|---|
| Which tools? | Feed readers & automations, and chat alerts |
| Which data? | KEV catalog, Cyber Sitrep, Breach Wire stats, My stack |
| For whom? | Anyone: public, stable, documented |
| Chat app | Slack |
| Alert triggers | New KEV entries, new Sitrep issue, new Breach Wire issue |
| Alert filter | Everything (no list of the owner's software stored anywhere) |
| My stack export | Feed subscription file (OPML) |

Builder proposals (the owner can change any of these before "go"):

| Proposal | Why |
|---|---|
| Feeds use the **Atom** format | Every feed reader and automation tool supports it, and its strict, permanent entry IDs stop tools from posting the same item twice |
| Sizes: KEV feed = **newest 50** entries; Sitrep and Breach Wire = **latest 30** issues; vendor feeds = **newest 20** entries each | Big enough to catch up after a week away, small enough to load fast |
| **One feed per vendor**, not per product. A vendor narrowed to some products still subscribes to the whole vendor's feed, and the button says so | 291 vendor feeds is manageable; per-product feeds would be over 700 files |
| The Feeds page is linked from **every page's footer** and the **My stack picker**, and every page **advertises its feeds** so a reader finds them from just `zelin.se` | Keeps the top navigation short on phones |
| An alert lists **up to 10** new KEV entries, then "and N more" | CISA sometimes adds dozens at once |
| Alerts are **silent** when nothing is new. The **first run** after setup sends nothing and only records the starting point | No flood of old news on day one |
| A manual run of the workflow can send a **test message** | Proves the setup works without waiting for real news |

## 4. User stories

1. As a **visitor**, I paste `zelin.se` into my feed reader and it finds the feeds.
2. As a **visitor**, I follow just the Microsoft and Fortinet feeds.
3. As a **visitor with a stack**, I click "Subscribe in a feed reader", import the file, and from then on my reader shows new exploited vulnerabilities for my vendors.
4. As a **visitor using Slack's RSS app, Zapier, n8n or Power Automate**, I copy a feed address from the Feeds page and paste it into my tool.
5. As the **owner**, I get a Slack message when new KEV entries are added, when the Sitrep is published, and when the Breach Wire is published.
6. As the **owner**, I can trust that no victim name, no secret and no visitor's stack ever leaks through a feed or an alert.

## 5. Functional requirements

**Feeds**

- **FR-1** **KEV feed**: the newest 50 entries by date added (same day: by CVE ID). Each entry shows the CVE and vulnerability name, vendor and product, description, CISA's due date and a ransomware flag, and links to that entry on the Radar.
- **FR-2** **Sitrep feed**: the latest 30 issues. Each shows the date, TL;DR, number of items and the "action needed" flag, and links to the issue page.
- **FR-3** **Breach Wire feed**: the latest 30 issues. Each shows the issue number, victims, groups, countries and the Sweden status, and links to the issue page. **Never victim names.**
- **FR-4** **Vendor feeds**: one per vendor in the catalog, each with that vendor's newest 20 entries, at a stable address. A list maps every vendor to its feed.
- **FR-5** Feeds are rebuilt by the workflow on **every deploy** from the published data. They're never committed, and the same data always produces exactly the same files.
- **FR-6** Feeds use **full addresses** to the live site (the custom domain, and `https` once it's enforced).
- **FR-7** Every page **advertises** the main feeds in its HTML head, so feed readers find them from the site address alone.

**Feeds page**

- **FR-8** A **Feeds page** lists each feed with what's in it, a "Copy address" button and a link. It has a **vendor finder** (type a vendor, get its feed address) and short how-tos for Slack's RSS app, Outlook/Feedly, and Zapier, n8n or Power Automate.

**My stack**

- **FR-9** **"Subscribe in a feed reader"** in the My stack picker and on the Feeds page: the browser builds an **OPML file** (the standard "list of feeds" format) with one feed per ticked vendor, named after the preset, and downloads it. It's disabled when nothing is ticked. A note says plainly that once subscribed, the feed reader fetches those vendor feeds, so the reader's service can see which feeds you follow. The site itself sends nothing.

**Slack alerts**

- **FR-10** **New KEV entries** since the last alert: one message per run, listing up to 10 (CVE, name, vendor and product, ransomware flag, due date) and then "and N more" with a link to the Radar. Nothing is sent if nothing is new.
- **FR-11** **New Sitrep issue**: date, TL;DR, number of items, "action needed" if set, and a link.
- **FR-12** **New Breach Wire issue**: issue number, victims, groups and countries, a red flag if Sweden is hit, and a link. **Never victim names.**
- **FR-13** Alerts go out **only after the deploy has succeeded**, so their links work. Each run alerts what changed since the last successful alert. The **first run** after setup sends nothing and records the starting point.
- **FR-14** If Slack refuses a message or can't be reached, the site stays deployed, the run is marked failed, and the same news is **retried** on the next run.
- **FR-15** Text from the data is made **harmless for Slack**: it can't mention `@channel`, can't create disguised links, and link previews are off.
- **FR-16** The Slack webhook address lives **only** in the GitHub secret `SLACK_WEBHOOK_URL`. It's never written to the repo, a log or a message. Without the secret, alerts are skipped with a notice and everything else works.
- **FR-17** A manual run of the workflow can send a **test message** ("Threat Radar alerts are set up") to prove the setup.

## 6. Non-functional requirements

- **NFR-1** Python standard library only, like the existing scripts. Feeds are valid **Atom 1.0**: well-formed XML with every text escaped, and the control characters that XML forbids removed.
- **NFR-2** The **Breach Wire rule** holds: feeds and alerts are built only from the published data, which has no victim field, and only from an explicit list of allowed fields.
- **NFR-3** **Least privilege**: only the alert job sees the secret, and it gets just enough permission to record its starting point.
- **NFR-4** Content Security Policy unchanged; no third-party code; the Feeds page works at 360 px and with the keyboard; 0 external requests.

## 7. Out of scope

- Per-product feeds (vendor feeds only).
- CSV/JSON download or API for spreadsheets and security tools (not chosen this time; the feeds can be added to later).
- Teams or Discord alerts.
- Alerts filtered to a visitor's own stack in chat (that needs a server; the feed subscription covers it for visitors).
- Email (the daily emails already exist and are unchanged).

## 8. Acceptance criteria

| AC | Criterion |
|---|---|
| **AC-1** | The KEV feed is valid Atom with the newest 50 entries in the right order, and each link opens that entry on the Radar |
| **AC-2** | The Sitrep and Breach Wire feeds hold the latest issues with the right figures; the Breach Wire feed uses only allowed fields and contains no victim names |
| **AC-3** | There's one vendor feed per vendor (291 today), with unique and stable addresses; the Broadcom feed includes its VMware products |
| **AC-4** | Hostile text (`<script>`, `&`, `]]>`, control characters) produces a valid feed that shows the literal text |
| **AC-5** | The same data produces byte-identical feeds |
| **AC-6** | A feed reader finds the feeds from the site address, and the W3C Feed Validation Service reports the live feeds as valid |
| **AC-7** | The Feeds page lists every feed with working copy buttons and a vendor finder; works at 360 px and with the keyboard; CSP unchanged; 0 external requests |
| **AC-8** | With Microsoft and Fortinet ticked, "Subscribe in a feed reader" downloads a valid OPML file with exactly those two vendor feeds and full addresses; markup in the preset name is escaped; 0 requests are made while building it; the button is disabled with nothing ticked |
| **AC-9** | KEV alert: 3 new entries → one message listing 3; 0 new → no message; 25 new → 10 listed plus "and 15 more"; ransomware entries flagged |
| **AC-10** | A new Sitrep issue and a new Breach Wire issue each produce one message with the right figures and the Sweden flag when it applies; no victim names |
| **AC-11** | Entry text containing `<!channel>`, `<https://evil.example\|click>` or `&` appears literally in Slack; link previews are off |
| **AC-12** | The first run sends nothing and records the starting point; a failed send keeps the starting point (news retried); a successful send moves it; a failed alert never undoes a deploy |
| **AC-13** | Without the secret, alerts are skipped with a notice. The secret never appears in the repo or the logs. A real test message arrives in the owner's Slack channel (owner confirms) |

## 9. Owner setup (one-time, about 5 minutes)

1. In Slack: go to **api.slack.com/apps → Create New App** (from scratch), pick your workspace.
2. Open **Incoming Webhooks**, switch it **on**, click **Add New Webhook to Workspace**, choose the channel, and **Allow**.
3. Copy the webhook address (`https://hooks.slack.com/services/…`). **Don't paste it in chat or anywhere public**: Slack revokes leaked addresses.
4. In GitHub: **smashytech/threat-radar → Settings → Secrets and variables → Actions → New repository secret**. Name: `SLACK_WEBHOOK_URL`, value: the address.
5. Tell Claude it's done. Claude runs the workflow with "send a test message" and you confirm it arrived.

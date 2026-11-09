# Verification report: Feeds & Slack alerts

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · [plan.md](./plan.md) (§8 lists changes made during the build, including two owner requests) |
| **Verified** | 2026-11-09 · **AC-1 to AC-11 pass. AC-12 and AC-13 pass in tests; their live part waits for the owner's Slack secret** |
| **Test suite** | 131 Python tests (40 new: 19 feeds, 21 Slack) + 108 JavaScript tests (11 new: 7 OPML, 4 date/number language), all passing; the language test also runs with a Swedish system language in CI |
| **Browser** | [`browser-check.cjs`](./browser-check.cjs): 10 checks in headless Chromium (1280 px, 360 px, a Swedish browser), all passing ([results](./browser-results.json)). Live: desktop browser pane on https://zelin.se and the W3C Feed Validation Service |
| **Deploy** | Runs 42575012892 and the follow-up fix: test, publish and Slack-alert jobs all green; feeds built for `https://zelin.se/` |

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| **AC-1** KEV feed: valid Atom, newest 50, right order, links open Radar entries | ✅ Pass | `KevFeed` tests (order incl. CVE-2026-10000 before 9999 on the same day; links `…/#CVE-…`). Live: 50 entries; W3C: **"This is a valid Atom 1.0 feed"** |
| **AC-2** Sitrep & Breach Wire feeds right; Breach Wire allowed fields only, no names | ✅ Pass | `IssueFeeds` tests: action-needed and Sweden flags; a planted `victimNames` field and a `notes` field never reach the feed; `BREACHWIRE_FIELDS` is an explicit list. Live: 4 Sitrep and 6 Breach Wire issues; both **valid Atom 1.0** |
| **AC-3** One feed per vendor, unique stable addresses; Broadcom includes VMware | ✅ Pass | Live: **291** vendor feeds and `vendors.json`. `Slugs` tests: readable addresses (`Dassault Systèmes` → `dassault-systemes`), collisions resolved without moving an existing address. `VendorFeeds`: Broadcom's feed lists its VMware products. Microsoft and Dassault Systèmes feeds **valid Atom 1.0** |
| **AC-4** Hostile text gives a valid feed showing the literal text | ✅ Pass | `HostileText`: `<script>`, `&`, `]]>`, `\x00`, `\x1b` and `<!channel>` → well-formed XML, title shows the literal text, raw bytes hold `&lt;script&gt;`; `CleanText` drops what XML forbids (incl. lone surrogates) |
| **AC-5** Same data → byte-identical feeds | ✅ Pass | `Output.test_writes_every_file_and_is_byte_identical_on_rerun`; dates come from the data, never the clock |
| **AC-6** Readers find the feeds from the site; W3C says valid | ✅ Pass | All four pages advertise the 3 main feeds, each loads as Atom (browser check). W3C Feed Validation Service on the live site: kev, sitrep, breachwire, microsoft and dassault-systemes all **valid**. Then the validator started rate-limiting with a bot check, so the remaining checks stopped there; all feeds come from the same code |
| **AC-7** Feeds page: copy buttons, vendor finder, 360 px, keyboard, CSP, 0 external | ✅ Pass | Full addresses; Copy puts the address on the clipboard; without clipboard access the address is selected with a "Press Ctrl+C" hint; finder ignores accents ("systemes" → Dassault Systèmes), caps at 20, says when nothing matches; 360 px with no sideways scroll; Tab and Enter copy a vendor address; CSP test covers the page automatically; **0 external requests**, 0 errors ([desktop](./evidence/feeds-page.png), [phone](./evidence/feeds-360.png)) |
| **AC-8** "Subscribe in a feed reader" | ✅ Pass | Microsoft (Windows only) + Fortinet → `threat-radar-work.opml` with exactly those two vendor feeds, full addresses, valid XML in the browser's own parser, **0 requests while building**, plus the note that feeds are per vendor ([example file](./evidence/example-work.opml)). Preset `<img src=x onerror=alert(1)> & "q"` → escaped in the file, no elements created. Disabled with nothing ticked, on the Feeds page and in the picker ([picker](./evidence/picker-subscribe.png)) |
| **AC-9** KEV alert: 0 / 3 / 25 new, ransomware flag | ✅ Pass | `KevMessage` tests: no message for 0; 3 listed with links; 25 → 10 listed + "and 15 more"; ≤ 50 blocks. Dry run on real data: "1 new exploited vulnerability… CVE-2026-19868 SonicWall…" |
| **AC-10** Sitrep and Breach Wire alerts; Sweden flag; no names | ✅ Pass | `IssueMessages` tests incl. planted name fields. Dry runs on real data: "3 new Cyber Sitrep issues" with TL;DRs and "Action needed"; "Breach Wire №77 · Sun 8 Nov 2026 · 34 claimed victims in 13 countries, posted by 10 groups. Sweden: none" |
| **AC-11** `<!channel>`, `<url\|text>`, `&` shown literally; previews off | ✅ Pass | `Escaping` and `test_hostile_text_shows_literally`: the only Slack markup in any message is links we built to the site; `unfurl_links` and `unfurl_media` false |
| **AC-12** First run records the start; failed send keeps it; success moves it; deploy never undone | ✅ Pass (tests) · ⏳ live | The alert job runs after deploy (`needs: [refresh, deploy]`); the tag moves only if `notify_slack.py` exits 0 (`bash -e`); refused (400 `invalid_payload`, 404 `no_service`) or timed-out sends exit 1. Live first run happens once the secret exists |
| **AC-13** No secret → skipped; secret never printed; real test message arrives | ✅ Pass (tests) · ⏳ live | Live: "Slack alerts aren't set up (no SLACK_WEBHOOK_URL secret). Skipping." Tests run every send path, including failures and timeouts, with a webhook address containing `SECRET` and assert it never appears in the output; only `https://hooks.slack.com/` addresses are accepted. **Waiting for the owner** to add the secret and confirm the test message |

## Owner requests during the build

- **"Ransomware" → "Breaches"** in the top menu on every page; the address stays `/ransomware/` so no link breaks (checked in the browser at 360 px and live).
- **Dates follow the site's language**: in a Swedish browser the Breaches page said "söndag 8 november 2026". Now every formatter uses British English ([after](./evidence/breaches-english-dates.png)). Live check in the owner's Swedish browser pane with the deployed code: "Sunday, 8 November 2026", "Sat 7 Nov", "1,769", "yesterday".

## Noted, not blocking

- The W3C validator recommends distinct `updated` times, because, for example, 26 KEV entries share 30 Oct. CISA publishes only dates, so the feeds keep the honest date; every entry still has a unique permanent ID.
- GitHub Pages lets browsers keep files for up to 10 minutes, so right after a deploy a page can briefly run the previous script. Seen live: the new menu with the old date code until the cache expired.

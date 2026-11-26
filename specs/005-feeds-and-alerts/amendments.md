# Amendments: Feeds and alerts (spec 005)

Small changes to the areas spec 005 owns: the feeds and the Slack alerts.
Format: request, decision, acceptance check, verification.

## A1 · Source credit in the Breach Wire feed and alerts (2026-11-26)

- **Request:** "im not breaching any licenses or anything by sharing this site?" The licence review found that Ransomware.live's terms ask for the source to be named, with a link, "on any page, dashboard, or interface where this data is displayed". Every web page has it in the footer; the Breach Wire feed and Slack alerts did not. Owner: "go for it".
- **Decision:**
  - Breach Wire feed: a `<rights>` line on the feed ("Leak-site data: Source: Ransomware.live (https://www.ransomware.live/) and RansomLook (https://www.ransomlook.io/). Non-commercial use."), "Source: Ransomware.live and RansomLook." at the end of every entry's summary, and both sites as `related` links on every entry.
  - Breach Wire Slack alerts: a last line "Source: Ransomware.live and RansomLook", both linked.
  - Wording follows Ransomware.live's suggested citation ("Source: Ransomware.live"). KEV and Sitrep feeds are unchanged (CISA's catalog is public domain and already named in the KEV feed).
- **Check:** tests fail if the credit or the links disappear from the feed or the alert; the feed still validates as Atom.
- **Verified:** 2026-11-26. `test_build_feeds.py` (feed has the `rights` line; every entry ends with the credit and has both sites as `related` links; still valid Atom) and `test_notify_slack.py` (the alert's last line credits both, linked) pass. Real feed: 30 of 30 entries credited, 60 related links.

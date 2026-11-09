#!/usr/bin/env python3
"""Post Threat Radar news to the owner's Slack channel (spec 005 FR-10 to FR-17).

The workflow runs this after every successful deploy. It compares the data at
the last alert (OLD) with the data just published (NEW) and sends at most one
message per kind:

  KEV           new exploited vulnerabilities (up to 10 listed, then "and N more")
  Sitrep        new Cyber Sitrep issue(s)
  Breach Wire   new Breach Wire issue(s): statistics only, never victim names

Safety rules:
  * The webhook address comes only from the SLACK_WEBHOOK_URL environment
    variable (a GitHub secret) and is never printed, not even in errors.
  * In Slack, "<...>" writes links and mentions (<!channel> pings everyone), so
    every piece of data text is escaped: & → &amp;, < → &lt;, > → &gt;.
  * Link previews are off, and only Slack's own addresses are accepted.

Usage:
  python3 scripts/notify_slack.py --old /tmp/old-data --new site/data --site-url https://zelin.se/
  python3 scripts/notify_slack.py --test-message --site-url https://zelin.se/   # prove the setup
  ... --dry-run                                                                # print, don't send

Exit codes: 0 = sent, nothing to send, or not set up; 1 = Slack refused or was
unreachable (the news is retried next run); 2 = bad input.

Standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_feeds import BREACHWIRE_FIELDS, SITREP_FIELDS, clean_text, cve_sort_key, long_day, pick, plural, site_address  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
WEBHOOK_PREFIXES = ("https://hooks.slack.com/",)
TIMEOUT = 10        # seconds to wait for Slack
PAUSE = 1.1         # seconds between messages: Slack accepts about one per second per webhook
MAX_LISTED = 10     # KEV entries listed in one message
MAX_ISSUES = 5      # Sitrep / Breach Wire issues listed in one message
KINDS = ("KEV", "Sitrep", "Breach Wire")
CVE_RE = re.compile(r"^CVE-\d{4}-\d{4,}$")


class Alert(NamedTuple):
    kind: str
    count: int
    payload: dict


# ---------- Making text safe for Slack ----------

def slack_escape(value: object, limit: int | None = None) -> str:
    """Plain text that Slack shows as-is: no mentions, no disguised links."""
    text = clean_text(value)
    if limit and len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"  # shorten BEFORE escaping, so "&amp;" is never cut in half
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def link(url: str, label: str) -> str:
    """A Slack link to our own site, or just the label if the address looks odd."""
    if any(ch in url for ch in "<>| \n"):
        return slack_escape(label)
    return f"<{url}|{slack_escape(label)}>"


def section(text: str) -> dict:
    return {"type": "section", "text": {"type": "mrkdwn", "text": text[:3000]}}  # Slack's limit per section


def context(text: str) -> dict:
    return {"type": "context", "elements": [{"type": "mrkdwn", "text": text[:3000]}]}


def message(fallback: str, blocks: list[dict]) -> dict:
    """fallback = what notifications and screen readers show."""
    return {"text": fallback[:3000], "blocks": blocks[:50], "unfurl_links": False, "unfurl_media": False}


# ---------- What's new ----------

def new_kev(old: list[dict], new: list[dict]) -> list[dict]:
    seen = {e["cveID"] for e in old}
    return sorted((e for e in new if e["cveID"] not in seen), key=cve_sort_key, reverse=True)


def new_issues(old_index: dict, new_index: dict, fields: tuple[str, ...]) -> list[dict]:
    """Issues in NEW that OLD didn't have, newest first, with only the allowed fields."""
    seen = {i["date"] for i in old_index.get("issues", [])}
    fresh = [pick(i, fields) for i in new_index.get("issues", []) if i["date"] not in seen]
    return sorted(fresh, key=lambda i: i["date"], reverse=True)


# ---------- The messages ----------

def kev_message(entries: list[dict], base: str) -> dict | None:
    if not entries:
        return None
    n = len(entries)
    shown = entries[:MAX_LISTED]
    headline = f"{plural(n, 'new exploited vulnerability', 'new exploited vulnerabilities')} in CISA's KEV catalog"
    blocks = [section(f":shield: *{headline}*")]
    for e in shown:
        cve = str(e["cveID"])
        title = link(f"{base}#{cve}", cve) if CVE_RE.match(cve) else slack_escape(cve)
        line = (f"*{title}* {slack_escape(e['vulnerabilityName'], 300)}\n"
                f"{slack_escape(e['vendorProject'], 120)} · {slack_escape(e['product'], 120)} · CISA due {slack_escape(e.get('dueDate'))}")
        if e.get("knownRansomwareCampaignUse") == "Known":
            line += "\n:rotating_light: Known ransomware use"
        blocks.append(section(line))
    rest = n - len(shown)
    blocks.append(context((f"…and {rest} more. " if rest else "") + link(base, "Open Threat Radar")))
    ids = ", ".join(slack_escape(e["cveID"]) for e in shown) + (f" and {rest} more" if rest else "")
    return message(f"{headline}: {ids}", blocks)


def sitrep_message(issues: list[dict], base: str) -> dict | None:
    if not issues:
        return None
    blocks = [section(f":newspaper: *{plural(len(issues), 'new Cyber Sitrep issue', 'new Cyber Sitrep issues')}*")] if len(issues) > 1 else []
    for i in issues[:MAX_ISSUES]:
        action = " · :warning: *Action needed*" if i["actionNeeded"] else ""
        blocks.append(section(
            f":newspaper: *Cyber Sitrep, {long_day(i['date'])}*{action}\n{slack_escape(i['tldr'], 1200)}\n"
            f"{plural(int(i['items']), 'item', 'items')}, {plural(int(i['emerging']), 'emerging threat', 'emerging threats')} · "
            + link(f"{base}sitrep/?d={i['date']}", "Read the Sitrep")))
    if len(issues) > MAX_ISSUES:
        blocks.append(context(f"…and {len(issues) - MAX_ISSUES} more. " + link(f"{base}sitrep/", "All issues")))
    first = issues[0]
    return message(f"Cyber Sitrep, {long_day(first['date'])}: {slack_escape(first['tldr'], 300)}", blocks)


def breachwire_message(issues: list[dict], base: str) -> dict | None:
    """Built only from BREACHWIRE_FIELDS (see new_issues): there's nowhere for a victim name to come from."""
    if not issues:
        return None
    blocks = []
    for i in issues[:MAX_ISSUES]:
        victims, countries, groups, sweden = (int(i[k]) for k in ("victims", "countries", "groups", "sweden"))
        sweden_line = (f":rotating_light: *Sweden hit: {plural(sweden, 'organisation', 'organisations')} claimed*"
                       if sweden else "Sweden: none")
        blocks.append(section(
            f":bar_chart: *Breach Wire №{int(i['issue'])}* · {long_day(i['date'])}\n"
            f"{plural(victims, 'claimed victim', 'claimed victims')} in {plural(countries, 'country', 'countries')}, "
            f"posted by {plural(groups, 'group', 'groups')}.\n{sweden_line} · "
            + link(f"{base}ransomware/?d={i['date']}", "See the statistics")))
    if len(issues) > MAX_ISSUES:
        blocks.append(context(f"…and {len(issues) - MAX_ISSUES} more. " + link(f"{base}ransomware/", "All issues")))
    first = issues[0]
    hit = " (Sweden hit)" if int(first["sweden"]) else ""
    return message(f"Breach Wire №{int(first['issue'])}: {plural(int(first['victims']), 'claimed victim', 'claimed victims')}{hit}", blocks)


def test_message(base: str) -> dict:
    text = "Threat Radar alerts are set up. New KEV entries, Cyber Sitrep and Breach Wire issues will be posted here."
    return message(text, [section(f":white_check_mark: *Threat Radar alerts are set up.*\n"
                                  f"New KEV entries, Cyber Sitrep and Breach Wire issues will be posted here. "
                                  + link(base, "Open Threat Radar"))])


# ---------- From data folders to alerts ----------

class Unreadable(Exception):
    pass


def load(path: Path):
    """The file's data, or None if it doesn't exist. Raises Unreadable for empty or broken files."""
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text("utf-8"))
    except (ValueError, UnicodeDecodeError) as err:
        raise Unreadable(path.name) from err


def messages_for(old_dir: Path, new_dir: Path, base: str) -> tuple[list[Alert], list[str]]:
    """Alerts in the order KEV, Sitrep, Breach Wire, plus notes about kinds that were skipped."""
    alerts, notes = [], []
    sources = {
        "KEV": ("kev.json", lambda o, n: new_kev(o, n), kev_message),
        "Sitrep": ("sitrep/index.json", lambda o, n: new_issues(o, n, SITREP_FIELDS), sitrep_message),
        "Breach Wire": ("breachwire/index.json", lambda o, n: new_issues(o, n, BREACHWIRE_FIELDS), breachwire_message),
    }
    for kind in KINDS:
        name, diff, build = sources[kind]
        try:
            old, new = load(old_dir / name), load(new_dir / name)
        except Unreadable:
            notes.append(f"{kind}: couldn't read {name}; skipped this time")
            continue
        if new is None:
            continue
        if old is None:  # no starting point for this kind: don't flood the channel with its whole history
            notes.append(f"{kind}: no earlier data to compare with; skipped this time")
            continue
        fresh = diff(old, new)
        if fresh:
            alerts.append(Alert(kind, len(fresh), build(fresh, base)))
    return alerts, notes


# ---------- Sending ----------

def send(url: str, payload: dict) -> tuple[bool, str]:
    """POST one message. Returns (ok, Slack's answer or the problem). Never mentions the address."""
    request = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST",
                                     headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return True, clean_text(response.read(200).decode("utf-8", "replace"))
    except urllib.error.HTTPError as err:
        return False, f"HTTP {err.code}: {clean_text(err.read(200).decode('utf-8', 'replace'))}"
    except urllib.error.URLError as err:
        if isinstance(err.reason, (TimeoutError, socket.timeout)):
            return False, "timed out"
        return False, f"couldn't connect ({type(err.reason).__name__})"
    except (TimeoutError, socket.timeout):
        return False, "timed out"
    except OSError as err:
        return False, f"couldn't connect ({type(err).__name__})"


def main(argv: list[str] | None = None, env: dict | None = None, sleep=time.sleep) -> int:
    env = os.environ if env is None else env
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--old", type=Path, help="data folder as it was at the last alert")
    parser.add_argument("--new", type=Path, default=ROOT / "site" / "data", help="data folder just published")
    parser.add_argument("--site-url", required=True, help="the live site address, for links")
    parser.add_argument("--test-message", action="store_true", help="send only a 'set up' test message")
    parser.add_argument("--dry-run", action="store_true", help="print the messages instead of sending them")
    args = parser.parse_args(argv)
    try:
        base = site_address(args.site_url)
    except ValueError as err:
        print(f"Error: {err}", file=sys.stderr)
        return 2

    if args.test_message:
        alerts, notes = [Alert("Test", 1, test_message(base))], []
    elif args.old is None:
        print("Error: --old is required (or use --test-message)", file=sys.stderr)
        return 2
    else:
        alerts, notes = messages_for(args.old, args.new, base)
    for note in notes:
        print(note)
    if not args.test_message:
        for kind in KINDS:
            if kind not in {a.kind for a in alerts} and not any(n.startswith(kind + ":") for n in notes):
                print(f"{kind}: nothing new")

    if args.dry_run:
        for alert in alerts:
            print(f"--- {alert.kind} ({alert.count} new) ---")
            print(json.dumps(alert.payload, indent=2, ensure_ascii=False))
        return 0
    if not alerts:
        return 0

    url = str(env.get("SLACK_WEBHOOK_URL", "")).strip()
    if not url:
        print("Slack alerts aren't set up (no SLACK_WEBHOOK_URL secret). Skipping.")
        return 0
    if not url.startswith(WEBHOOK_PREFIXES):
        print("Error: SLACK_WEBHOOK_URL doesn't look like a Slack webhook address "
              "(it should start with https://hooks.slack.com/). Nothing was sent.", file=sys.stderr)
        return 2

    failed = False
    for n, alert in enumerate(alerts):
        if n:
            sleep(PAUSE)
        ok, detail = send(url, alert.payload)
        label = "test message" if alert.kind == "Test" else f"{alert.count} new"
        if ok:
            print(f"{alert.kind}: {label} → sent")
        else:
            failed = True
            print(f"{alert.kind}: {label} → NOT sent, Slack said: {detail}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

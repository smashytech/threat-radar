#!/usr/bin/env python3
"""Build Threat Radar's Atom feeds from the published data (spec 005).

A feed is a small XML file listing the newest items. Feed readers (Feedly,
Outlook), chat apps (Slack's RSS app) and automation tools (Zapier, n8n,
Power Automate) check it now and then and show what's new.

Writes, into site/feeds/:
  kev.xml          the 50 newest KEV entries
  sitrep.xml       the 30 latest Cyber Sitrep issues
  breachwire.xml   the 30 latest Breach Wire issues (statistics only)
  vendors/<x>.xml  one feed per vendor, its 20 newest entries
  vendors.json     vendor name → feed address, for the Feeds page and My stack

Rules:
  * Reads only kev.json and the two index.json files, and from the Breach Wire
    index only the fields in BREACHWIRE_FIELDS, so a victim name can never
    reach a feed (spec 003 FR-2, spec 005 NFR-2).
  * Same data in → same bytes out: every date comes from the data, never the clock.
  * Text is escaped by the XML library; characters XML forbids are removed first.

Usage (the workflow passes the live site address):
  python3 scripts/build_feeds.py --base-url https://zelin.se/

Standard library only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import date as Date
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
from add_sitrep import to_json, write_atomic  # noqa: E402  (shared helpers)

ROOT = Path(__file__).resolve().parent.parent
ATOM_NS = "http://www.w3.org/2005/Atom"
# Permanent IDs ("tag:" URIs). They name the feeds' owner and start year, not the
# site's current address, so they never change even if the site moves.
TAG = "tag:zelin.se,2026:"
SIZES = {"kev": 50, "issues": 30, "vendor": 20}
BREACHWIRE_FIELDS = ("date", "issue", "window", "victims", "groups", "countries", "sweden")
SITREP_FIELDS = ("date", "tldr", "items", "emerging", "actionNeeded")
EMPTY_FEED_DATE = "1970-01-01"

# XML 1.0 only allows tab, newline, carriage return and these ranges. Everything else
# (e.g. \x00, \x1b, lone surrogates, ￾) would make the whole feed unreadable.
FORBIDDEN_XML = re.compile("[^\t\n\r -퟿-�\U00010000-\U0010ffff]")
DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

ET.register_namespace("", ATOM_NS)


def clean_text(value: object) -> str:
    """Text safe to put in XML: forbidden characters removed, whitespace tidied."""
    if value is None:
        return ""
    return " ".join(FORBIDDEN_XML.sub("", str(value)).split())


def plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def long_day(iso: str) -> str:
    """'2026-10-02' → 'Fri 2 Oct 2026' (English on purpose: feeds don't know the reader's language)."""
    d = Date.fromisoformat(iso)
    return f"{DAYS[d.weekday()]} {d.day} {MONTHS[d.month - 1]} {d.year}"


# ---------- Vendor feed addresses ----------

def slugify(name: str) -> str:
    """'Dassault Systèmes' → 'dassault-systemes'. Letters and digits only, dashes between."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")


def fingerprint(name: str) -> str:
    return hashlib.sha256(name.encode("utf-8")).hexdigest()[:6]


def vendor_slugs(counts: dict[str, int]) -> dict[str, str]:
    """Vendor → address part. If two vendors would share one, the vendor with more
    catalog entries keeps the clean one and the other gets a fingerprint of its name,
    so a newcomer can never take over an established feed address."""
    groups: dict[str, list[str]] = {}
    for name in counts:
        groups.setdefault(slugify(name), []).append(name)
    slugs = {}
    for base, names in groups.items():
        names.sort(key=lambda n: (-counts[n], n))
        for i, name in enumerate(names):
            if not base:
                slugs[name] = f"vendor-{fingerprint(name)}"
            else:
                slugs[name] = base if i == 0 else f"{base}-{fingerprint(name)}"
    return slugs


# ---------- Building Atom ----------

def sub(parent: ET.Element, tag: str, text: str | None = None, **attrs: str) -> ET.Element:
    element = ET.SubElement(parent, f"{{{ATOM_NS}}}{tag}", attrs)
    if text is not None:
        element.text = clean_text(text)
    return element


def timestamp(iso_day: str) -> str:
    Date.fromisoformat(iso_day)  # refuses anything that isn't a real date
    return f"{iso_day}T00:00:00Z"


def atom_feed(feed_id: str, title: str, subtitle: str, self_url: str, site_url: str, items: list[dict]) -> bytes:
    """items: dicts with id, title, link, day, summary and optional categories."""
    feed = ET.Element(f"{{{ATOM_NS}}}feed")
    sub(feed, "id", TAG + feed_id)
    sub(feed, "title", title)
    sub(feed, "subtitle", subtitle)
    sub(feed, "link", rel="self", type="application/atom+xml", href=self_url)
    sub(feed, "link", rel="alternate", type="text/html", href=site_url)
    newest = max((item["day"] for item in items), default=EMPTY_FEED_DATE)
    sub(feed, "updated", timestamp(newest))
    author = sub(feed, "author")
    sub(author, "name", "Threat Radar")
    for item in items:
        entry = sub(feed, "entry")
        sub(entry, "id", TAG + item["id"])
        sub(entry, "title", item["title"])
        sub(entry, "link", rel="alternate", type="text/html", href=item["link"])
        sub(entry, "published", timestamp(item["day"]))
        sub(entry, "updated", timestamp(item["day"]))
        for term in item.get("categories", []):
            sub(entry, "category", term=clean_text(term))
        sub(entry, "summary", item["summary"])
    ET.indent(feed, space="  ")
    return ('<?xml version="1.0" encoding="utf-8"?>\n' + ET.tostring(feed, encoding="unicode") + "\n").encode("utf-8")


# ---------- KEV ----------

def cve_sort_key(entry: dict) -> tuple:
    """Newest date first; same day: higher CVE number first (CVE-2026-10000 after 9999, not text order)."""
    match = re.fullmatch(r"CVE-(\d{4})-(\d+)", entry["cveID"])
    year, number = (int(match.group(1)), int(match.group(2))) if match else (0, 0)
    return (entry["dateAdded"], year, number, entry["cveID"])


def newest(kev: list[dict], limit: int) -> list[dict]:
    return sorted(kev, key=cve_sort_key, reverse=True)[:limit]


def kev_item(entry: dict, base: str) -> dict:
    ransomware = entry.get("knownRansomwareCampaignUse") == "Known"
    # CISA's "required action" is mostly the same long boilerplate; the link opens the full entry.
    summary = (
        f"{clean_text(entry['vendorProject'])} · {clean_text(entry['product'])}. {clean_text(entry.get('shortDescription'))} "
        f"Known ransomware use: {'Yes' if ransomware else 'No'}. CISA due date: {clean_text(entry.get('dueDate'))}."
    )
    return {
        "id": f"kev/{entry['cveID']}",
        "title": f"{entry['cveID']}: {entry['vulnerabilityName']}",
        "link": f"{base}#{entry['cveID']}",
        "day": entry["dateAdded"],
        "summary": summary,
        "categories": [entry["vendorProject"]] + (["ransomware"] if ransomware else []),
    }


def kev_feed(kev: list[dict], base: str) -> bytes:
    return atom_feed(
        "feeds/kev", "Threat Radar: newly exploited vulnerabilities",
        "The newest entries in CISA's Known Exploited Vulnerabilities catalog (public domain).",
        f"{base}feeds/kev.xml", base, [kev_item(e, base) for e in newest(kev, SIZES["kev"])])


def vendor_feeds(kev: list[dict], base: str) -> tuple[dict[str, bytes], dict[str, str]]:
    """({slug: feed bytes}, {vendor: 'feeds/vendors/<slug>.xml'})"""
    counts = Counter(e["vendorProject"] for e in kev)
    slugs = vendor_slugs(dict(counts))
    feeds, index = {}, {}
    for vendor in sorted(counts):
        slug = slugs[vendor]
        mine = [e for e in kev if e["vendorProject"] == vendor]
        feeds[slug] = atom_feed(
            f"feeds/vendor/{slug}", f"Threat Radar: {vendor}",
            f"Newly exploited vulnerabilities in {vendor} products, from CISA's KEV catalog.",
            f"{base}feeds/vendors/{slug}.xml", base, [kev_item(e, base) for e in newest(mine, SIZES["vendor"])])
        index[vendor] = f"feeds/vendors/{slug}.xml"
    return feeds, index


# ---------- Sitrep and Breach Wire (index files only, allowed fields only) ----------

def pick(issue: dict, fields: tuple[str, ...]) -> dict:
    return {field: issue[field] for field in fields}


def latest(index: dict, fields: tuple[str, ...]) -> list[dict]:
    issues = [pick(i, fields) for i in index.get("issues", [])]
    return sorted(issues, key=lambda i: i["date"], reverse=True)[:SIZES["issues"]]


def sitrep_feed(index: dict, base: str) -> bytes:
    items = []
    for i in latest(index, SITREP_FIELDS):
        action = " (action needed)" if i["actionNeeded"] else ""
        items.append({
            "id": f"sitrep/{i['date']}",
            "title": f"Cyber Sitrep, {long_day(i['date'])}{action}",
            "link": f"{base}sitrep/?d={i['date']}",
            "day": i["date"],
            "summary": f"{clean_text(i['tldr'])} {plural(int(i['items']), 'item', 'items')}, "
                       f"{plural(int(i['emerging']), 'emerging threat', 'emerging threats')}."
                       + (" Action needed." if i["actionNeeded"] else ""),
        })
    return atom_feed("feeds/sitrep", "Threat Radar: Cyber Sitrep",
                     "The daily cybersecurity situation report.", f"{base}feeds/sitrep.xml", f"{base}sitrep/", items)


def breachwire_feed(index: dict, base: str) -> bytes:
    items = []
    for i in latest(index, BREACHWIRE_FIELDS):
        victims, countries, groups, sweden = (int(i[k]) for k in ("victims", "countries", "groups", "sweden"))
        flag = " (Sweden hit)" if sweden else ""
        sweden_text = f"Sweden: {plural(sweden, 'organisation', 'organisations')} claimed." if sweden else "Sweden: none."
        items.append({
            "id": f"breachwire/{int(i['issue'])}",
            "title": f"Breach Wire №{int(i['issue'])}: {plural(victims, 'claimed victim', 'claimed victims')} "
                     f"in {plural(countries, 'country', 'countries')}{flag}",
            "link": f"{base}ransomware/?d={i['date']}",
            "day": i["date"],
            "summary": f"{plural(victims, 'claimed victim', 'claimed victims')} across {plural(countries, 'country', 'countries')}, "
                       f"posted by {plural(groups, 'group', 'groups')}. {sweden_text} "
                       f"Leak-site claims from {long_day(i['window'])} (UTC). Statistics only, never victim names.",
        })
    return atom_feed("feeds/breachwire", "Threat Radar: Breach Wire",
                     "Daily ransomware leak-site statistics and threat groups. Never victim names.",
                     f"{base}feeds/breachwire.xml", f"{base}ransomware/", items)


# ---------- Command line ----------

def site_address(value: str) -> str:
    parts = urlsplit(value)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise ValueError(f"not a usable site address: {value!r} (expected e.g. https://zelin.se/)")
    return value if value.endswith("/") else value + "/"


def write_all(data_dir: Path, out_dir: Path, base: str) -> tuple[int, int]:
    kev = json.loads((data_dir / "kev.json").read_text("utf-8"))
    sitrep_index = json.loads((data_dir / "sitrep" / "index.json").read_text("utf-8"))
    bw_index = json.loads((data_dir / "breachwire" / "index.json").read_text("utf-8"))

    main_feeds = {
        "kev.xml": kev_feed(kev, base),
        "sitrep.xml": sitrep_feed(sitrep_index, base),
        "breachwire.xml": breachwire_feed(bw_index, base),
    }
    per_vendor, index = vendor_feeds(kev, base)

    vendor_dir = out_dir / "vendors"
    vendor_dir.mkdir(parents=True, exist_ok=True)
    for name, data in main_feeds.items():
        write_atomic(out_dir / name, data.decode("utf-8"))
    for slug, data in per_vendor.items():
        write_atomic(vendor_dir / f"{slug}.xml", data.decode("utf-8"))
    for old in vendor_dir.glob("*.xml"):  # vendors that left the catalog
        if old.stem not in per_vendor:
            old.unlink()
    write_atomic(out_dir / "vendors.json", to_json(dict(sorted(index.items()))))
    return len(main_feeds), len(per_vendor)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", required=True, help="the live site address, e.g. https://zelin.se/")
    parser.add_argument("--data", type=Path, default=ROOT / "site" / "data")
    parser.add_argument("--out", type=Path, default=ROOT / "site" / "feeds")
    args = parser.parse_args(argv)
    try:
        base = site_address(args.base_url)
    except ValueError as err:
        print(f"Error: {err}", file=sys.stderr)
        return 2
    main_count, vendor_count = write_all(args.data, args.out, base)
    print(f"Wrote {main_count} feeds + {vendor_count} vendor feeds to {args.out} for {base}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

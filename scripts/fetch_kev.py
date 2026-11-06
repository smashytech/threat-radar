#!/usr/bin/env python3
"""Download, validate and save the CISA Known Exploited Vulnerabilities catalog.

What it does, step by step:
  1. Download the catalog (JSON) from CISA. If that fails, try CISA's
     official GitHub mirror instead.
  2. Validate it. Anything odd (not JSON, missing fields, empty list, a
     suspiciously big drop in entries) stops the script with an error.
  3. Only if everything is valid: write three files into site/data/
       kev.json     the entries, newest first, trimmed to what the site uses
       meta.json    the catalog version, release time and entry count
       status.json  when we checked and where from (not committed to git)

Standard library only: nothing to install, nothing to keep updated.

Usage:
  python3 scripts/fetch_kev.py                      # normal run
  python3 scripts/fetch_kev.py --source file.json   # use a local file (tests)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PRIMARY_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
MIRROR_URL = "https://raw.githubusercontent.com/cisagov/kev-data/main/known_exploited_vulnerabilities.json"
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "site" / "data"

REQUIRED_FIELDS = (
    "cveID", "vendorProject", "product", "vulnerabilityName", "dateAdded",
    "shortDescription", "requiredAction", "dueDate", "knownRansomwareCampaignUse",
)
OPTIONAL_FIELDS = ("notes", "cwes", "forensicTriage")

CVE_PATTERN = re.compile(r"^CVE-\d{4}-\d{4,}$")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024  # the real feed is a few MB; refuse anything absurd
MAX_SHRINK = 0.10  # refuse a catalog that lost more than 10% of entries since last time
USER_AGENT = "threat-radar-bot/1.0 (GitHub Actions; +https://github.com/topics/threat-radar)"


class FeedError(Exception):
    """Anything that means 'do not publish this data'."""


# ---------- 1. Load ----------

def load_feed(source: str) -> dict:
    """Read the feed from a URL or a local file path and parse the JSON."""
    try:
        if source.startswith(("http://", "https://")):
            request = urllib.request.Request(source, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read(MAX_DOWNLOAD_BYTES + 1)
        else:
            raw = Path(source).read_bytes()
    except OSError as err:  # covers network errors and missing files
        raise FeedError(f"could not read {source}: {err}") from err

    if len(raw) > MAX_DOWNLOAD_BYTES:
        raise FeedError(f"{source} is larger than {MAX_DOWNLOAD_BYTES} bytes")
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as err:
        raise FeedError(f"{source} is not valid JSON: {err}") from err


# ---------- 2. Validate ----------

def validate(feed: object, previous_count: int | None = None) -> list[dict]:
    """Check the feed's shape and every entry. Returns the entries if all is well."""
    if not isinstance(feed, dict):
        raise FeedError("feed is not a JSON object")
    entries = feed.get("vulnerabilities")
    if not isinstance(entries, list):
        raise FeedError("feed has no 'vulnerabilities' list")
    if not entries:
        raise FeedError("feed contains zero entries")
    if not isinstance(feed.get("catalogVersion"), str):
        raise FeedError("feed has no 'catalogVersion'")

    seen: set[str] = set()
    for index, entry in enumerate(entries):
        where = f"entry #{index}"
        if not isinstance(entry, dict):
            raise FeedError(f"{where} is not an object")
        for field in REQUIRED_FIELDS:
            value = entry.get(field)
            if not isinstance(value, str) or not value.strip():
                raise FeedError(f"{where} ({entry.get('cveID', '?')}) is missing '{field}'")
        cve = entry["cveID"]
        if not CVE_PATTERN.match(cve):
            raise FeedError(f"{where} has a malformed cveID: {cve!r}")
        for field in ("dateAdded", "dueDate"):
            if not DATE_PATTERN.match(entry[field]):
                raise FeedError(f"{cve} has a malformed {field}: {entry[field]!r}")
        if cve in seen:
            raise FeedError(f"{cve} appears more than once")
        seen.add(cve)

    if previous_count and len(entries) < previous_count * (1 - MAX_SHRINK):
        raise FeedError(
            f"catalog shrank from {previous_count} to {len(entries)} entries; "
            "that looks like a broken feed, refusing to publish"
        )
    return entries


# ---------- 3. Transform ----------

def transform(entries: list[dict]) -> list[dict]:
    """Keep only the fields the site uses, in a fixed order, newest first."""
    trimmed = []
    for entry in entries:
        item = {field: entry[field] for field in REQUIRED_FIELDS}
        for field in OPTIONAL_FIELDS:
            if field in entry and entry[field] not in (None, "", []):
                item[field] = entry[field]
        trimmed.append(item)
    # Two stable sorts: first by CVE (tie-breaker), then by date, newest first.
    trimmed.sort(key=lambda e: e["cveID"])
    trimmed.sort(key=lambda e: e["dateAdded"], reverse=True)
    return trimmed


# ---------- 4. Write ----------

def write_json_atomic(path: Path, data: object) -> None:
    """Write to a temporary file first, then swap it into place in one step,
    so a crash halfway can never leave a half-written file behind."""
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        os.chmod(tmp_name, 0o644)  # temp files start owner-only; the website must be able to read them
        os.replace(tmp_name, path)
    except BaseException:
        Path(tmp_name).unlink(missing_ok=True)
        raise


def read_previous_count(out_dir: Path) -> int | None:
    try:
        return int(json.loads((out_dir / "meta.json").read_text("utf-8"))["count"])
    except (OSError, ValueError, KeyError, TypeError):
        return None


# ---------- Main ----------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", default=PRIMARY_URL, help="URL or file to read first")
    parser.add_argument("--fallback", default=MIRROR_URL, help="URL or file to try if --source fails")
    parser.add_argument("--no-fallback", action="store_true", help="only try --source")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="folder to write the data files into")
    args = parser.parse_args(argv)

    out_dir = Path(args.out)
    previous_count = read_previous_count(out_dir)
    sources = [args.source] if args.no_fallback else [args.source, args.fallback]

    problems = []
    for source in sources:
        try:
            feed = load_feed(source)
            entries = validate(feed, previous_count)
            break
        except FeedError as err:
            problems.append(str(err))
            print(f"warning: {err}", file=sys.stderr)
    else:
        # "::error::" makes GitHub Actions show this message prominently on the run page.
        print("::error::No valid KEV feed. Nothing was changed. " + " | ".join(problems), file=sys.stderr)
        return 1

    kev = transform(entries)
    meta = {
        "catalogVersion": feed["catalogVersion"],
        "dateReleased": feed.get("dateReleased", ""),
        "count": len(kev),
    }
    status = {
        "checkedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": source,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    write_json_atomic(out_dir / "kev.json", kev)
    write_json_atomic(out_dir / "meta.json", meta)
    write_json_atomic(out_dir / "status.json", status)
    print(f"OK: catalog {meta['catalogVersion']}, {meta['count']} entries, from {source}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

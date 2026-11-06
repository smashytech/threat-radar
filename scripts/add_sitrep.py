#!/usr/bin/env python3
"""Gatekeeper for Cyber Sitrep issues on the website.

The Sitrep publisher (a scheduled AI task) copies each day's emailed Sitrep
into a small JSON file. That file is untrusted: an AI wrote it, from an email
that was itself built from web pages. This script is the ONLY thing allowed to
put an issue on the site, and it refuses anything that doesn't look exactly
right.

What it does:
  1. Validate the issue: known fields only, required fields present, real
     dates, https links only, sensible lengths, 6-10 items, 0-3 emerging.
  2. Clean up: unwrap Gmail's google.com/url?q=... redirect links, tidy
     whitespace, and detect CVE IDs itself (the AI doesn't have to).
  3. Write site/data/sitrep/<date>.json and rebuild index.json from the
     files on disk. Output is deterministic, so republishing the same issue
     changes nothing.

Usage:
  python3 scripts/add_sitrep.py issue.json      # publish one issue
  python3 scripts/add_sitrep.py --check         # validate everything stored (used in CI)

Standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from datetime import date as Date
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

DEFAULT_OUT = Path(__file__).resolve().parent.parent / "site" / "data" / "sitrep"

TOP_FIELDS = {"date": True, "tldr": True, "emerging": False, "items": True, "action": True}  # name: required
ENTRY_FIELDS = {"title": True, "description": True, "source": True, "url": True, "published": False}
LIMITS = {"tldr": (20, 1500), "action": (1, 2000), "title": (5, 300), "description": (10, 1500), "source": (1, 120)}
ITEM_COUNT = (6, 10)
EMERGING_COUNT = (0, 3)
MAX_URL = 2048

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ISSUE_FILE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\.json$")
CVE_RE = re.compile(r"\bCVE-\d{4}-\d{4,}\b", re.IGNORECASE)
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
NOTHING_TO_DO_RE = re.compile(r"^\s*nothing requiring action", re.IGNORECASE)


class IssueError(Exception):
    """Anything that means 'do not publish this'."""


# ---------- Field checks ----------

def check_date(value: object, where: str) -> str:
    if not isinstance(value, str) or not DATE_RE.match(value):
        raise IssueError(f"{where} must be a YYYY-MM-DD date, got {value!r}")
    try:
        Date.fromisoformat(value)
    except ValueError:
        raise IssueError(f"{where} is not a real calendar date: {value!r}") from None
    return value


def check_text(value: object, field: str, where: str) -> str:
    if not isinstance(value, str):
        raise IssueError(f"{where}.{field} must be text")
    if CONTROL_RE.search(value):
        raise IssueError(f"{where}.{field} contains control characters")
    text = " ".join(value.split())  # tidy whitespace: one paragraph, single spaces
    low, high = LIMITS[field]
    if not low <= len(text) <= high:
        raise IssueError(f"{where}.{field} must be {low}-{high} characters (got {len(text)})")
    return text


def unwrap_redirect(url: str) -> str:
    """Gmail rewrites links as https://www.google.com/url?q=<real link>&... Keep only the real link."""
    parts = urlsplit(url)
    if parts.hostname in ("www.google.com", "google.com") and parts.path == "/url":
        target = parse_qs(parts.query).get("q") or parse_qs(parts.query).get("url")
        if target:
            return target[0]
    return url


def check_url(value: object, where: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise IssueError(f"{where}.url is missing")
    url = unwrap_redirect(value.strip())
    if len(url) > MAX_URL or CONTROL_RE.search(url) or any(ch.isspace() for ch in url):
        raise IssueError(f"{where}.url is malformed")
    parts = urlsplit(url)
    if parts.scheme != "https":
        raise IssueError(f"{where}.url must start with https:// (got {url[:40]!r})")
    if not parts.hostname or "." not in parts.hostname:
        raise IssueError(f"{where}.url has no proper host")
    if parts.username or parts.password:
        raise IssueError(f"{where}.url must not contain credentials")
    return url


def find_cves(*texts: str) -> list[str]:
    seen: list[str] = []
    for text in texts:
        for match in CVE_RE.findall(text):
            cve = match.upper()
            if cve not in seen:
                seen.append(cve)
    return seen


# ---------- Issue validation ----------

def check_entries(value: object, kind: str, count: tuple[int, int], stored: bool) -> list[dict]:
    if not isinstance(value, list):
        raise IssueError(f"{kind} must be a list")
    if not count[0] <= len(value) <= count[1]:
        raise IssueError(f"{kind} must have {count[0]}-{count[1]} entries (got {len(value)})")
    allowed = set(ENTRY_FIELDS) | ({"cves"} if stored else set())
    clean = []
    for n, entry in enumerate(value, start=1):
        where = f"{kind}[{n}]"
        if not isinstance(entry, dict):
            raise IssueError(f"{where} must be an object")
        unknown = set(entry) - allowed
        if unknown:
            raise IssueError(f"{where} has unknown fields: {sorted(unknown)}")
        for field, required in ENTRY_FIELDS.items():
            if required and field not in entry:
                raise IssueError(f"{where} is missing '{field}'")
        item = {
            "title": check_text(entry["title"], "title", where),
            "description": check_text(entry["description"], "description", where),
            "source": check_text(entry["source"], "source", where),
            "url": check_url(entry["url"], where),
        }
        if entry.get("published") not in (None, ""):
            item["published"] = check_date(entry["published"], f"{where}.published")
        item["cves"] = find_cves(item["title"], item["description"])
        if stored and entry.get("cves") != item["cves"]:
            raise IssueError(f"{where}.cves doesn't match the text")
        clean.append(item)
    return clean


def validate_issue(data: object, stored: bool = False) -> dict:
    """Return a clean, normalized issue, or raise IssueError."""
    if not isinstance(data, dict):
        raise IssueError("issue must be a JSON object")
    unknown = set(data) - set(TOP_FIELDS)
    if unknown:
        raise IssueError(f"issue has unknown fields: {sorted(unknown)}")
    for field, required in TOP_FIELDS.items():
        if required and field not in data:
            raise IssueError(f"issue is missing '{field}'")
    return {
        "date": check_date(data["date"], "date"),
        "tldr": check_text(data["tldr"], "tldr", "issue"),
        "emerging": check_entries(data.get("emerging", []), "emerging", EMERGING_COUNT, stored),
        "items": check_entries(data["items"], "items", ITEM_COUNT, stored),
        "action": check_text(data["action"], "action", "issue"),
    }


def index_entry(issue: dict) -> dict:
    return {
        "date": issue["date"],
        "tldr": issue["tldr"],
        "items": len(issue["items"]),
        "emerging": len(issue["emerging"]),
        "actionNeeded": not NOTHING_TO_DO_RE.match(issue["action"]),
    }


# ---------- Reading & writing ----------

def to_json(data: object) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def write_atomic(path: Path, text: str) -> None:
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def load_stored(out_dir: Path) -> dict[str, dict]:
    """Read and re-validate every stored issue. Fails on stray files."""
    issues: dict[str, dict] = {}
    if not out_dir.exists():
        return issues
    for path in sorted(out_dir.iterdir()):
        if path.name == "index.json":
            continue
        if not ISSUE_FILE_RE.match(path.name):
            raise IssueError(f"unexpected file in {out_dir.name}/: {path.name}")
        try:
            data = json.loads(path.read_text("utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as err:
            raise IssueError(f"{path.name} is not valid JSON: {err}") from err
        issue = validate_issue(data, stored=True)
        if f"{issue['date']}.json" != path.name:
            raise IssueError(f"{path.name} contains the issue for {issue['date']}")
        issues[issue["date"]] = issue
    return issues


def build_index(issues: dict[str, dict]) -> dict:
    return {"issues": [index_entry(issues[d]) for d in sorted(issues, reverse=True)]}


# ---------- Commands ----------

def publish(source: Path, out_dir: Path) -> str:
    try:
        data = json.loads(source.read_text("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as err:
        raise IssueError(f"{source} is not readable JSON: {err}") from err
    issue = validate_issue(data)
    issues = load_stored(out_dir)  # also proves the existing archive is healthy
    issues[issue["date"]] = issue
    index = build_index(issues)
    # Everything validated: only now touch the disk.
    out_dir.mkdir(parents=True, exist_ok=True)
    write_atomic(out_dir / f"{issue['date']}.json", to_json(issue))
    write_atomic(out_dir / "index.json", to_json(index))
    return issue["date"]


def check(out_dir: Path) -> int:
    issues = load_stored(out_dir)
    index_path = out_dir / "index.json"
    if not issues and not index_path.exists():
        return 0
    try:
        current = json.loads(index_path.read_text("utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        raise IssueError(f"index.json is missing or invalid: {err}") from err
    if current != build_index(issues):
        raise IssueError("index.json is out of date; rebuild it with add_sitrep.py")
    return len(issues)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate and publish a Cyber Sitrep issue.")
    parser.add_argument("issue", nargs="?", help="issue JSON file to publish")
    parser.add_argument("--check", action="store_true", help="validate every stored issue and the index")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="sitrep data folder")
    args = parser.parse_args(argv)
    out_dir = Path(args.out)

    if args.check == bool(args.issue):
        parser.error("give either an issue file or --check")
    try:
        if args.check:
            count = check(out_dir)
            print(f"OK: {count} stored Sitrep issue(s) valid, index up to date")
        else:
            day = publish(Path(args.issue), out_dir)
            print(f"OK: published Sitrep {day}")
        return 0
    except IssueError as err:
        print(f"::error::Sitrep refused: {err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

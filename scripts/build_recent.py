#!/usr/bin/env python3
"""Write data/kev-recent.json: the slice of the KEV catalog the Today page needs (spec 009).

The full catalog (kev.json, about 1.4 MB) is what the Exploited page searches.
The Today page only shows this week, the last 30 days and a 12-month chart, so
it gets the entries of the last 400 days (12 months plus margin, since a deploy
can be a day old) with just the six fields it reads: about 60 KB, or roughly
10 KB once GitHub Pages compresses it. Built at every deploy, never committed.

Usage (from the repo root):  python3 scripts/build_recent.py [--data site/data] [--today YYYY-MM-DD]
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

DAYS = 400
FIELDS = ("cveID", "dateAdded", "dueDate", "vendorProject", "product", "vulnerabilityName")


def recent(entries: list[dict], today: str) -> list[dict]:
    start = (date.fromisoformat(today) - timedelta(days=DAYS - 1)).isoformat()
    return [{f: e.get(f, "") for f in FIELDS} for e in entries if str(e.get("dateAdded", "")) >= start]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data", default="site/data", help="folder holding kev.json (default: site/data)")
    parser.add_argument("--today", default=date.today().isoformat(), help="today's date, YYYY-MM-DD")
    args = parser.parse_args(argv)
    data = Path(args.data)
    try:
        entries = json.loads((data / "kev.json").read_text(encoding="utf-8"))
        if not isinstance(entries, list):
            raise ValueError("kev.json is not a list")
    except (OSError, ValueError) as err:
        print(f"Error: can't read the catalog ({err})", file=sys.stderr)
        return 2
    kept = recent(entries, args.today)
    (data / "kev-recent.json").write_text(json.dumps(kept, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote kev-recent.json: {len(kept)} of {len(entries)} entries (last {DAYS} days)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Build monthly Breach Wire statistics (spec 010).

Reads the stored, already-checked issues in site/data/breachwire/ and writes
site/data/breachwire-stats.json at deploy time. The file is derived, never
committed, and holds only numbers, the fixed sector names and group names:
no group profiles or other free text is copied (AC-5).

A month is the month the claims were posted (the issue's `window` day),
not the day the digest was sent.

Run: python3 scripts/build_breach_stats.py [--data site/data]
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import add_breachwire as bw  # noqa: E402

DEFAULT_DATA = Path(__file__).resolve().parent.parent / "site" / "data"
OUT_NAME = "breachwire-stats.json"
TOP_GROUPS = 15
ALL_SECTORS = bw.SECTORS + [bw.OTHER_SECTOR]


def display_name(key: str, spellings: Counter) -> str:
    """The alias if there is one, else the most used spelling.
    Ties: prefer a spelling that is not all capitals, then alphabetical."""
    for alias in bw.GROUP_ALIASES.values():
        if bw.group_key(alias) == key:
            return alias
    return min(spellings, key=lambda s: (-spellings[s], s.isupper(), s))


def build(issues: dict[str, dict]) -> dict:
    by_month: dict[str, list[dict]] = defaultdict(list)
    for issue in issues.values():
        by_month[issue["window"][:7]].append(issue)

    spellings: dict[str, Counter] = defaultdict(Counter)
    for issue in issues.values():
        for g in issue["groups"]:
            spellings[bw.group_key(g["name"])][g["name"]] += g["hits"]
    names = {key: display_name(key, c) for key, c in spellings.items()}

    months, seen = [], set()
    for month in sorted(by_month):
        batch = by_month[month]
        victims = sum(i["stats"]["victims"] for i in batch)
        sectors = dict.fromkeys(ALL_SECTORS, 0)
        hits: Counter = Counter()
        for i in batch:
            for s in i["sectors"]:
                sectors[s["sector"]] += s["count"]
            for g in i["groups"]:
                hits[bw.group_key(g["name"])] += g["hits"]
        ranked = sorted(hits, key=lambda k: (-hits[k], names[k].lower(), names[k]))
        new = None if not months else sorted((names[k] for k in hits if k not in seen), key=str.lower)
        seen.update(hits)
        months.append({
            "month": month,
            "days": len(batch),
            "victims": victims,
            "perDay": round(victims / len(batch), 1),
            "sweden": sum(i["sweden"] for i in batch),
            "sectors": sectors,
            "groupCount": len(hits),
            "groups": [{"name": names[k], "hits": hits[k]} for k in ranked[:TOP_GROUPS]],
            "newGroups": new,
        })

    windows = sorted(i["window"] for i in issues.values())
    return {
        "from": windows[0] if windows else None,
        "to": windows[-1] if windows else None,
        "issues": len(issues),
        "sectors": ALL_SECTORS,
        "months": months,
    }


def to_text(stats: dict) -> str:
    return json.dumps(stats, ensure_ascii=False, indent=1, sort_keys=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA, help="the site's data folder")
    args = parser.parse_args(argv)
    try:
        stats = build(bw.load_stored(args.data / "breachwire"))
    except bw.IssueError as err:
        print(f"Refused: {err}", file=sys.stderr)
        return 1
    out = args.data / OUT_NAME
    bw.write_atomic(out, to_text(stats))
    print(f"Wrote {out.name}: {stats['issues']} issues, {len(stats['months'])} months.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

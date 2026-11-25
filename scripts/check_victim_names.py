#!/usr/bin/env python3
"""Independent victim-name check for Breach Wire (spec 011).

The gatekeeper (add_breachwire.py) refuses an issue that contains a name from
the victim list the publisher bot hands in. That list comes from the same bot
we're guarding against. This check fetches the claimed victims for the issue's
days from Ransomware.live instead, a source the bot can't touch, and looks for
them in the stored issue file (exactly what gets published).

Outcomes, written to $GITHUB_OUTPUT as name_check=...:
  none   nothing changed since the last checked commit
  pass   every changed issue is clean
  held   the source couldn't be used; publish the rest, keep Breach Wire as last checked
  found  a victim name is in an issue; keep Breach Wire as last checked and fail the run

Names are never printed, written to disk or put in the report: a match is
reported as "line N" of that issue's source list (sorted, so it can be reproduced).

Run: python3 scripts/check_victim_names.py [--all]
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import add_breachwire as bw  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = "site/data/breachwire"
CHECKED_TAG = "breachwire-checked"
FALLBACK_TAG = "deployed"
SOURCE = "https://api.ransomware.live/v2/victims/{year}/{month}"
SOURCE_NAME = "Ransomware.live"
DAYS_BEFORE, DAYS_AFTER = 2, 1
TIMEOUT = 20      # seconds per call
PAUSE = 65        # the free API allows about one call a minute
MIN_SHARE = 4     # the source must list at least 1/4 as many victims as the issue for these days
USER_AGENT = "threat-radar-name-check/1 (+https://zelin.se/)"


class SourceError(Exception):
    """The source couldn't be used. Messages are fixed wording, never source data."""


# ---------- Days and months ----------

def day_range(window: str) -> tuple[date, date]:
    day = date.fromisoformat(window)
    return day - timedelta(days=DAYS_BEFORE), day + timedelta(days=DAYS_AFTER)


def months_for(start: date, end: date) -> list[tuple[int, int]]:
    months, day = [], start
    while day <= end:
        if (day.year, day.month) not in months:
            months.append((day.year, day.month))
        day += timedelta(days=1)
    return months


# ---------- The source ----------

def fetch_json(url: str) -> object:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return json.loads(response.read(20_000_000).decode("utf-8"))
    except urllib.error.HTTPError as err:
        raise SourceError(f"the source answered HTTP {err.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise SourceError("the source could not be reached") from None
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise SourceError("the source did not return JSON") from None


def parse_source(data: object) -> list[tuple[str, str, str]]:
    """The month listing → (victim name, domain, day). Refuses anything else."""
    if not isinstance(data, list):
        raise SourceError("the source returned something that isn't a victim list")
    rows = []
    for item in data:
        if not isinstance(item, dict):
            raise SourceError("the source returned something that isn't a victim list")
        name, day = item.get("victim"), item.get("discovered")
        domain = item.get("domain") if isinstance(item.get("domain"), str) else ""
        if isinstance(name, str) and isinstance(day, str) and len(day) >= 10:
            rows.append((name.strip(), domain.strip(), day[:10]))
    if data and len(rows) < len(data) / 2:
        raise SourceError("the source's victim list has an unexpected shape")
    return rows


def rows_in_range(rows, start: date, end: date) -> list[tuple[str, str, str]]:
    lo, hi = start.isoformat(), end.isoformat()
    return [r for r in rows if lo <= r[2] <= hi]


def names_in_range(rows, start: date, end: date) -> list[str]:
    """Names and domains of victims posted in [start, end], one per spelling, sorted."""
    names = {}
    for name, domain, _ in rows_in_range(rows, start, end):
        for n in (name, domain):
            if n:
                names.setdefault(bw.normalize(n), n)
    return [names[k] for k in sorted(names)]


# ---------- Matching ----------

def vocabulary(issue: dict) -> set[str]:
    """Words that belong in an issue: group, country, region and sector names."""
    words = [g["name"] for g in issue["groups"]] + [r["region"] for r in issue["regions"]]
    words += [c["country"] for r in issue["regions"] for c in r["countries"]] + [s["sector"] for s in issue["sectors"]]
    return {bw.normalize(w) for w in words}


def _haystack(issue: dict) -> str:
    return f" {bw.normalize(json.dumps(issue, ensure_ascii=False))} "


def where(value: object, needle: str, path: str = "") -> list[str]:
    """Paths of the fields whose text contains the needle, e.g. "groups[2].profile".
    Built from the issue's own field names and positions only, never from the text."""
    if isinstance(value, dict):
        return [p for k, v in value.items() for p in where(v, needle, f"{path}.{k}" if path else k)]
    if isinstance(value, list):
        return [p for i, v in enumerate(value) for p in where(v, needle, f"{path}[{i}]")]
    if isinstance(value, str) and f" {needle} " in f" {bw.normalize(value)} ":
        return [path]
    return []


MAX_DETAILS = 5

# Owner's decision 2026-11-25 (spec 011, change during build): the source lists masked
# posts and descriptions as "victims". These are skipped and counted, never matched.
PLACEHOLDER_WORDS = {
    "company", "victim", "client", "target", "organisation", "organization", "org", "entity",
    "name", "upcoming", "coming", "soon", "unknown", "undisclosed", "disclosed", "not", "redacted",
    "hidden", "masked", "anonymous", "confidential", "private", "pending", "tba", "tbd", "n", "a", "new",
}
DESCRIPTION_MIN_WORDS = 4


def placeholder(needle: str, vocab: set[str]) -> bool:
    """True for source 'names' that aren't names: part of an issue word ("disclosed" in
    "Not disclosed"), a masked placeholder ("Company #243", "Name upcoming"), or a
    description ("An independent ... firm in ...": starts with a/an, 4+ words)."""
    words = needle.split()
    padded = f" {needle} "
    if any(padded in f" {phrase} " for phrase in vocab):
        return True
    if all(w in PLACEHOLDER_WORDS or w.isdigit() for w in words):
        return True
    return words[0] in ("a", "an") and len(words) >= DESCRIPTION_MIN_WORDS


def check_issue(issue: dict, names: list[str], others: list[str] = ()) -> dict:
    """`others`: the other stored issues' text, to tell how common a matched word is.
    A match is described by line number, field, word count and length: never the name."""
    haystack = _haystack(issue)
    vocab = vocabulary(issue)
    result = {"date": issue["date"], "outcome": "pass", "checked": 0, "skipped": 0, "placeholders": 0}
    matches = []
    for line, name in enumerate(names, start=1):
        needle = bw.normalize(name)
        if len(needle) < bw.MIN_NAME_CHARS:
            continue
        if needle in vocab:
            result["skipped"] += 1
            continue
        if placeholder(needle, vocab):
            result["placeholders"] += 1
            continue
        result["checked"] += 1
        if f" {needle} " in haystack:
            matches.append({"line": line, "where": where(issue, needle)[:3], "words": len(needle.split()),
                            "chars": len(needle), "inOtherIssues": sum(f" {needle} " in o for o in others)})
    if matches:
        result["outcome"], result["line"] = "found", matches[0]["line"]
        result["matches"] = len(matches)
        result["details"] = matches[:MAX_DETAILS]
    return result


def run(issues: list[dict], fetch=fetch_json, sleep=time.sleep, corpus: dict[str, str] | None = None) -> dict:
    """`corpus`: date → text of every stored issue (for how common a matched word is)."""
    corpus = corpus or {}
    report = {"source": SOURCE_NAME, "outcome": "none", "reason": None, "issues": []}
    months: dict[tuple[int, int], list] = {}
    calls = 0
    for issue in sorted(issues, key=lambda i: i["date"]):
        if report["reason"]:  # the source already failed this run: don't call it again
            report["issues"].append({"date": issue["date"], "outcome": "held"})
            continue
        start, end = day_range(issue["window"])
        try:
            rows = []
            for ym in months_for(start, end):
                if ym not in months:
                    if calls:
                        sleep(PAUSE)
                    calls += 1
                    months[ym] = parse_source(fetch(SOURCE.format(year=ym[0], month=f"{ym[1]:02d}")))
                rows += months[ym]
            in_range = rows_in_range(rows, start, end)
            if len(in_range) < max(1, issue["stats"]["victims"] // MIN_SHARE):
                raise SourceError(f"the source lists too few victims for these days ({len(in_range)})")
        except SourceError as err:
            report["reason"] = str(err)
            report["issues"].append({"date": issue["date"], "outcome": "held"})
            continue
        others = [text for day, text in corpus.items() if day != issue["date"]]
        report["issues"].append(check_issue(issue, names_in_range(rows, start, end), others))
    outcomes = {i["outcome"] for i in report["issues"]}
    report["outcome"] = "found" if "found" in outcomes else "held" if "held" in outcomes else "pass" if outcomes else "none"
    return report


# ---------- Git ----------

def _git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout


def _has_tag(repo: Path, tag: str) -> bool:
    return subprocess.run(["git", "-C", str(repo), "rev-parse", "-q", "--verify", f"refs/tags/{tag}"],
                          capture_output=True).returncode == 0


def changed_files(repo: Path, everything: bool = False) -> list[str]:
    """Issue files added or changed since the last checked commit (all of them without the tag)."""
    folder = repo / DATA
    present = sorted(p.name for p in folder.iterdir() if bw.ISSUE_FILE_RE.match(p.name)) if folder.exists() else []
    if everything or not _has_tag(repo, CHECKED_TAG):
        return present
    diff = _git(repo, "diff", "--name-only", f"{CHECKED_TAG}^{{commit}}", "HEAD", "--", DATA).split()
    changed = {Path(f).name for f in diff}
    return [name for name in present if name in changed]


def restore_point(repo: Path) -> str:
    """Where held-back Breach Wire data is restored from: the last checked data, else the live data."""
    for tag in (CHECKED_TAG, FALLBACK_TAG):
        if _has_tag(repo, tag):
            return tag
    return ""


# ---------- Command line ----------

def main(argv: list[str] | None = None, fetch=fetch_json, sleep=time.sleep, env: dict | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--repo", type=Path, default=ROOT)
    parser.add_argument("--all", action="store_true", help="check every stored issue, not only the changed ones")
    args = parser.parse_args(argv)
    env = os.environ if env is None else env

    files = changed_files(args.repo, args.all)
    issues = [bw.validate_issue(json.loads((args.repo / DATA / f).read_text("utf-8"))) for f in files]
    stored = bw.load_stored(args.repo / DATA)
    report = run(issues, fetch, sleep, {day: _haystack(i) for day, i in stored.items()})

    print(f"Victim-name check against {SOURCE_NAME}: {report['outcome']} ({len(issues)} issue(s) to check)")
    for i in report["issues"]:
        detail = (f"{i.get('checked', 0)} names checked, {i.get('skipped', 0)} skipped as issue words, "
                  f"{i.get('placeholders', 0)} placeholders") if "checked" in i else ""
        if i["outcome"] == "found":
            detail += f"; {i['matches']} match(es)"
        print(f"  {i['date']}: {i['outcome']}" + (f" ({detail})" if detail else ""))
        for m in i.get("details", []):
            print(f"      line {m['line']}: {m['words']} word(s), {m['chars']} characters, in {', '.join(m['where'])}; "
                  f"the same text is in {m['inOtherIssues']} other issue(s)")
    if report["reason"]:
        print(f"  Held back because {report['reason']}.")
    if report["outcome"] == "found":
        print("::error::A victim name from the source list appears in a Breach Wire issue. "
              "Breach Wire is held back; see SECURITY.md, 'A victim name reached the repository'.")
    elif report["outcome"] == "held":
        print(f"::warning::Breach Wire held back: {report['reason']}. The next run tries again.")

    if env.get("GITHUB_OUTPUT"):
        with open(env["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
            out.write(f"name_check={report['outcome']}\n")
            out.write(f"name_check_restore={restore_point(args.repo)}\n")
            out.write(f"name_check_report={json.dumps(report, separators=(',', ':'))}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

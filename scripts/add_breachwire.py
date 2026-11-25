#!/usr/bin/env python3
"""Gatekeeper for Breach Wire issues on the website (spec 003).

The publisher (a scheduled AI task) turns each emailed Breach Wire issue into
a JSON file of STATISTICS and THREAT-GROUP intelligence only. Victim names
must never reach the site, so this script:

  1. Validates the structure: known fields only, real dates, sane numbers,
     length limits, no links or domain names anywhere.
  2. Checks the numbers add up: country, sector and group totals all equal the
     victim count; victims + masked + reposts + non-victims = merged records;
     the Sweden count matches the regions.
  3. Runs the NAME GUARD: --forbid points to a throwaway file listing that
     issue's victim names (never committed). If any of those names appears
     anywhere in the issue, the whole issue is refused.
  4. Writes site/data/breachwire/<date>.json and rebuilds index.json.

Usage:
  python3 scripts/add_breachwire.py issue.json --forbid /tmp/bw-victims.txt
  python3 scripts/add_breachwire.py --check        # validate everything stored (CI)
  python3 scripts/add_breachwire.py --rebuild      # re-apply the sector and group rules to stored issues

Spec 010: sector labels are mapped onto a fixed list of 17 sectors (+ Other),
and group names are cleaned up, so statistics over time count like with like.

Standard library only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from datetime import date as Date
from pathlib import Path

from add_sitrep import CONTROL_RE, ISSUE_FILE_RE, IssueError, check_date, to_json, write_atomic

DEFAULT_OUT = Path(__file__).resolve().parent.parent / "site" / "data" / "breachwire"

REGIONS = {"North America", "Europe", "Middle East", "Africa", "Latin America & Caribbean", "Asia", "Oceania", "Unattributed"}
UNATTRIBUTED = "Unattributed"
MAX_COUNT = 100_000
MIN_NAME_CHARS = 4  # shorter names (e.g. "Q3") would cause false alarms
MAX_RAW_SECTORS = 1_000  # sanity cap on the list as it arrives, before mapping
OTHER_SECTOR = "Other"

# Links and domain names are never allowed: no leak-site addresses, no (masked) victim domains.
LINK_RE = re.compile(
    r"https?://|www\.|\b[\w*-]+\.(?:com|net|org|io|onion|info|biz|co|cc|to|ru|su|me|top|xyz|site|online|cloud|app|dev|tech|ai|se|uk|de|fr|br|vn|cn|in|jp|au|ca|us|eu)\b",
    re.IGNORECASE,
)


# ---------- Small checks ----------

def check_int(value: object, where: str, low: int = 0, high: int = MAX_COUNT) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise IssueError(f"{where} must be a whole number {low}-{high}, got {value!r}")
    return value


def check_bool(value: object, where: str) -> bool:
    if not isinstance(value, bool):
        raise IssueError(f"{where} must be true or false")
    return value


def check_str(value: object, where: str, low: int, high: int) -> str:
    if not isinstance(value, str):
        raise IssueError(f"{where} must be text")
    if CONTROL_RE.search(value):
        raise IssueError(f"{where} contains control characters")
    text = " ".join(value.split())
    if not low <= len(text) <= high:
        raise IssueError(f"{where} must be {low}-{high} characters (got {len(text)})")
    if LINK_RE.search(text):
        raise IssueError(f"{where} contains a link or domain name, which is never allowed")
    return text


def check_keys(obj: object, where: str, required: set[str], optional: set[str] = frozenset()) -> dict:
    if not isinstance(obj, dict):
        raise IssueError(f"{where} must be an object")
    unknown = set(obj) - required - set(optional)
    if unknown:
        raise IssueError(f"{where} has unknown fields: {sorted(unknown)}")
    missing = required - set(obj)
    if missing:
        raise IssueError(f"{where} is missing: {sorted(missing)}")
    return obj


def check_list(value: object, where: str, high: int) -> list:
    if not isinstance(value, list) or len(value) > high:
        raise IssueError(f"{where} must be a list of at most {high} entries")
    return value


# ---------- Sectors (spec 010) ----------
#
# The fixed list. A label the publisher copies from the email ("Biopharmaceutical",
# "Telecom / ISP", "Sector not disclosed"...) is matched against SECTOR_RULES in
# order; the FIRST rule that matches wins, so the order matters ("Advertising
# technology" must reach Professional services before Technology & telecom, and
# "Hospitality" must not be caught by "hospital"). Only the label's main part,
# the text before " / ", is used. Anything no rule recognises counts as Other and
# is printed, so a new sector or rule can be added on purpose (a small-change
# amendment to spec 010) and re-applied with --rebuild.

SECTORS = [
    "Manufacturing & industrial", "Healthcare & life sciences", "Professional services",
    "Retail & e-commerce", "Technology & telecom", "Financial services & insurance", "Education",
    "Transportation & logistics", "Construction & real estate", "Government & public sector",
    "Energy, utilities & resources", "Food & agriculture", "Hospitality & leisure",
    "Media & publishing", "Wholesale & distribution", "Non-profit & associations", "Not disclosed",
]

SECTOR_RULES = [(sector, re.compile(pattern, re.IGNORECASE)) for sector, pattern in [
    ("Not disclosed", r"^(sector )?not (disclosed|stated|known|specified)|^unknown|^undisclosed|^n/?a$"),
    ("Healthcare & life sciences", r"health|medical|\bhospitals?\b|clinic|pharma|biotech|biopharm|life.?science|senior living|dental|care home"),
    ("Financial services & insurance", r"financ|bank|insur|invest|fintech|\bdebt\b|credit|wealth|payment"),
    ("Education", r"educat|school|universit|college|academ"),
    ("Non-profit & associations", r"non.?profit|charit|\bunion\b|association|membership|church|religio|\bngo\b|sports governance"),
    ("Professional services", r"professional|advertis|marketing|audience measurement|market research|\blegal\b|\blaw\b|consult"
                              r"|accounting|engineering|recruit|staffing|security services|business services|service provider"),
    ("Energy, utilities & resources", r"energy|utilit|\boil\b|\bgas\b|mining|chemical|environmental|\bwaste\b|\bwater\b"),
    ("Construction & real estate", r"construct|real estate|property|building|\bhvac\b|architect|housing"),
    ("Transportation & logistics", r"transport|logistic|shipping|freight|airline|aviation|\bbus\b|\brail|trucking|maritime"),
    ("Food & agriculture", r"\bfood|agricultur|\bfarm|beverage|dairy|seafood"),
    ("Wholesale & distribution", r"wholesale|distribut|dealer"),
    ("Manufacturing & industrial", r"manufactur|industrial|aerospace|automotive|textile|factory"),
    ("Government & public sector", r"government|municipal|public sector|public administration|\bcounty\b"),
    ("Media & publishing", r"\bmedia\b|publish|broadcast|\bnews|\btv\b|\bradio\b|\bfilm"),
    ("Hospitality & leisure", r"hospitality|hotel|restaurant|leisure|fitness|gaming|casino|\bsports?\b|entertainment|travel|touris|stage equipment"),
    ("Technology & telecom", r"technolog|software|\bit\b|saas|cloud|telecom|\bisp\b|\bdata\b|cyber|\bemail|internet|\btech\b|digital"),
    ("Retail & e-commerce", r"retail|e-?commerce|\bshops?\b|\bstores?\b|fashion|apparel|footwear|athleisure|grocer|supermarket"
                            r"|jewel|eyewear|consumer goods|consumer electronics|golf equipment|sporting goods|franchise"),
]]
assert {sector for sector, _ in SECTOR_RULES} == set(SECTORS)


def map_sector(label: str) -> str:
    """The fixed sector for a label from the email, or Other."""
    main = label.split(" / ")[0]
    for sector, pattern in SECTOR_RULES:
        if pattern.search(main):
            return sector
    return OTHER_SECTOR


def unmapped_labels(sectors: list[dict]) -> list[str]:
    """Labels that land in Other only because no rule knows them (not a literal "Other" or "Mixed")."""
    return sorted({s["sector"] for s in sectors
                   if map_sector(s["sector"]) == OTHER_SECTOR and s["sector"].lower() not in {"other", "mixed"}})


def sort_sectors(sectors: list[dict]) -> list[dict]:
    """Biggest first; ties in alphabetical order, so the result is always the same."""
    return sorted(sectors, key=lambda x: (-x["count"], x["sector"]))


def merge_sectors(sectors: list[dict]) -> list[dict]:
    """Map every label onto the fixed list and add up counts that land on the same sector."""
    totals: dict[str, int] = {}
    for s in sectors:
        sector = map_sector(s["sector"])
        totals[sector] = totals.get(sector, 0) + s["count"]
    return sort_sectors([{"sector": sector, "count": count} for sector, count in totals.items()])


# ---------- Group names (spec 010) ----------
#
# The same gang arrives as "The Gentlemen" and "THE GENTLEMEN", "Brain Cipher" and
# "BrainCipher". group_key() ignores case, spaces and punctuation, so statistics
# count them once. GROUP_ALIASES fixes the stored spelling where the gang's own
# name is known to differ from the most common spelling in the digests.

GROUP_ALIASES = {
    "incransom": "INC Ransom",
}


def group_key(name: str) -> str:
    folded = unicodedata.normalize("NFKD", name)
    return "".join(ch for ch in folded.lower() if ch.isalnum())


# ---------- Validation ----------

def validate_issue(data: object) -> dict:
    top = check_keys(data, "issue", {"date", "issue", "window", "stats", "sweden", "regions", "sectors",
                                     "groups", "quality", "health", "lateToPress"})
    day = check_date(top["date"], "date")
    window = check_date(top["window"], "window")
    gap = (Date.fromisoformat(day) - Date.fromisoformat(window)).days
    if not 1 <= gap <= 8:
        raise IssueError(f"window {window} must be 1-8 days before the issue date {day}")

    s = check_keys(top["stats"], "stats", {"victims", "groups", "countries", "regions"})
    stats = {k: check_int(s[k], f"stats.{k}") for k in ("victims", "groups", "countries", "regions")}

    regions = []
    for n, r in enumerate(check_list(top["regions"], "regions", 8), 1):
        r = check_keys(r, f"regions[{n}]", {"region", "countries"})
        if r["region"] not in REGIONS:
            raise IssueError(f"regions[{n}].region {r['region']!r} is not a known region")
        countries = []
        for m, c in enumerate(check_list(r["countries"], f"regions[{n}].countries", 80), 1):
            where = f"regions[{n}].countries[{m}]"
            c = check_keys(c, where, {"country", "flag", "count"})
            countries.append({
                "country": check_str(c["country"], f"{where}.country", 2, 60),
                "flag": check_str(c["flag"], f"{where}.flag", 1, 16),
                "count": check_int(c["count"], f"{where}.count", 1),
            })
        if not countries:
            raise IssueError(f"regions[{n}] has no countries")
        regions.append({"region": r["region"], "countries": countries})

    sectors = []
    for n, x in enumerate(check_list(top["sectors"], "sectors", MAX_RAW_SECTORS), 1):
        x = check_keys(x, f"sectors[{n}]", {"sector", "count"})
        sectors.append({"sector": check_str(x["sector"], f"sectors[{n}].sector", 2, 80),
                        "count": check_int(x["count"], f"sectors[{n}].count", 1)})
    sectors = merge_sectors(sectors)

    groups = []
    for n, g in enumerate(check_list(top["groups"], "groups", 120), 1):
        where = f"groups[{n}]"
        g = check_keys(g, where, {"name", "hits", "profile", "countries", "sectors"})
        name = check_str(g["name"], f"{where}.name", 1, 60)
        groups.append({
            "name": GROUP_ALIASES.get(group_key(name), name),
            "hits": check_int(g["hits"], f"{where}.hits", 1),
            "profile": check_str(g["profile"], f"{where}.profile", 0, 900),
            "countries": check_str(g["countries"], f"{where}.countries", 0, 200),
            "sectors": check_str(g["sectors"], f"{where}.sectors", 0, 200),
        })
    keys = [group_key(g["name"]) for g in groups]
    if len(set(keys)) != len(keys):
        raise IssueError("a group is listed twice under different spellings; merge the rows and recount stats.groups")
    groups.sort(key=lambda g: g["name"].lower())
    groups.sort(key=lambda g: g["hits"], reverse=True)

    q = check_keys(top["quality"], "quality", {"singleSourced", "claimOnly", "sourcesDisagree", "newGroups"})
    quality = {k: check_int(q[k], f"quality.{k}") for k in ("singleSourced", "claimOnly", "sourcesDisagree", "newGroups")}

    h = check_keys(top["health"], "health", {"sources", "merged", "masked", "reposts", "nonVictims", "lowCoverage"})
    sources = []
    for n, src in enumerate(check_list(h["sources"], "health.sources", 4), 1):
        src = check_keys(src, f"health.sources[{n}]", {"source", "ok", "records"})
        sources.append({"source": check_str(src["source"], f"health.sources[{n}].source", 2, 40),
                        "ok": check_bool(src["ok"], f"health.sources[{n}].ok"),
                        "records": check_int(src["records"], f"health.sources[{n}].records")})
    if not sources:
        raise IssueError("health.sources is empty")
    health = {"sources": sources,
              **{k: check_int(h[k], f"health.{k}") for k in ("merged", "masked", "reposts", "nonVictims")},
              "lowCoverage": check_bool(h["lowCoverage"], "health.lowCoverage")}

    issue = {
        "date": day, "issue": check_int(top["issue"], "issue", 1), "window": window, "stats": stats,
        "sweden": check_int(top["sweden"], "sweden"), "regions": regions, "sectors": sectors, "groups": groups,
        "quality": quality, "health": health, "lateToPress": check_int(top["lateToPress"], "lateToPress"),
    }
    check_consistency(issue)
    return issue


def check_consistency(issue: dict) -> None:
    """The numbers must add up (spec 003 FR-4)."""
    s = issue["stats"]
    victims = s["victims"]
    all_countries = [c for r in issue["regions"] for c in r["countries"]]
    named = [c for r in issue["regions"] if r["region"] != UNATTRIBUTED for c in r["countries"]]
    rules = [
        (sum(c["count"] for c in all_countries) == victims, "country counts don't add up to stats.victims"),
        (sum(x["count"] for x in issue["sectors"]) == victims, "sector counts don't add up to stats.victims"),
        (sum(g["hits"] for g in issue["groups"]) == victims, "group postings don't add up to stats.victims"),
        (len(issue["groups"]) == s["groups"], "number of groups doesn't match stats.groups"),
        (len(named) == s["countries"], "number of named countries doesn't match stats.countries"),
        (sum(1 for r in issue["regions"] if r["region"] != UNATTRIBUTED) == s["regions"], "number of regions doesn't match stats.regions"),
        (sum(c["count"] for c in all_countries if c["country"].lower() == "sweden") == issue["sweden"], "sweden doesn't match the Sweden count in regions"),
        (victims + issue["health"]["masked"] + issue["health"]["reposts"] + issue["health"]["nonVictims"] == issue["health"]["merged"],
         "reconciliation fails: victims + masked + reposts + nonVictims must equal merged"),
        (all(v <= victims for k, v in issue["quality"].items() if k != "newGroups"), "a quality count exceeds the number of victims"),
        (issue["quality"]["newGroups"] <= s["groups"], "quality.newGroups exceeds the number of groups"),
    ]
    for ok, message in rules:
        if not ok:
            raise IssueError(message)


# ---------- The name guard ----------

def normalize(text: str) -> str:
    """Lowercase, strip accents, turn punctuation into spaces, single-space."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    return " ".join(re.sub(r"[\W_]+", " ", text).split())


def load_names(path: Path) -> list[str]:
    try:
        lines = path.read_text("utf-8").splitlines()
    except (OSError, UnicodeDecodeError) as err:
        raise IssueError(f"cannot read the victim-name list {path}: {err}") from err
    return [line.strip() for line in lines if line.strip()]


def name_guard(issue: dict, names: list[str], raw: object = None) -> None:
    """Refuse the issue if any victim name appears in it. `raw` is the publisher's
    input as it arrived: sector labels are mapped onto fixed sectors (spec 010),
    so a name used as a label would otherwise vanish quietly instead of being caught."""
    if len(names) < issue["stats"]["victims"]:
        raise IssueError(f"the victim-name list has {len(names)} names but the issue has "
                         f"{issue['stats']['victims']} victims; every victim must be listed")
    haystack = f" {normalize(json.dumps(issue, ensure_ascii=False))} {normalize(json.dumps(raw, ensure_ascii=False))} "
    for name in names:
        needle = normalize(name)
        if len(needle) >= MIN_NAME_CHARS and f" {needle} " in haystack:
            # Never echo the name itself into logs: say which line matched.
            raise IssueError(f"a victim name (line {names.index(name) + 1} of the list) appears in the issue; refusing to publish")


# ---------- Storage ----------

def index_entry(issue: dict) -> dict:
    return {"date": issue["date"], "issue": issue["issue"], "window": issue["window"],
            "victims": issue["stats"]["victims"], "groups": issue["stats"]["groups"],
            "countries": issue["stats"]["countries"], "sweden": issue["sweden"]}


def load_stored(out_dir: Path) -> dict[str, dict]:
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
        issue = validate_issue(data)
        if f"{issue['date']}.json" != path.name:
            raise IssueError(f"{path.name} contains the issue for {issue['date']}")
        issues[issue["date"]] = issue
    return issues


def build_index(issues: dict[str, dict]) -> dict:
    return {"issues": [index_entry(issues[d]) for d in sorted(issues, reverse=True)]}


def publish(source: Path, forbid: Path, out_dir: Path) -> str:
    try:
        data = json.loads(source.read_text("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as err:
        raise IssueError(f"{source} is not readable JSON: {err}") from err
    issue = validate_issue(data)
    name_guard(issue, load_names(forbid), raw=data)
    unknown = unmapped_labels(data["sectors"])
    if unknown:
        print("Sector labels no rule recognises (counted as Other): " + "; ".join(unknown))
    issues = load_stored(out_dir)
    issues[issue["date"]] = issue
    index = build_index(issues)
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
        raise IssueError("index.json is out of date; rebuild it with add_breachwire.py")
    for day, issue in issues.items():
        if (out_dir / f"{day}.json").read_text("utf-8") != to_json(issue):
            raise IssueError(f"{day}.json is not in its cleaned-up form; run add_breachwire.py --rebuild")
    return len(issues)


def rebuild(out_dir: Path) -> int:
    """Re-run the current rules (sector mapping, group names) over every stored issue.

    Only reshapes what is already stored and already passed the name guard;
    every check still runs, and totals are unchanged.
    """
    issues = load_stored(out_dir)
    for day, issue in issues.items():
        write_atomic(out_dir / f"{day}.json", to_json(issue))
    if issues:
        write_atomic(out_dir / "index.json", to_json(build_index(issues)))
    return len(issues)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate and publish a Breach Wire issue (stats only).")
    parser.add_argument("issue", nargs="?", help="issue JSON file to publish")
    parser.add_argument("--forbid", help="file with that issue's victim names, one per line (required to publish)")
    parser.add_argument("--check", action="store_true", help="validate every stored issue and the index")
    parser.add_argument("--rebuild", action="store_true", help="re-apply the current rules to every stored issue")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="breachwire data folder")
    args = parser.parse_args(argv)

    if sum([args.check, args.rebuild, bool(args.issue)]) != 1:
        parser.error("give exactly one of: an issue file, --check, --rebuild")
    try:
        if args.rebuild:
            print(f"OK: rebuilt {rebuild(Path(args.out))} stored Breach Wire issue(s)")
        elif args.check:
            print(f"OK: {check(Path(args.out))} stored Breach Wire issue(s) valid, index up to date")
        else:
            if not args.forbid:
                raise IssueError("--forbid <victim-name list> is required to publish")
            print(f"OK: published Breach Wire {publish(Path(args.issue), Path(args.forbid), Path(args.out))}")
        return 0
    except IssueError as err:
        print(f"::error::Breach Wire refused: {err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

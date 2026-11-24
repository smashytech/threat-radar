#!/usr/bin/env python3
"""The deploy gate (spec 008): checks what is about to go live.

Every push to this repo arrives as the same GitHub account, whether it came
from the owner, the builder or one of the publisher bots (the scheduled tasks
that write the Sitrep and Breach Wire from outside sources). So GitHub can't
tell them apart, and this gate does the telling instead. It compares the
commit being deployed with the last deployed one (git tag "deployed"):

  1. Lanes: a publisher commit ("sitrep: …", "breachwire: …", "data: …") may
     only change its own data. Anything else stops the deploy.
  2. Rules: if a gatekeeper script changed since the last deploy, every issue
     must ALSO pass the previous rules, unless the run was started by hand
     with "accept rule change". (The current rules are checked by the tests
     step, as before.)
  3. Code: anything changed outside site/data/ is listed, so Slack can say so.

A stopped commit stays between "deployed" and the newest commit even after it
is reverted, so the way out is deliberate: a manual run with "approve
publisher commits", after the owner has looked at what happened.

Usage (from the repo root, in the workflow):
    python3 scripts/deploy_gate.py [--accept-rule-change] [--approve-publisher-commits]
Writes the report as `gate_report=<json>` to $GITHUB_OUTPUT and exits 1 if the
deploy must stop. The report holds commit titles and file names only.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath

DEPLOYED_TAG = "deployed"
MAX_LISTED = 20

# Publisher lanes: commit title prefix → what that publisher may change.
LANES = {
    "sitrep": {"prefix": "sitrep:", "dirs": ["site/data/sitrep/"], "files": []},
    "breachwire": {"prefix": "breachwire:", "dirs": ["site/data/breachwire/"], "files": []},
    "kev": {"prefix": "data:", "dirs": [], "files": ["site/data/kev.json", "site/data/meta.json", "site/data/status.json"]},
}

# Gatekeepers checked against their previous version when they change.
# "files" are fetched together, since add_breachwire.py imports add_sitrep.py.
GATEKEEPERS = [
    {"name": "breachwire", "script": "add_breachwire.py", "files": ["scripts/add_breachwire.py", "scripts/add_sitrep.py"], "data": "site/data/breachwire"},
    {"name": "sitrep", "script": "add_sitrep.py", "files": ["scripts/add_sitrep.py"], "data": "site/data/sitrep"},
]


# ---------- Pure parts (no git) ----------

def lane_for(subject: str) -> str | None:
    for name, lane in LANES.items():
        if subject.startswith(lane["prefix"]):
            return name
    return None


def _in_lane(path: str, lane: dict) -> bool:
    if ".." in PurePosixPath(path).parts:
        return False
    return path in lane["files"] or any(path.startswith(d) for d in lane["dirs"])


def lane_violations(commits: list[dict]) -> list[dict]:
    """Publisher commits that changed something outside their own data."""
    found = []
    for c in commits:
        lane = lane_for(c["subject"])
        if lane is None:
            continue
        outside = sorted(f for f in c["files"] if not _in_lane(f, LANES[lane]))
        if outside:
            found.append({"sha": c["sha"][:7], "subject": c["subject"][:120], "lane": lane, "files": outside[:MAX_LISTED]})
    return found


def outside_data(files: list[str]) -> list[str]:
    return sorted(f for f in files if not f.startswith("site/data/"))


# ---------- Git ----------

def _git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout


def _has_tag(repo: Path, tag: str) -> bool:
    return subprocess.run(["git", "-C", str(repo), "rev-parse", "-q", "--verify", f"refs/tags/{tag}"],
                          capture_output=True).returncode == 0


def _commits(repo: Path, base: str) -> list[dict]:
    commits = []
    for sha in _git(repo, "rev-list", "--reverse", f"{base}..HEAD").split():
        subject = _git(repo, "log", "-1", "--format=%s", sha).strip()
        parents = _git(repo, "rev-list", "--parents", "-n", "1", sha).split()[1:]
        # A merge is compared with its first parent: what the merge brought in.
        files = _git(repo, "diff", "--name-only", parents[0], sha).split() if parents else \
            _git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "--root", sha).split()
        commits.append({"sha": sha, "subject": subject, "files": files})
    return commits


def _old_rules_pass(repo: Path, base: str, keeper: dict) -> tuple[bool, str]:
    """Run the gatekeeper as it was at the last deploy, from a fresh empty folder."""
    with tempfile.TemporaryDirectory() as tmp:
        for f in keeper["files"]:
            try:
                text = _git(repo, "show", f"{base}:{f}")
            except subprocess.CalledProcessError:
                return True, f"{f} did not exist at the last deploy"
            (Path(tmp) / PurePosixPath(f).name).write_text(text, encoding="utf-8")
        # -E -s: ignore PYTHON* variables and user site-packages. The fresh folder
        # holds only the old gatekeeper files, so nothing planted can be imported.
        done = subprocess.run([sys.executable, "-E", "-s", str(Path(tmp) / keeper["script"]),
                               "--check", "--out", str(repo / keeper["data"])],
                              capture_output=True, text=True, cwd=tmp, timeout=60)
        return done.returncode == 0, (done.stdout + done.stderr)[-2000:]


def run(repo: Path, accept_rule_change: bool = False, approve_publisher_commits: bool = False) -> dict:
    repo = Path(repo)
    head = _git(repo, "rev-parse", "HEAD").strip()
    report = {"ok": True, "first_run": False, "base": None, "head": head[:7], "lane_violations": [],
              "rules_changed": [], "rule_failures": [], "accepted_rule_change": False, "approved_publisher_commits": False,
              "code_changes": {"files": [], "commits": []}}
    if not _has_tag(repo, DEPLOYED_TAG):
        report["first_run"] = True
        return report
    base = _git(repo, "rev-parse", f"{DEPLOYED_TAG}^{{commit}}").strip()
    report["base"] = base[:7]

    commits = _commits(repo, base)
    report["lane_violations"] = lane_violations(commits)

    changed = _git(repo, "diff", "--name-only", base, "HEAD").split()
    for keeper in GATEKEEPERS:
        if any(f in changed for f in keeper["files"]):
            report["rules_changed"].append(keeper["name"])
            passed, output = _old_rules_pass(repo, base, keeper)
            if not passed:
                print(f"[{keeper['name']}] data fails the rules from the last deploy:\n{output}")
                if accept_rule_change:
                    report["accepted_rule_change"] = True
                else:
                    report["rule_failures"].append({"gatekeeper": keeper["name"]})
    report["rules_changed"].sort()

    code = outside_data(changed)
    report["code_changes"]["files"] = code[:MAX_LISTED]
    if len(code) > MAX_LISTED:
        report["code_changes"]["more_files"] = len(code) - MAX_LISTED
    if code:
        report["code_changes"]["commits"] = [c["subject"][:120] for c in commits if outside_data(c["files"])][:MAX_LISTED]

    if report["lane_violations"] and approve_publisher_commits:
        report["approved_publisher_commits"] = True
    report["ok"] = (not report["lane_violations"] or approve_publisher_commits) and not report["rule_failures"]
    return report


def explain(report: dict) -> str:
    if report["first_run"]:
        return "First run: no earlier deploy to compare with. The 'deployed' tag will be set after this deploy."
    lines = [f"Comparing {report['base']} (last deploy) with {report['head']}."]
    for v in report["lane_violations"]:
        verdict = "APPROVED" if report["approved_publisher_commits"] else "STOP"
        lines.append(f"{verdict}: {v['sha']} '{v['subject']}' is a {v['lane']} publisher commit but changes: {', '.join(v['files'])}")
    for f in report["rule_failures"]:
        lines.append(f"STOP: the {f['gatekeeper']} rules changed and the data no longer passes the previous rules. "
                     "If the change is intended, run the workflow by hand with 'accept rule change'.")
    if report["approved_publisher_commits"]:
        lines.append("Publisher commits outside their lane were approved by a manual run.")
    if report["accepted_rule_change"]:
        lines.append("Rule change accepted by a manual run.")
    if report["code_changes"]["files"]:
        lines.append("Code changed: " + ", ".join(report["code_changes"]["files"]))
    lines.append("Gate passed." if report["ok"] else "Gate FAILED: nothing is deployed.")
    return "\n".join(lines)


def main(argv: list[str] | None = None, env: dict | None = None) -> int:
    env = os.environ if env is None else env
    parser = argparse.ArgumentParser(description="Check what is about to be deployed (spec 008).")
    parser.add_argument("--repo", default=".", help="repository folder (default: current folder)")
    parser.add_argument("--accept-rule-change", action="store_true", help="allow data that only passes loosened rules")
    parser.add_argument("--approve-publisher-commits", action="store_true",
                        help="let publisher commits that left their lane through (after reviewing or reverting them)")
    args = parser.parse_args(argv)
    report = run(Path(args.repo), accept_rule_change=args.accept_rule_change,
                 approve_publisher_commits=args.approve_publisher_commits)
    print(explain(report))
    if env.get("GITHUB_OUTPUT"):
        with open(env["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
            out.write(f"gate_report={json.dumps(report, separators=(',', ':'))}\n")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())

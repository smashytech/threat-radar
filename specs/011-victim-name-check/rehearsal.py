"""Rehearsal of the hold-back for spec 011 (AC-2, AC-4), in a throwaway copy of the repo.

Runs the real check script and the workflow's own "Hold Breach Wire back" commands
(read from the workflow file), with a fake source instead of the network.
From the repo root:  python3 specs/011-victim-name-check/rehearsal.py
"""
import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml  # only for reading the workflow file in this rehearsal

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts"))
import add_breachwire as bw  # noqa: E402
import check_victim_names as cvn  # noqa: E402

results = []
def check(name, ok, detail=""):
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'} {name}" + (f" — {detail}" if detail else ""))

def sh(cwd, cmd, env=None):
    return subprocess.run(["bash", "-c", cmd], cwd=cwd, check=True, capture_output=True, text=True, env=env).stdout

def hold_step():
    wf = yaml.safe_load((REPO / ".github/workflows/refresh-and-deploy.yml").read_text())
    return next(s["run"] for s in wf["jobs"]["refresh"]["steps"] if s.get("name") == "Hold Breach Wire back")

def unreachable(url):
    raise cvn.SourceError("the source could not be reached")

def make_source(calls):
    def fetch(url):  # 60 made-up victims a day for the whole month, none of them in any issue
        calls.append(url)
        y, m = url.rsplit("/", 2)[-2:]
        return [{"victim": f"Madeup Victim {d:02}-{k:02}", "discovered": f"{y}-{m}-{d:02} 08:00:00", "domain": ""}
                for d in range(1, 29) for k in range(60)]
    return fetch

with tempfile.TemporaryDirectory() as tmp:
    clone = Path(tmp) / "repo"
    sh(tmp, f"git clone -q {REPO} repo")
    sh(clone, "git config user.email t@example.invalid && git config user.name t && git tag -f breachwire-checked HEAD")
    data = clone / cvn.DATA
    before = sorted(p.name for p in data.iterdir())

    # AC-4: a KEV-only commit → nothing to check, no call to the source
    sh(clone, "echo '[]' > site/data/kev-extra-test.json && git add -A && git commit -qm 'data: KEV test'")
    calls = []
    out = Path(tmp) / "out1"
    cvn.main(["--repo", str(clone)], fetch=make_source(calls), sleep=lambda s: None, env={"GITHUB_OUTPUT": str(out)})
    check("AC-4 KEV-only deploy: nothing checked, no call to the source", "name_check=none" in out.read_text() and not calls)

    # A new Breach Wire issue arrives
    latest = json.loads((data / before[-2]).read_text())  # last issue file (index.json sorts last)
    new = copy.deepcopy(latest)
    new["date"], new["window"], new["issue"] = "2026-11-26", "2026-11-25", latest["issue"] + 1
    new = bw.validate_issue(new)
    issues = bw.load_stored(data); issues[new["date"]] = new
    (data / "2026-11-26.json").write_text(bw.to_json(new)); (data / "index.json").write_text(bw.to_json(bw.build_index(issues)))
    sh(clone, "git add -A && git commit -qm 'breachwire: 2026-11-26'")

    # AC-2a: source unreachable → held; the workflow's own restore puts back the checked data
    out = Path(tmp) / "out2"
    cvn.main(["--repo", str(clone)], fetch=unreachable, sleep=lambda s: None, env={"GITHUB_OUTPUT": str(out)})
    outputs = dict(line.split("=", 1) for line in out.read_text().splitlines())
    sh(clone, hold_step(), env={"RESTORE": outputs["name_check_restore"], "PATH": "/usr/bin:/bin"})
    after = sorted(p.name for p in data.iterdir())
    index = json.loads((data / "index.json").read_text())
    check("AC-2 Source unreachable: held, restored from breachwire-checked",
          outputs["name_check"] == "held" and outputs["name_check_restore"] == "breachwire-checked")
    check("AC-2 The held issue is not in the folder that would be published; the index matches", after == before
          and all(i["date"] != "2026-11-26" for i in index["issues"]), f"{len(after)} files, newest {index['issues'][0]['date']}")
    sh(clone, f"{sys.executable} scripts/build_breach_stats.py >/dev/null && {sys.executable} scripts/add_breachwire.py --check >/dev/null")
    stats = json.loads((clone / "site/data/breachwire-stats.json").read_text())
    check("AC-2 Statistics are built from the checked data only", stats["to"] != "2026-11-25", f"to {stats['to']}, {stats['issues']} issues")

    # AC-2b: next run, source back → the held issue is checked and passes
    sh(clone, "git checkout -q -- . && git clean -qfd site/data")
    calls, out = [], Path(tmp) / "out3"
    cvn.main(["--repo", str(clone)], fetch=make_source(calls), sleep=lambda s: None, env={"GITHUB_OUTPUT": str(out)})
    check("AC-2 Next run with the source back: the held issue is checked and passes",
          "name_check=pass" in out.read_text() and '"date":"2026-11-26"' in out.read_text(), f"{len(calls)} call(s)")
sys.exit(0 if all(results) else 1)

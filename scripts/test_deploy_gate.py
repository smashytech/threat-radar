"""Tests for deploy_gate.py (spec 008 AC-1 – AC-6).

Run from the repo root:  python3 -m unittest scripts/test_deploy_gate.py -v

The end-to-end tests build a small throwaway git repository with fake
gatekeepers ("every number in the data must be at most MAX"), so they can
loosen the rules, plant bad commits and check exactly what the gate does.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import deploy_gate as gate  # noqa: E402


class LaneTest(unittest.TestCase):
    def test_lane_by_commit_title(self):
        self.assertEqual(gate.lane_for("sitrep: 2026-11-24"), "sitrep")
        self.assertEqual(gate.lane_for("breachwire: 2026-11-24"), "breachwire")
        self.assertEqual(gate.lane_for("data: KEV catalog 2026.11.18"), "kev")
        self.assertIsNone(gate.lane_for("Redesign phase 4"))
        self.assertIsNone(gate.lane_for("Sitrep page: show schedule"), "only the exact lower-case prefix is a publisher lane")

    def test_publishers_stay_in_their_lane(self):
        commits = [
            {"sha": "a1", "subject": "breachwire: 2026-11-24", "files": ["site/data/breachwire/2026-11-24.json", "site/data/breachwire/index.json"]},
            {"sha": "b2", "subject": "breachwire: fold sectors", "files": ["scripts/add_breachwire.py", "site/data/breachwire/index.json"]},
            {"sha": "c3", "subject": "sitrep: 2026-11-24", "files": ["site/data/breachwire/2026-11-24.json"]},
            {"sha": "d4", "subject": "data: KEV catalog 2026.11.24", "files": ["site/data/kev.json", "site/data/meta.json"]},
            {"sha": "e5", "subject": "data: KEV catalog 2026.11.25", "files": ["site/data/kev.json", "site/today.js"]},
            {"sha": "f6", "subject": "Today: tooltip", "files": ["site/today.js"]},
        ]
        found = gate.lane_violations(commits)
        self.assertEqual([(v["sha"], v["files"]) for v in found], [
            ("b2", ["scripts/add_breachwire.py"]),
            ("c3", ["site/data/breachwire/2026-11-24.json"]),
            ("e5", ["site/today.js"]),
        ])

    def test_lane_paths_cannot_be_escaped(self):
        commits = [{"sha": "a1", "subject": "sitrep: x", "files": ["site/data/sitrep/../../app.js", "site/data/sitrepX/a.json"]}]
        self.assertEqual(gate.lane_violations(commits)[0]["files"], ["site/data/sitrep/../../app.js", "site/data/sitrepX/a.json"])

    def test_code_changes_are_everything_outside_site_data(self):
        self.assertEqual(gate.outside_data(["site/data/kev.json", "site/today.js", "scripts/x.py", "site/data/sitrep/a.json"]),
                         ["scripts/x.py", "site/today.js"])


FAKE_GATEKEEPER = """import json, sys
from pathlib import Path
from add_sitrep import MAX  # the Breach Wire gatekeeper imports the Sitrep one, like the real ones
args = sys.argv[1:]
out = Path(args[args.index("--out") + 1])
for f in sorted(out.glob("*.json")):
    if json.loads(f.read_text())["n"] > MAX:
        print(f"{f.name}: n is above {MAX}")
        sys.exit(1)
print("ok")
"""


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout.strip()


class EndToEndTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name) / "repo"
        self.repo.mkdir()
        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "config", "user.email", "test@example.invalid")
        git(self.repo, "config", "user.name", "test")
        self.write("scripts/add_sitrep.py", "MAX = 5\n" + FAKE_GATEKEEPER)
        self.write("scripts/add_breachwire.py", FAKE_GATEKEEPER)
        self.write("site/data/sitrep/2026-11-01.json", json.dumps({"n": 3}))
        self.write("site/data/breachwire/2026-11-01.json", json.dumps({"n": 4}))
        self.write("site/today.js", "// v1\n")
        self.commit("Initial site")

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, rel, text):
        path = self.repo / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def commit(self, subject):
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-q", "-m", subject)
        return git(self.repo, "rev-parse", "HEAD")

    def mark_deployed(self):
        git(self.repo, "tag", "-f", gate.DEPLOYED_TAG)

    def run_gate(self, accept=False):
        return gate.run(self.repo, accept_rule_change=accept)

    def test_first_run_has_nothing_to_compare(self):
        report = self.run_gate()
        self.assertTrue(report["ok"])
        self.assertTrue(report["first_run"])

    def test_data_only_publisher_commit_passes_quietly(self):
        self.mark_deployed()
        self.write("site/data/sitrep/2026-11-02.json", json.dumps({"n": 2}))
        self.commit("sitrep: 2026-11-02")
        report = self.run_gate()
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["code_changes"]["files"], [], "data-only: no Slack heads-up")

    def test_publisher_editing_its_gatekeeper_is_stopped(self):
        self.mark_deployed()
        self.write("scripts/add_breachwire.py", FAKE_GATEKEEPER + "# looser\n")
        self.write("site/data/breachwire/2026-11-02.json", json.dumps({"n": 1}))
        self.commit("breachwire: fold excess sectors")
        report = self.run_gate()
        self.assertFalse(report["ok"])
        self.assertEqual(report["lane_violations"][0]["files"], ["scripts/add_breachwire.py"])

    def test_a_reverted_bad_commit_needs_a_manual_approval_to_move_on(self):
        """The bad commit stays between 'deployed' and HEAD after a revert, so only a manual run clears it."""
        self.mark_deployed()
        self.write("site/today.js", "// evil\n")
        self.commit("breachwire: 2026-11-02")
        git(self.repo, "revert", "--no-edit", "HEAD")
        self.assertFalse(self.run_gate()["ok"], "still stopped after the revert")
        approved = gate.run(self.repo, approve_publisher_commits=True)
        self.assertTrue(approved["ok"], approved)
        self.assertTrue(approved["approved_publisher_commits"])
        self.assertEqual(len(approved["lane_violations"]), 1, "still listed, for the Slack heads-up")

    def test_rules_loosened_in_the_same_push_are_stopped_unless_accepted(self):
        self.mark_deployed()
        self.write("scripts/add_sitrep.py", "MAX = 10\n" + FAKE_GATEKEEPER)   # looser rules...
        self.commit("Allow bigger numbers")
        self.write("site/data/breachwire/2026-11-02.json", json.dumps({"n": 7}))  # ...and data that needs them
        self.commit("breachwire: 2026-11-02")
        report = self.run_gate()
        self.assertFalse(report["ok"])
        self.assertEqual([f["gatekeeper"] for f in report["rule_failures"]], ["breachwire"])
        self.assertEqual(report["lane_violations"], [])
        accepted = self.run_gate(accept=True)
        self.assertTrue(accepted["ok"], accepted)
        self.assertTrue(accepted["accepted_rule_change"])

    def test_rule_change_the_data_did_not_need_passes_with_a_note(self):
        self.mark_deployed()
        self.write("scripts/add_sitrep.py", "MAX = 10\n" + FAKE_GATEKEEPER)
        self.commit("Allow bigger numbers")
        report = self.run_gate()
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["rules_changed"], ["breachwire", "sitrep"], "Breach Wire imports the Sitrep rules, so both changed")
        self.assertEqual(report["code_changes"]["files"], ["scripts/add_sitrep.py"])

    def test_code_change_is_reported_for_a_heads_up(self):
        self.mark_deployed()
        self.write("site/today.js", "// v2\n")
        self.commit("Today: tooltip")
        report = self.run_gate()
        self.assertTrue(report["ok"])
        self.assertEqual(report["code_changes"], {"files": ["site/today.js"], "commits": ["Today: tooltip"]})

    def test_old_rules_run_from_a_fresh_folder_not_the_repo(self):
        """A file planted next to the scripts must not be picked up by the old-rules run."""
        self.mark_deployed()
        self.write("scripts/add_sitrep.py", "MAX = 10\n" + FAKE_GATEKEEPER)
        self.write("scripts/json.py", "raise SystemExit('planted module was imported')\n")
        self.commit("Allow bigger numbers")
        self.assertTrue(self.run_gate()["ok"])

    def test_cli_writes_the_report_and_fails_when_blocked(self):
        self.mark_deployed()
        self.write("site/today.js", "// v2\n")
        self.write("site/data/sitrep/2026-11-02.json", json.dumps({"n": 1}))
        self.commit("sitrep: sneaky")
        out = Path(self.tmp.name) / "github_output"
        out.write_text("")
        code = gate.main(["--repo", str(self.repo)], env={"GITHUB_OUTPUT": str(out)})
        self.assertEqual(code, 1)
        line = out.read_text().strip()
        self.assertTrue(line.startswith("gate_report="))
        self.assertFalse(json.loads(line.split("=", 1)[1])["ok"])

    def test_report_lists_are_capped(self):
        self.mark_deployed()
        for i in range(gate.MAX_LISTED + 5):
            self.write(f"site/x{i:02d}.js", "x")
        self.commit("Many files")
        report = self.run_gate()
        self.assertEqual(len(report["code_changes"]["files"]), gate.MAX_LISTED)
        self.assertEqual(report["code_changes"]["more_files"], 5)


if __name__ == "__main__":
    unittest.main()

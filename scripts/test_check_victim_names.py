"""Tests for check_victim_names.py (spec 011). No network: the source is a fake.
Run: python3 -m unittest scripts/test_check_victim_names.py"""
import copy
import io
import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import add_breachwire  # noqa: E402
import check_victim_names as cvn  # noqa: E402

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
VALID = json.loads((FIXTURES / "breachwire_valid.json").read_text("utf-8"))
SECRET = "Zyxwvut Holdings"   # a made-up victim name; must never be printed


def issue(window="2026-11-10", profile=None):
    i = copy.deepcopy(VALID)
    i["window"] = window
    i["date"] = (date.fromisoformat(window).replace(day=date.fromisoformat(window).day + 1)).isoformat()
    if profile:
        i["groups"][0]["profile"] = profile
    return add_breachwire.validate_issue(i)


def victims(day, n=40, extra=()):
    """A month listing in the source's shape."""
    rows = [{"victim": f"Filler Company {k:03}", "discovered": f"{day} 10:00:00.000000", "group": "akira",
             "domain": f"filler{k:03}.example"} for k in range(n)]
    rows += [{"victim": name, "discovered": f"{d} 09:00:00", "group": "qilin", "domain": ""} for name, d in extra]
    return rows


class FakeSource:
    def __init__(self, months, fail=None):
        self.months, self.fail, self.calls = months, fail, []

    def __call__(self, url):
        self.calls.append(url)
        if self.fail:
            raise cvn.SourceError(self.fail)
        key = url.rsplit("/", 2)[-2] + "-" + url.rsplit("/", 1)[-1]
        return self.months.get(key, [])


class Days(unittest.TestCase):
    def test_range_is_two_days_before_and_one_after(self):
        self.assertEqual(cvn.day_range("2026-11-10"), (date(2026, 11, 8), date(2026, 11, 11)))

    def test_months_cover_a_boundary(self):
        self.assertEqual(cvn.months_for(*cvn.day_range("2026-11-01")), [(2026, 10), (2026, 11)])
        self.assertEqual(cvn.months_for(*cvn.day_range("2026-11-30")), [(2026, 11), (2026, 12)])
        self.assertEqual(cvn.months_for(*cvn.day_range("2026-11-15")), [(2026, 11)])


class Source(unittest.TestCase):
    def test_names_outside_the_days_are_dropped(self):
        rows = victims("2026-11-10", 2, extra=[("Early Bird Ltd", "2026-11-07"), ("Late Owl Ltd", "2026-11-12"), ("Inside Co", "2026-11-08")])
        names = cvn.names_in_range(cvn.parse_source(rows), *cvn.day_range("2026-11-10"))
        self.assertIn("Inside Co", names)
        self.assertNotIn("Early Bird Ltd", names)
        self.assertNotIn("Late Owl Ltd", names)
        self.assertIn("filler000.example", names, "the domain is checked too")

    def test_something_that_is_not_a_victim_list_is_refused(self):
        for bad in ({"victims": []}, "oops", [1, 2], [{"nope": 1}] * 10):
            with self.assertRaises(cvn.SourceError):
                cvn.parse_source(bad)

    def test_an_empty_month_is_fine(self):
        self.assertEqual(cvn.parse_source([]), [])


class Matching(unittest.TestCase):
    def test_a_name_missing_from_the_bots_list_is_caught(self):
        """AC-1: the bot leaked a name into a profile and left it off its own list."""
        src = FakeSource({"2026-11": victims("2026-11-10", extra=[(SECRET, "2026-11-10")])})
        report = cvn.run([issue(profile=f"Today they posted {SECRET} and others.")], src, sleep=lambda s: None)
        self.assertEqual(report["outcome"], "found")
        found = report["issues"][0]
        self.assertEqual(found["outcome"], "found")
        self.assertIsInstance(found["line"], int)
        self.assertNotIn("Zyxwvut", json.dumps(report))

    def test_a_clean_issue_passes_and_reports_how_many_names_were_checked(self):
        src = FakeSource({"2026-11": victims("2026-11-10", extra=[(SECRET, "2026-11-10")])})
        report = cvn.run([issue()], src, sleep=lambda s: None)
        self.assertEqual(report["outcome"], "pass")
        self.assertEqual(report["issues"][0]["checked"], 40 * 2 + 1)

    def test_issue_words_are_skipped_not_matched(self):
        """AC-3: a victim called like a gang, country, region or sector in the issue."""
        words = [("Akira", "2026-11-10"), ("Canada", "2026-11-10"), ("North America", "2026-11-10"), ("Technology & telecom", "2026-11-10")]
        src = FakeSource({"2026-11": victims("2026-11-10", extra=words)})
        report = cvn.run([issue()], src, sleep=lambda s: None)
        self.assertEqual(report["outcome"], "pass")
        self.assertEqual(report["issues"][0]["skipped"], 4)

    def test_short_names_are_ignored(self):
        src = FakeSource({"2026-11": victims("2026-11-10", extra=[("GB", "2026-11-10")])})
        self.assertEqual(cvn.run([issue()], src, sleep=lambda s: None)["outcome"], "pass")


class Outcomes(unittest.TestCase):
    def test_unreachable_source_holds_breach_wire(self):
        src = FakeSource({}, fail="the source could not be reached")
        report = cvn.run([issue("2026-11-10"), issue("2026-11-11")], src, sleep=lambda s: None)
        self.assertEqual(report["outcome"], "held")
        self.assertEqual(report["reason"], "the source could not be reached")
        self.assertEqual(len(src.calls), 1, "after one failure, no more calls")

    def test_too_few_names_holds_breach_wire(self):
        src = FakeSource({"2026-11": victims("2026-11-10", n=2)})
        report = cvn.run([issue()], src, sleep=lambda s: None)
        self.assertEqual(report["outcome"], "held")
        self.assertIn("too few", report["reason"])

    def test_a_found_name_wins_over_a_held_issue(self):
        src = FakeSource({"2026-11": victims("2026-11-10", extra=[(SECRET, "2026-11-10")])})
        report = cvn.run([issue(profile=f"{SECRET} posted"), issue("2026-11-25")], src, sleep=lambda s: None)
        self.assertEqual([i["outcome"] for i in report["issues"]], ["found", "held"])
        self.assertEqual(report["outcome"], "found")

    def test_one_call_per_month_and_a_pause_between_calls(self):
        src = FakeSource({"2026-10": victims("2026-10-31"), "2026-11": victims("2026-11-01")})
        pauses = []
        report = cvn.run([issue("2026-11-01"), issue("2026-11-02")], src, sleep=pauses.append)
        self.assertEqual(report["outcome"], "pass")
        self.assertEqual(len(src.calls), 2)
        self.assertEqual(pauses, [cvn.PAUSE])
        self.assertTrue(all(u.startswith("https://api.ransomware.live/v2/victims/2026/") for u in src.calls))

    def test_nothing_to_check(self):
        self.assertEqual(cvn.run([], FakeSource({}), sleep=lambda s: None)["outcome"], "none")


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout


class Changed(unittest.TestCase):
    """AC-4: only issue files changed since the last checked commit."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name)
        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "config", "user.email", "t@example.invalid")
        git(self.repo, "config", "user.name", "t")
        self.data = self.repo / cvn.DATA
        self.data.mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def commit(self, files, msg):
        for name, text in files.items():
            (self.repo / name).parent.mkdir(parents=True, exist_ok=True)
            (self.repo / name).write_text(text, "utf-8")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-q", "-m", msg)

    def test_without_the_tag_every_issue_is_checked(self):
        self.commit({f"{cvn.DATA}/2026-11-03.json": "{}", f"{cvn.DATA}/index.json": "{}"}, "a")
        self.assertEqual(cvn.changed_files(self.repo), ["2026-11-03.json"])

    def test_with_the_tag_only_new_or_changed_issues(self):
        self.commit({f"{cvn.DATA}/2026-11-03.json": "{}"}, "a")
        git(self.repo, "tag", cvn.CHECKED_TAG)
        self.commit({"site/data/kev.json": "[]"}, "data: KEV")
        self.assertEqual(cvn.changed_files(self.repo), [], "a KEV-only deploy checks nothing")
        self.commit({f"{cvn.DATA}/2026-11-04.json": "{}", f"{cvn.DATA}/index.json": "{}"}, "breachwire: 4")
        self.assertEqual(cvn.changed_files(self.repo), ["2026-11-04.json"])

    def test_restore_point(self):
        self.commit({"README": "x"}, "a")
        self.assertEqual(cvn.restore_point(self.repo), "")
        git(self.repo, "tag", "deployed")
        self.assertEqual(cvn.restore_point(self.repo), "deployed")
        git(self.repo, "tag", cvn.CHECKED_TAG)
        self.assertEqual(cvn.restore_point(self.repo), cvn.CHECKED_TAG)


class Cli(unittest.TestCase):
    def test_outputs_and_printout_never_carry_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            git(repo, "init", "-q", "-b", "main")
            git(repo, "config", "user.email", "t@example.invalid")
            git(repo, "config", "user.name", "t")
            i = issue(profile=f"{SECRET} posted")
            (repo / cvn.DATA).mkdir(parents=True)
            (repo / cvn.DATA / f"{i['date']}.json").write_text(add_breachwire.to_json(i), "utf-8")
            git(repo, "add", "-A")
            git(repo, "commit", "-q", "-m", "a")
            out_file = repo / "gh_output"
            src = FakeSource({"2026-11": victims("2026-11-10", extra=[(SECRET, "2026-11-10")])})
            buf = io.StringIO()
            with redirect_stdout(buf):
                code = cvn.main(["--repo", str(repo)], fetch=src, sleep=lambda s: None, env={"GITHUB_OUTPUT": str(out_file)})
            self.assertEqual(code, 0, "the run continues; the workflow fails it after publishing the rest")
            outputs = out_file.read_text("utf-8")
            self.assertIn("name_check=found", outputs)
            self.assertIn("name_check_restore=", outputs)
            for text in (outputs, buf.getvalue()):
                self.assertNotIn("Zyxwvut", text)


if __name__ == "__main__":
    unittest.main()

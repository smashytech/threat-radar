"""Tests for add_sitrep.py, the gatekeeper between the AI-written issue and the site.

Run from the repo root:
    python3 -m unittest discover -s scripts -p "test_*.py" -v
"""

import copy
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import add_sitrep  # noqa: E402

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
VALID = json.loads((FIXTURES / "sitrep_valid.json").read_text("utf-8"))


def run(*args):
    with redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
        return add_sitrep.main(list(args))


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "sitrep"
        self.inbox = Path(self.tmp.name) / "issue.json"

    def tearDown(self):
        self.tmp.cleanup()

    def publish(self, issue):
        self.inbox.write_text(issue if isinstance(issue, str) else json.dumps(issue, ensure_ascii=False), "utf-8")
        return run(str(self.inbox), "--out", str(self.out))

    def stored(self, date):
        return json.loads((self.out / f"{date}.json").read_text("utf-8"))

    def index(self):
        return json.loads((self.out / "index.json").read_text("utf-8"))


class ValidIssue(Base):
    def setUp(self):
        super().setUp()
        self.code = self.publish(VALID)

    def test_succeeds_and_writes_issue_and_index(self):
        self.assertEqual(self.code, 0)
        self.assertEqual(sorted(p.name for p in self.out.iterdir()), ["2026-11-06.json", "index.json"])

    def test_content_preserved(self):
        issue = self.stored("2026-11-06")
        self.assertEqual(issue["tldr"], VALID["tldr"])
        self.assertEqual(len(issue["items"]), 10)
        self.assertEqual(len(issue["emerging"]), 2)
        self.assertEqual(issue["items"][4]["title"], "Chainalysis breach exposes credentials for all users")
        self.assertEqual(issue["action"], VALID["action"])

    def test_cves_detected_by_the_script_not_the_ai(self):
        items = self.stored("2026-11-06")["items"]
        self.assertEqual(items[0]["cves"], ["CVE-2026-7273", "CVE-2026-107441"])
        self.assertEqual(items[2]["cves"], ["CVE-2026-116606", "CVE-2026-111560"])
        self.assertEqual(items[8]["cves"], ["CVE-2024-27834"])
        self.assertEqual(items[4]["cves"], [])

    def test_index_entry(self):
        self.assertEqual(self.index(), {"issues": [{
            "date": "2026-11-06", "tldr": VALID["tldr"], "items": 10, "emerging": 2, "actionNeeded": True,
        }]})


class Index(Base):
    def test_newest_first_and_action_flag(self):
        older = copy.deepcopy(VALID)
        older["date"] = "2026-11-04"
        older["action"] = "Nothing requiring action."
        self.publish(older)
        self.publish(VALID)
        issues = self.index()["issues"]
        self.assertEqual([i["date"] for i in issues], ["2026-11-06", "2026-11-04"])
        self.assertEqual([i["actionNeeded"] for i in issues], [True, False])

    def test_republishing_a_day_replaces_it(self):
        self.publish(VALID)
        corrected = copy.deepcopy(VALID)
        corrected["tldr"] = "Corrected TL;DR text for the same day, long enough to pass."
        self.publish(corrected)
        self.assertEqual(len(self.index()["issues"]), 1)
        self.assertEqual(self.stored("2026-11-06")["tldr"], corrected["tldr"])


class Idempotent(Base):
    """AC-8: publishing the same issue twice gives byte-identical files, so git sees no change."""

    def test_byte_identical(self):
        self.publish(VALID)
        first = {p.name: p.read_bytes() for p in self.out.iterdir()}
        self.publish(VALID)
        second = {p.name: p.read_bytes() for p in self.out.iterdir()}
        self.assertEqual(first, second)


class Links(Base):
    def test_gmail_redirect_links_are_unwrapped(self):
        issue = copy.deepcopy(VALID)
        issue["items"][0]["url"] = ("https://www.google.com/url?q=https://www.securityweek.com/zyxel-switch-hacks/"
                                    "&source=gmail&ust=1794035205166000&sa=E")
        self.assertEqual(self.publish(issue), 0)
        self.assertEqual(self.stored("2026-11-06")["items"][0]["url"], "https://www.securityweek.com/zyxel-switch-hacks/")


class Refused(Base):
    """AC-6 / AC-7: anything invalid is refused and NOTHING is written."""

    def assert_refused(self, issue):
        code = self.publish(issue)
        self.assertNotEqual(code, 0)
        self.assertFalse(self.out.exists() and any(self.out.iterdir()), "something was written")

    def variant(self, change):
        issue = copy.deepcopy(VALID)
        change(issue)
        return issue

    def test_not_json(self):
        self.assert_refused('{"date": "2026-11-06", "tldr": ')

    def test_not_an_object(self):
        self.assert_refused([VALID])

    def test_missing_tldr(self):
        self.assert_refused(self.variant(lambda i: i.pop("tldr")))

    def test_missing_item_url(self):
        self.assert_refused(self.variant(lambda i: i["items"][3].pop("url")))

    def test_unknown_top_level_field(self):
        self.assert_refused(self.variant(lambda i: i.update(script="alert(1)")))

    def test_unknown_item_field(self):
        self.assert_refused(self.variant(lambda i: i["items"][0].update(html="<b>x</b>")))

    def test_http_link(self):
        self.assert_refused(self.variant(lambda i: i["items"][1].update(url="http://www.securityweek.com/x")))

    def test_javascript_link(self):
        self.assert_refused(self.variant(lambda i: i["emerging"][0].update(url="javascript:alert(1)")))

    def test_link_with_credentials(self):
        self.assert_refused(self.variant(lambda i: i["items"][1].update(url="https://user:pass@evil.example/")))

    def test_impossible_date(self):
        self.assert_refused(self.variant(lambda i: i.update(date="2026-02-30")))

    def test_path_like_date(self):
        self.assert_refused(self.variant(lambda i: i.update(date="../../index")))

    def test_bad_published_date(self):
        self.assert_refused(self.variant(lambda i: i["items"][0].update(published="Nov 5, 2026")))

    def test_oversized_description(self):
        self.assert_refused(self.variant(lambda i: i["items"][0].update(description="x" * 5000)))

    def test_too_few_items(self):
        self.assert_refused(self.variant(lambda i: i.update(items=i["items"][:5])))

    def test_too_many_items(self):
        self.assert_refused(self.variant(lambda i: i.update(items=i["items"] + i["items"][:1])))

    def test_too_many_emerging(self):
        self.assert_refused(self.variant(lambda i: i.update(emerging=i["emerging"] * 2)))

    def test_non_string_title(self):
        self.assert_refused(self.variant(lambda i: i["items"][0].update(title=["not", "text"])))

    def test_control_characters(self):
        self.assert_refused(self.variant(lambda i: i["items"][0].update(title="Hidden\u0000null")))


class HostileText(Base):
    """AC-7 (data side): markup in text is stored verbatim; the page renders it as plain text."""

    def test_markup_preserved_as_text(self):
        hostile = json.loads((FIXTURES / "sitrep_xss.json").read_text("utf-8"))
        self.assertEqual(self.publish(hostile), 0)
        issue = self.stored("2026-11-05")
        self.assertIn('<script>alert("xss")</script>', issue["items"][0]["description"])
        self.assertEqual(issue["items"][0]["cves"], ["CVE-2024-27834"])


class Check(Base):
    """--check (run in CI) catches bad data that got into the repo some other way."""

    def setUp(self):
        super().setUp()
        self.publish(VALID)

    def check(self):
        return run("--check", "--out", str(self.out))

    def test_passes_on_good_data(self):
        self.assertEqual(self.check(), 0)

    def test_fails_on_tampered_issue(self):
        path = self.out / "2026-11-06.json"
        issue = json.loads(path.read_text("utf-8"))
        issue["items"][0]["url"] = "javascript:alert(1)"
        path.write_text(json.dumps(issue), "utf-8")
        self.assertNotEqual(self.check(), 0)

    def test_fails_on_stale_index(self):
        (self.out / "index.json").write_text('{"issues": []}', "utf-8")
        self.assertNotEqual(self.check(), 0)

    def test_fails_on_stray_file(self):
        (self.out / "notes.txt").write_text("hello", "utf-8")
        self.assertNotEqual(self.check(), 0)

    def test_passes_when_folder_missing(self):
        self.assertEqual(run("--check", "--out", str(Path(self.tmp.name) / "nothing-here")), 0)


if __name__ == "__main__":
    unittest.main()

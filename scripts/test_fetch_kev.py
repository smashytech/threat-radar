"""Tests for fetch_kev.py.

Run from the repo root:
    python3 -m unittest discover -s scripts -p "test_*.py" -v

Every test reads a local fixture file, so the tests never touch the network.
"""

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_kev  # noqa: E402

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
CONTRACT_FIELDS = {
    "cveID", "vendorProject", "product", "vulnerabilityName", "dateAdded",
    "shortDescription", "requiredAction", "dueDate",
    "knownRansomwareCampaignUse", "notes", "cwes", "forensicTriage",
}


def run(*args):
    """Run the script's main() quietly and return its exit code."""
    with redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
        return fetch_kev.main(list(args))


class ValidFeed(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name)
        self.code = run("--source", str(FIXTURES / "kev_valid.json"),
                        "--no-fallback", "--out", str(self.out))
        self.kev = json.loads((self.out / "kev.json").read_text("utf-8"))
        self.meta = json.loads((self.out / "meta.json").read_text("utf-8"))
        self.status = json.loads((self.out / "status.json").read_text("utf-8"))

    def tearDown(self):
        self.tmp.cleanup()

    def test_succeeds(self):
        self.assertEqual(self.code, 0)

    def test_keeps_every_entry(self):
        self.assertEqual(len(self.kev), 12)

    def test_sorted_newest_first_then_by_cve(self):
        keys = [(e["dateAdded"], e["cveID"]) for e in self.kev]
        expected = sorted(keys, key=lambda k: k[1])
        expected = sorted(expected, key=lambda k: k[0], reverse=True)
        self.assertEqual(keys, expected)
        self.assertEqual(self.kev[0]["cveID"], "CVE-2024-27834")
        self.assertEqual(self.kev[-1]["cveID"], "CVE-2021-44228")

    def test_only_contract_fields(self):
        for entry in self.kev:
            self.assertTrue(set(entry) <= CONTRACT_FIELDS, set(entry) - CONTRACT_FIELDS)

    def test_meta(self):
        self.assertEqual(self.meta["catalogVersion"], "2026.11.04")
        self.assertEqual(self.meta["count"], 12)
        self.assertIn("dateReleased", self.meta)

    def test_status_records_check_time_and_source(self):
        self.assertRegex(self.status["checkedAt"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
        self.assertTrue(self.status["source"].endswith("kev_valid.json"))


class BadFeedsChangeNothing(unittest.TestCase):
    """AC-2: a bad feed fails the run AND leaves the published data untouched."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name)
        self.before = {}
        for name in ("kev.json", "meta.json", "status.json"):
            (self.out / name).write_text(f"previous good {name}", "utf-8")
            self.before[name] = f"previous good {name}"

    def tearDown(self):
        self.tmp.cleanup()

    def assert_fails_cleanly(self, source):
        code = run("--source", str(source), "--no-fallback", "--out", str(self.out))
        self.assertNotEqual(code, 0)
        for name, text in self.before.items():
            self.assertEqual((self.out / name).read_text("utf-8"), text, f"{name} was modified")

    def write(self, obj):
        path = self.out / "custom_feed.json"
        path.write_text(json.dumps(obj), "utf-8")
        return path

    def test_broken_json(self):
        self.assert_fails_cleanly(FIXTURES / "kev_broken.json")

    def test_entry_missing_cve_id(self):
        self.assert_fails_cleanly(FIXTURES / "kev_missing_field.json")

    def test_empty_list(self):
        self.assert_fails_cleanly(FIXTURES / "kev_empty.json")

    def test_unreachable_source(self):
        self.assert_fails_cleanly(FIXTURES / "does_not_exist.json")

    def test_no_vulnerabilities_key(self):
        self.assert_fails_cleanly(self.write({"title": "x", "catalogVersion": "1"}))

    def test_not_an_object(self):
        self.assert_fails_cleanly(self.write([1, 2, 3]))

    def test_bad_date_format(self):
        feed = json.loads((FIXTURES / "kev_valid.json").read_text("utf-8"))
        feed["vulnerabilities"][0]["dateAdded"] = "11/04/2026"
        self.assert_fails_cleanly(self.write(feed))

    def test_bad_cve_id_format(self):
        feed = json.loads((FIXTURES / "kev_valid.json").read_text("utf-8"))
        feed["vulnerabilities"][0]["cveID"] = "not-a-cve"
        self.assert_fails_cleanly(self.write(feed))

    def test_duplicate_cve_id(self):
        feed = json.loads((FIXTURES / "kev_valid.json").read_text("utf-8"))
        feed["vulnerabilities"].append(feed["vulnerabilities"][0])
        self.assert_fails_cleanly(self.write(feed))


class ShrinkGuard(unittest.TestCase):
    """A sudden big drop in entries looks like a broken feed, so refuse it."""

    def test_refuses_large_drop(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            (out / "meta.json").write_text(json.dumps({"count": 100}), "utf-8")
            code = run("--source", str(FIXTURES / "kev_valid.json"),
                       "--no-fallback", "--out", str(out))
            self.assertNotEqual(code, 0)
            self.assertFalse((out / "kev.json").exists())

    def test_allows_small_change(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            (out / "meta.json").write_text(json.dumps({"count": 13}), "utf-8")
            code = run("--source", str(FIXTURES / "kev_valid.json"),
                       "--no-fallback", "--out", str(out))
            self.assertEqual(code, 0)


class Determinism(unittest.TestCase):
    """AC-3: same input twice gives byte-identical committed files, so git sees no change."""

    def test_identical_output(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            for out in (a, b):
                run("--source", str(FIXTURES / "kev_valid.json"), "--no-fallback", "--out", out)
            for name in ("kev.json", "meta.json"):
                self.assertEqual((Path(a) / name).read_bytes(), (Path(b) / name).read_bytes(), name)


class Fallback(unittest.TestCase):
    def test_uses_fallback_when_primary_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            code = run("--source", str(FIXTURES / "does_not_exist.json"),
                       "--fallback", str(FIXTURES / "kev_valid.json"), "--out", tmp)
            self.assertEqual(code, 0)
            status = json.loads((Path(tmp) / "status.json").read_text("utf-8"))
            self.assertTrue(status["source"].endswith("kev_valid.json"))

    def test_uses_fallback_when_primary_is_invalid(self):
        with tempfile.TemporaryDirectory() as tmp:
            code = run("--source", str(FIXTURES / "kev_broken.json"),
                       "--fallback", str(FIXTURES / "kev_valid.json"), "--out", tmp)
            self.assertEqual(code, 0)


class HostileText(unittest.TestCase):
    """AC-6 (data side): feed text passes through unchanged; escaping is the renderer's job."""

    def test_script_text_preserved_verbatim(self):
        with tempfile.TemporaryDirectory() as tmp:
            run("--source", str(FIXTURES / "kev_xss.json"), "--no-fallback", "--out", tmp)
            kev = json.loads((Path(tmp) / "kev.json").read_text("utf-8"))
            descriptions = [e["shortDescription"] for e in kev]
            self.assertTrue(any('<script>alert("xss")</script>' in d for d in descriptions))


if __name__ == "__main__":
    unittest.main()

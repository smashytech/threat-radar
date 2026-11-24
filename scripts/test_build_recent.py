"""Tests for build_recent.py (spec 009 AC-1). Run: python3 -m unittest scripts/test_build_recent.py"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_recent  # noqa: E402

FULL = {"cveID": "CVE-2026-1", "vendorProject": "Acme", "product": "Widget", "vulnerabilityName": "Acme Widget flaw",
        "dateAdded": "2026-11-20", "shortDescription": "long text " * 50, "requiredAction": "Apply updates.",
        "dueDate": "2026-12-11", "knownRansomwareCampaignUse": "Known", "notes": "https://example.com", "cwes": ["CWE-79"]}


def entry(cve, added):
    return dict(FULL, cveID=cve, dateAdded=added)


class RecentTest(unittest.TestCase):
    def test_keeps_the_last_400_days_today_included(self):
        entries = [entry("CVE-2026-3", "2026-11-24"), entry("CVE-2025-2", "2025-10-21"), entry("CVE-2025-1", "2025-10-20")]
        kept = build_recent.recent(entries, "2026-11-24")
        self.assertEqual([e["cveID"] for e in kept], ["CVE-2026-3", "CVE-2025-2"], "2025-10-21 is day 400; 2025-10-20 is day 401")

    def test_only_the_fields_the_today_page_uses(self):
        kept = build_recent.recent([entry("CVE-2026-1", "2026-11-20")], "2026-11-24")
        self.assertEqual(set(kept[0]), {"cveID", "dateAdded", "dueDate", "vendorProject", "product", "vulnerabilityName"})

    def test_future_dates_are_kept_so_a_visitor_ahead_in_time_still_sees_them(self):
        kept = build_recent.recent([entry("CVE-2026-9", "2026-11-25")], "2026-11-24")
        self.assertEqual(len(kept), 1)

    def test_same_input_same_bytes_and_small(self):
        entries = [entry(f"CVE-2026-{i}", "2026-11-20") for i in range(300)]
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            (data / "kev.json").write_text(json.dumps(entries))
            build_recent.main(["--data", str(data), "--today", "2026-11-24"])
            first = (data / "kev-recent.json").read_bytes()
            build_recent.main(["--data", str(data), "--today", "2026-11-24"])
            self.assertEqual(first, (data / "kev-recent.json").read_bytes())
            self.assertLess(len(first), 300 * 200, "about 170 bytes per entry, not the full record")

    def test_refuses_a_broken_catalog(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "kev.json").write_text("{not json")
            self.assertEqual(build_recent.main(["--data", tmp, "--today", "2026-11-24"]), 2)


if __name__ == "__main__":
    unittest.main()

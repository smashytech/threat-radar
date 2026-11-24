"""security.txt is valid and not about to expire (spec 008 AC-9).
Run: python3 -m unittest scripts/test_security_txt.py"""
import re
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILE = ROOT / "site" / ".well-known" / "security.txt"


def fields():
    out = {}
    for line in FILE.read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            name, _, value = line.partition(":")
            out.setdefault(name.strip(), []).append(value.strip())
    return out


class SecurityTxtTest(unittest.TestCase):
    def test_required_and_expected_fields(self):
        f = fields()
        for name in ("Contact", "Expires", "Canonical", "Policy"):
            self.assertIn(name, f, name)
        self.assertEqual(len(f["Expires"]), 1, "RFC 9116: exactly one Expires")
        self.assertTrue(all(v.startswith("https://") for k in ("Contact", "Canonical", "Policy") for v in f[k]))
        self.assertEqual(f["Canonical"], ["https://zelin.se/.well-known/security.txt"])

    def test_expires_is_at_least_30_days_away(self):
        """This test is the renewal reminder: it fails a month before the date passes."""
        expires = datetime.strptime(fields()["Expires"][0], "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        self.assertGreater(expires - now, timedelta(days=30), "renew security.txt: move Expires about a year ahead")
        self.assertLess(expires - now, timedelta(days=366), "RFC 9116 recommends less than a year ahead")

    def test_no_email_address(self):
        self.assertIsNone(re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", FILE.read_text(encoding="utf-8")), "no personal email address")

    def test_well_known_is_the_only_hidden_thing_published(self):
        hidden = sorted(str(p.relative_to(ROOT / "site")) for p in (ROOT / "site").rglob(".*"))
        self.assertEqual(hidden, [".well-known"], "include-hidden-files publishes every dot-file in site/")


if __name__ == "__main__":
    unittest.main()

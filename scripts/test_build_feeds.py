"""Tests for build_feeds.py, which turns the published data into Atom feeds (spec 005).

Run from the repo root:
    python3 -m unittest discover -s scripts -p "test_*.py" -v
"""

import io
import json
import re
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_feeds  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ATOM = "{http://www.w3.org/2005/Atom}"
BASE = "https://example.test/"
RFC3339 = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def kev(cve, date, vendor="Acme", product="Widget", ransomware=False, name=None):
    return {
        "cveID": cve, "vendorProject": vendor, "product": product,
        "vulnerabilityName": name or f"{vendor} {product} Remote Code Execution Vulnerability",
        "dateAdded": date, "shortDescription": f"{product} lets an attacker run code.",
        "requiredAction": "Apply mitigations per vendor instructions.", "dueDate": "2026-12-01",
        "knownRansomwareCampaignUse": "Known" if ransomware else "Unknown", "notes": "", "cwes": [],
    }


def sitrep(date, action=False):
    return {"date": date, "tldr": f"Summary for {date}.", "items": 8, "emerging": 2, "actionNeeded": action}


def breachwire(issue, date, sweden=0):
    return {"date": date, "issue": issue, "window": date, "victims": 21, "groups": 11, "countries": 9, "sweden": sweden}


def parse(data: bytes) -> ET.Element:
    return ET.fromstring(data)


def assert_valid_atom(test: unittest.TestCase, data: bytes) -> ET.Element:
    """The parts of Atom 1.0 (RFC 4287) that readers and the W3C validator insist on."""
    test.assertTrue(data.startswith(b"<?xml"), "XML declaration first")
    root = parse(data)
    test.assertEqual(root.tag, f"{ATOM}feed")
    for tag in ("id", "title", "updated"):
        test.assertIsNotNone(root.find(f"{ATOM}{tag}"), f"feed needs <{tag}>")
    test.assertRegex(root.findtext(f"{ATOM}updated"), RFC3339)
    test.assertTrue(root.findtext(f"{ATOM}author/{ATOM}name"), "feed needs an author name")
    self_links = [l for l in root.findall(f"{ATOM}link") if l.get("rel") == "self"]
    test.assertEqual(len(self_links), 1, "exactly one rel=self link")
    ids = []
    for entry in root.findall(f"{ATOM}entry"):
        for tag in ("id", "title", "updated", "summary"):
            test.assertIsNotNone(entry.find(f"{ATOM}{tag}"), f"entry needs <{tag}>")
        test.assertRegex(entry.findtext(f"{ATOM}updated"), RFC3339)
        test.assertTrue(entry.findtext(f"{ATOM}id").startswith("tag:"), "permanent tag: IDs")
        alternate = [l for l in entry.findall(f"{ATOM}link") if l.get("rel", "alternate") == "alternate"]
        test.assertEqual(len(alternate), 1, "entry needs one alternate link")
        test.assertTrue(alternate[0].get("href").startswith(BASE), "full addresses")
        ids.append(entry.findtext(f"{ATOM}id"))
    test.assertEqual(len(ids), len(set(ids)), "entry IDs unique")
    return root


def entries(root):
    return root.findall(f"{ATOM}entry")


class CleanText(unittest.TestCase):
    def test_removes_characters_xml_forbids(self):
        self.assertEqual(build_feeds.clean_text("a\x00b\x1bc\x7f￾d\ud800e"), "abc\x7fde")

    def test_keeps_normal_text_and_tidies_whitespace(self):
        self.assertEqual(build_feeds.clean_text("  Dassault Systèmes 🙂\n\tline  "), "Dassault Systèmes 🙂 line")
        self.assertEqual(build_feeds.clean_text(None), "")
        self.assertEqual(build_feeds.clean_text(42), "42")


class Slugs(unittest.TestCase):
    def test_readable_addresses(self):
        cases = {
            "Microsoft": "microsoft", "Dassault Systèmes": "dassault-systemes", "Notepad++": "notepad",
            "Spreadsheet::ParseExcel": "spreadsheet-parseexcel", "Hewlett Packard Enterprise (HPE)": "hewlett-packard-enterprise-hpe",
            "Treck TCP/IP stack": "treck-tcp-ip-stack", "Joomla!": "joomla",
        }
        for name, slug in cases.items():
            self.assertEqual(build_feeds.slugify(name), slug, name)

    def test_collision_the_bigger_vendor_keeps_the_clean_address(self):
        slugs = build_feeds.vendor_slugs({"Foo Bar": 10, "foo-bar": 1, "Other": 3})
        self.assertEqual(slugs["Foo Bar"], "foo-bar")
        self.assertRegex(slugs["foo-bar"], r"^foo-bar-[0-9a-f]{6}$")
        self.assertEqual(slugs["Other"], "other")
        self.assertEqual(slugs, build_feeds.vendor_slugs({"Other": 3, "foo-bar": 1, "Foo Bar": 10}), "order doesn't matter")

    def test_a_new_vendor_never_changes_existing_addresses(self):
        before = build_feeds.vendor_slugs({"Microsoft": 390, "Cisco": 80})
        after = build_feeds.vendor_slugs({"Microsoft": 390, "Cisco": 80, "microsoft": 1, "Zyxel": 5})
        self.assertEqual(before["Microsoft"], after["Microsoft"])
        self.assertEqual(before["Cisco"], after["Cisco"])
        self.assertEqual(len(set(after.values())), 4, "unique")

    def test_name_with_no_letters_still_gets_an_address(self):
        self.assertRegex(build_feeds.vendor_slugs({"!!!": 1})["!!!"], r"^vendor-[0-9a-f]{6}$")


class KevFeed(unittest.TestCase):
    def setUp(self):
        self.data = [kev(f"CVE-2026-{1000 + i}", f"2026-10-{1 + i % 28:02d}") for i in range(60)]
        self.data += [kev("CVE-2026-9999", "2026-11-06"), kev("CVE-2026-10000", "2026-11-06", ransomware=True)]

    def test_valid_newest_50_in_order(self):
        root = assert_valid_atom(self, build_feeds.kev_feed(self.data, BASE))
        es = entries(root)
        self.assertEqual(len(es), 50)
        dates = [e.findtext(f"{ATOM}updated") for e in es]
        self.assertEqual(dates, sorted(dates, reverse=True), "newest first")
        self.assertEqual([e.findtext(f"{ATOM}title").split(":")[0] for e in es[:2]], ["CVE-2026-10000", "CVE-2026-9999"],
                         "same day: higher CVE number first (10000 > 9999, not text order)")
        self.assertEqual(root.findtext(f"{ATOM}updated"), "2026-11-06T00:00:00Z", "feed updated = newest data date")

    def test_entry_contents(self):
        first = entries(parse(build_feeds.kev_feed(self.data, BASE)))[0]
        self.assertEqual(first.findtext(f"{ATOM}id"), "tag:zelin.se,2026:kev/CVE-2026-10000")
        self.assertEqual(first.find(f"{ATOM}link").get("href"), BASE + "#CVE-2026-10000", "opens the entry on the Radar")
        summary = first.findtext(f"{ATOM}summary")
        for part in ("Acme · Widget", "lets an attacker run code", "Known ransomware use: Yes", "CISA due date: 2026-12-01"):
            self.assertIn(part, summary)
        self.assertIn("ransomware", [c.get("term") for c in first.findall(f"{ATOM}category")])
        self.assertIn("Acme", [c.get("term") for c in first.findall(f"{ATOM}category")])

    def test_self_link_and_ids_independent_of_site_address(self):
        a = parse(build_feeds.kev_feed(self.data, "https://zelin.se/"))
        b = parse(build_feeds.kev_feed(self.data, "http://localhost:8765/"))
        self.assertEqual([l.get("href") for l in a.findall(f"{ATOM}link") if l.get("rel") == "self"], ["https://zelin.se/feeds/kev.xml"])
        self.assertEqual(a.findtext(f"{ATOM}id"), b.findtext(f"{ATOM}id"), "IDs never change if the site moves")

    def test_empty_catalog_still_valid(self):
        assert_valid_atom(self, build_feeds.kev_feed([], BASE))


class IssueFeeds(unittest.TestCase):
    def test_sitrep_latest_30_with_action_flag(self):
        issues = [sitrep(f"2026-{m:02d}-{d:02d}", action=(d == 2)) for m in (9, 10) for d in range(1, 19)]
        root = assert_valid_atom(self, build_feeds.sitrep_feed({"issues": issues}, BASE))
        es = entries(root)
        self.assertEqual(len(es), 30)
        self.assertEqual(es[0].findtext(f"{ATOM}id"), "tag:zelin.se,2026:sitrep/2026-10-18", "newest first")
        self.assertEqual(es[0].find(f"{ATOM}link").get("href"), BASE + "sitrep/?d=2026-10-18")
        self.assertIn("Summary for 2026-10-18.", es[0].findtext(f"{ATOM}summary"))
        self.assertIn("8 items, 2 emerging threats", es[0].findtext(f"{ATOM}summary"))
        flagged = [e.findtext(f"{ATOM}title") for e in es if "action needed" in e.findtext(f"{ATOM}title").lower()]
        self.assertEqual(flagged, ["Cyber Sitrep, Fri 2 Oct 2026 (action needed)"])

    def test_breachwire_stats_only_never_names(self):
        index = {"issues": [breachwire(76, "2026-11-07"), breachwire(73, "2026-11-04", sweden=1)]}
        index["issues"][0]["victimNames"] = ["Northwind Traders"]  # planted: must never be published
        index["issues"][0]["notes"] = "Contoso Pharmaceuticals"
        data = build_feeds.breachwire_feed(index, BASE)
        root = assert_valid_atom(self, data)
        self.assertNotIn(b"Northwind", data)
        self.assertNotIn(b"Contoso", data)
        first, second = entries(root)
        self.assertEqual(first.findtext(f"{ATOM}title"), "Breach Wire №76: 21 claimed victims in 9 countries")
        self.assertIn("posted by 11 groups", first.findtext(f"{ATOM}summary"))
        self.assertIn("Sweden: none", first.findtext(f"{ATOM}summary"))
        self.assertEqual(second.findtext(f"{ATOM}title"), "Breach Wire №73: 21 claimed victims in 9 countries (Sweden hit)")
        self.assertEqual(first.find(f"{ATOM}link").get("href"), BASE + "ransomware/?d=2026-11-07")

    def test_allowed_fields_are_explicit(self):
        self.assertEqual(set(build_feeds.BREACHWIRE_FIELDS), {"date", "issue", "window", "victims", "groups", "countries", "sweden"})


class VendorFeeds(unittest.TestCase):
    def test_one_feed_per_vendor_newest_20(self):
        data = [kev(f"CVE-2025-{1000 + i}", f"2025-12-{1 + i % 28:02d}", vendor="Microsoft", product="Windows") for i in range(25)]
        data += [kev("CVE-2026-0001", "2026-11-01", vendor="Broadcom", product="VMware ESXi"),
                 kev("CVE-2026-0002", "2026-11-02", vendor="Broadcom", product="VMware vCenter Server")]
        feeds, index = build_feeds.vendor_feeds(data, BASE)
        self.assertEqual(index, {"Broadcom": "feeds/vendors/broadcom.xml", "Microsoft": "feeds/vendors/microsoft.xml"})
        self.assertEqual(set(feeds), {"broadcom", "microsoft"})
        self.assertEqual(len(entries(assert_valid_atom(self, feeds["microsoft"]))), 20)
        broadcom = assert_valid_atom(self, feeds["broadcom"])
        self.assertEqual(broadcom.findtext(f"{ATOM}title"), "Threat Radar: Broadcom")
        self.assertEqual([e.findtext(f"{ATOM}summary").split(".")[0] for e in entries(broadcom)],
                         ["Broadcom · VMware vCenter Server", "Broadcom · VMware ESXi"])
        self.assertEqual(entries(broadcom)[0].findtext(f"{ATOM}id"), "tag:zelin.se,2026:kev/CVE-2026-0002",
                         "same ID as in the main feed, so readers don't show it twice")


class HostileText(unittest.TestCase):
    def test_markup_and_control_characters_stay_harmless(self):
        nasty = "<script>alert(1)</script> & ]]> \x00\x1b<!channel>"
        data = build_feeds.kev_feed([kev("CVE-2026-0001", "2026-11-01", vendor="Evil & Co <b>", name=nasty)], BASE)
        root = assert_valid_atom(self, data)
        entry = entries(root)[0]
        self.assertEqual(entry.findtext(f"{ATOM}title"), "CVE-2026-0001: <script>alert(1)</script> & ]]> <!channel>")
        self.assertIn(b"&lt;script&gt;", data)
        self.assertNotIn(b"<script>", data)
        self.assertNotIn(b"\x00", data)
        self.assertIn("Evil & Co <b>", [c.get("term") for c in entry.findall(f"{ATOM}category")])


class Output(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.data, self.out = root / "data", root / "feeds"
        (self.data / "sitrep").mkdir(parents=True)
        (self.data / "breachwire").mkdir()
        (self.data / "kev.json").write_text(json.dumps([kev("CVE-2026-0001", "2026-11-01", vendor="Cisco"),
                                                        kev("CVE-2026-0002", "2026-11-02", vendor="Zyxel")]), "utf-8")
        (self.data / "sitrep" / "index.json").write_text(json.dumps({"issues": [sitrep("2026-11-06")]}), "utf-8")
        (self.data / "breachwire" / "index.json").write_text(json.dumps({"issues": [breachwire(76, "2026-11-07")]}), "utf-8")
        self.out.mkdir()
        (self.out / "index.html").write_text("page", "utf-8")  # the Feeds page lives here too and must survive

    def run_main(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = build_feeds.main(["--data", str(self.data), "--out", str(self.out), *args])
        return code, out.getvalue(), err.getvalue()

    def snapshot(self):
        return {str(p.relative_to(self.out)): p.read_bytes() for p in sorted(self.out.rglob("*")) if p.is_file()}

    def test_writes_every_file_and_is_byte_identical_on_rerun(self):
        code, out, _ = self.run_main("--base-url", "https://zelin.se")
        self.assertEqual(code, 0)
        self.assertIn("3 feeds + 2 vendor feeds", out)
        first = self.snapshot()
        self.assertEqual(set(first), {"index.html", "kev.xml", "sitrep.xml", "breachwire.xml", "vendors.json",
                                      "vendors/cisco.xml", "vendors/zyxel.xml"})
        self.assertEqual(json.loads(first["vendors.json"]), {"Cisco": "feeds/vendors/cisco.xml", "Zyxel": "feeds/vendors/zyxel.xml"})
        self.assertIn(b'href="https://zelin.se/feeds/kev.xml"', first["kev.xml"], "base address gets its trailing slash")
        self.run_main("--base-url", "https://zelin.se/")
        self.assertEqual(self.snapshot(), first, "same data, same bytes (AC-5)")

    def test_removes_feeds_of_vendors_that_left_the_catalog(self):
        (self.out / "vendors").mkdir()
        (self.out / "vendors" / "gone.xml").write_text("old", "utf-8")
        self.run_main("--base-url", BASE)
        self.assertFalse((self.out / "vendors" / "gone.xml").exists())
        self.assertTrue((self.out / "index.html").exists())

    def test_refuses_a_bad_site_address(self):
        for bad in ("ftp://zelin.se/", "zelin.se", "https://", "javascript:alert(1)"):
            code, _, err = self.run_main("--base-url", bad)
            self.assertEqual(code, 2, bad)
            self.assertIn("site address", err)

    def test_real_published_data(self):
        out = Path(self.tmp.name) / "real"
        with redirect_stdout(io.StringIO()):
            code = build_feeds.main(["--data", str(ROOT / "site" / "data"), "--out", str(out), "--base-url", BASE])
        self.assertEqual(code, 0)
        kev_data = json.loads((ROOT / "site" / "data" / "kev.json").read_text("utf-8"))
        vendors = {e["vendorProject"] for e in kev_data}
        self.assertEqual(len(list((out / "vendors").glob("*.xml"))), len(vendors))
        self.assertEqual(len(entries(assert_valid_atom(self, (out / "kev.xml").read_bytes()))), 50)
        for name in ("sitrep.xml", "breachwire.xml"):
            assert_valid_atom(self, (out / name).read_bytes())
        for path in (out / "vendors").glob("*.xml"):
            assert_valid_atom(self, path.read_bytes())


if __name__ == "__main__":
    unittest.main()

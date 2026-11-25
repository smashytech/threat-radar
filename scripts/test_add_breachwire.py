"""Tests for add_breachwire.py, the gatekeeper for the public Breach Wire section.

Run from the repo root:
    python3 -m unittest discover -s scripts -p "test_*.py" -v

The victim names used here are INVENTED. Real victim names are never written to
this repository (spec 003 FR-2); the real-name check happens live, at publish time.
"""

import copy
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import add_breachwire  # noqa: E402

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
VALID = json.loads((FIXTURES / "breachwire_valid.json").read_text("utf-8"))

# 16 invented victims, one per claimed victim in the fixture.
FAKE_VICTIMS = [
    "Northwind Traders", "Contoso Pharmaceuticals", "Fabrikam Logistics", "Tailspin Toys",
    "Wingtip Hotels & Resorts", "Litware, Inc.", "Adventure Works Cycles", "Proseware Legal LLP",
    "Lucerne Publishing", "Margie's Travel", "Coho Winery", "Woodgrove Bank",
    "Alpine Ski House", "Fourth Coffee", "Wide World Importers", "Trey Research",
]


def run(*args):
    with redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
        return add_breachwire.main(list(args))


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.out = root / "breachwire"
        self.inbox = root / "issue.json"
        self.names = root / "victims.txt"
        self.names.write_text("\n".join(FAKE_VICTIMS) + "\n", "utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def publish(self, issue, names=True):
        self.inbox.write_text(issue if isinstance(issue, str) else json.dumps(issue, ensure_ascii=False), "utf-8")
        args = [str(self.inbox), "--out", str(self.out)]
        if names:
            args += ["--forbid", str(self.names)]
        return run(*args)

    def variant(self, change):
        issue = copy.deepcopy(VALID)
        change(issue)
        return issue

    def assert_refused(self, issue, names=True):
        self.assertNotEqual(self.publish(issue, names), 0)
        self.assertFalse(self.out.exists() and any(self.out.iterdir()), "something was written")


class ValidIssue(Base):
    def test_publishes_issue_and_index(self):
        self.assertEqual(self.publish(VALID), 0)
        self.assertEqual(sorted(p.name for p in self.out.iterdir()), ["2026-11-06.json", "index.json"])
        index = json.loads((self.out / "index.json").read_text("utf-8"))
        self.assertEqual(index, {"issues": [{
            "date": "2026-11-06", "issue": 75, "window": "2026-11-05",
            "victims": 16, "groups": 11, "countries": 5, "sweden": 0,
        }]})

    def test_content_preserved(self):
        self.publish(VALID)
        stored = json.loads((self.out / "2026-11-06.json").read_text("utf-8"))
        self.assertEqual(stored["groups"][0]["name"], "Akira")
        self.assertEqual(stored["groups"][0]["hits"], 4)
        self.assertEqual(stored["health"]["merged"], 27)
        self.assertEqual([c["country"] for r in stored["regions"] for c in r["countries"]][:2], ["United States", "Canada"])

    def test_zero_victim_day(self):
        quiet = self.variant(lambda i: i.update(
            stats={"victims": 0, "groups": 0, "countries": 0, "regions": 0}, regions=[], sectors=[], groups=[],
            quality={"singleSourced": 0, "claimOnly": 0, "sourcesDisagree": 0, "newGroups": 0},
            health={**i["health"], "merged": 11, "masked": 9, "reposts": 2}))
        self.names.write_text("", "utf-8")
        self.assertEqual(self.publish(quiet), 0)

    def test_sweden_counted(self):
        def add_sweden(i):
            i["regions"].insert(0, {"region": "Europe", "countries": [{"country": "Sweden", "flag": "🇸🇪", "count": 2}]})
            i["regions"][-1]["countries"][0]["count"] = 4  # two unattributed become Swedish
            i["stats"].update(countries=6, regions=5)
            i["sweden"] = 2
        self.assertEqual(self.publish(self.variant(add_sweden)), 0)


class NameGuard(Base):
    """FR-2 / AC-3: no victim name may ever reach the site."""

    def test_refuses_victim_name_in_profile(self):
        self.assert_refused(self.variant(lambda i: i["groups"][0].update(
            profile=i["groups"][0]["profile"] + " Also hit Contoso Pharmaceuticals today.")))

    def test_match_ignores_case_and_punctuation(self):
        self.assert_refused(self.variant(lambda i: i["groups"][3].update(profile="Claimed CONTOSO-pharmaceuticals again.")))

    def test_match_ignores_accents(self):
        self.names.write_text("\n".join(FAKE_VICTIMS + ["Fundação Exemplo"]) + "\n", "utf-8")
        self.assert_refused(self.variant(lambda i: i["groups"][2].update(profile="Hit Fundacao Exemplo.")))

    def test_refuses_name_in_any_field(self):
        self.assert_refused(self.variant(lambda i: i["sectors"][0].update(sector="Woodgrove Bank")))
        self.assert_refused(self.variant(lambda i: i["groups"][1].update(countries="United States (Litware Inc)")))

    def test_whole_words_only(self):
        # "Trey Research" must not be found inside unrelated words.
        self.assertEqual(self.publish(self.variant(lambda i: i["groups"][4].update(profile="Treyresearchers say little."))), 0)

    def test_name_list_is_required(self):
        self.assert_refused(VALID, names=False)

    def test_name_list_must_cover_every_victim(self):
        self.names.write_text("\n".join(FAKE_VICTIMS[:10]) + "\n", "utf-8")
        self.assert_refused(VALID)


SECTOR_LABELS = json.loads((FIXTURES / "breachwire_sector_labels.json").read_text("utf-8"))["labels"]


class SectorList(Base):
    """Spec 010: every sector label is mapped onto a fixed list of 17 sectors (+ Other)."""

    def test_seventeen_sectors_plus_other(self):
        self.assertEqual(len(add_breachwire.SECTORS), 17)
        self.assertNotIn("Other", add_breachwire.SECTORS)
        self.assertEqual(len({s.lower() for s in add_breachwire.SECTORS}), 17, "no near-duplicates")

    def test_every_real_label_lands_in_the_intended_sector(self):
        """AC-1: all 111 labels from 3-25 Nov 2026 (the owner reviews this table)."""
        wrong = [(x["label"], add_breachwire.map_sector(x["label"]), x["sector"]) for x in SECTOR_LABELS
                 if add_breachwire.map_sector(x["label"]) != x["sector"]]
        self.assertEqual(wrong, [], "label, got, expected")
        self.assertEqual(len(SECTOR_LABELS), 111)

    def test_hardly_anything_lands_in_other_because_of_the_rules(self):
        """AC-1 (as refined during build): labels that were already "Other"/"Mixed" can't be recovered."""
        lost = {"Other", "Mixed"}
        total = sum(x["victims"] for x in SECTOR_LABELS)
        by_rules = sum(x["victims"] for x in SECTOR_LABELS
                       if x["label"] not in lost and add_breachwire.map_sector(x["label"]) == "Other")
        self.assertLessEqual(by_rules / total, 0.02)

    def test_only_the_main_part_counts(self):
        self.assertEqual(add_breachwire.map_sector("Construction / luxury-retail fit-out"), "Construction & real estate")
        self.assertEqual(add_breachwire.map_sector("Manufacturing / retail"), "Manufacturing & industrial")

    def test_tricky_words(self):
        self.assertEqual(add_breachwire.map_sector("Hospitality"), "Hospitality & leisure", "not 'hospital'")
        self.assertEqual(add_breachwire.map_sector("Advertising technology"), "Professional services", "marketing before technology")
        self.assertEqual(add_breachwire.map_sector("Fintech"), "Financial services & insurance", "finance before technology")
        self.assertEqual(add_breachwire.map_sector("Industrial distribution"), "Wholesale & distribution")
        self.assertEqual(add_breachwire.map_sector("Bed retail"), "Retail & e-commerce")
        self.assertEqual(add_breachwire.map_sector("Golf equipment"), "Retail & e-commerce")

    def test_unknown_label_goes_to_other_and_is_reported(self):
        self.assertEqual(add_breachwire.map_sector("Zeppelin chartering"), "Other")
        self.assertEqual(add_breachwire.unmapped_labels([{"sector": "Zeppelin chartering", "count": 2},
                                                          {"sector": "Healthcare", "count": 1},
                                                          {"sector": "Other", "count": 1}]), ["Zeppelin chartering"])

    def test_counts_landing_on_the_same_sector_are_added(self):
        merged = add_breachwire.merge_sectors([
            {"sector": "Retail & E-Commerce", "count": 2}, {"sector": "Bed retail", "count": 1},
            {"sector": "Healthcare", "count": 3}, {"sector": "Biotechnology", "count": 1}, {"sector": "Mixed", "count": 2}])
        self.assertEqual(merged, [{"sector": "Healthcare & life sciences", "count": 4},
                                  {"sector": "Retail & e-commerce", "count": 3}, {"sector": "Other", "count": 2}])

    def test_published_issue_is_stored_with_fixed_sectors_and_reports_unknown_labels(self):
        def labels(i):
            i["sectors"] = [{"sector": "Healthcare", "count": 10}, {"sector": "Zeppelin chartering", "count": i["stats"]["victims"] - 10}]
        self.inbox.write_text(json.dumps(self.variant(labels)), "utf-8")
        out = io.StringIO()
        with redirect_stdout(out):  # run() swallows output; call main() directly to see the warning
            code = add_breachwire.main([str(self.inbox), "--out", str(self.out), "--forbid", str(self.names)])
        self.assertEqual(code, 0)
        stored = json.loads((self.out / "2026-11-06.json").read_text("utf-8"))
        self.assertTrue({s["sector"] for s in stored["sectors"]} <= set(add_breachwire.SECTORS) | {"Other"})
        self.assertIn("Zeppelin chartering", out.getvalue(), "unknown labels are printed so the list can grow")

    def test_rebuild_maps_stored_issues(self):
        self.publish(VALID)
        path = self.out / "2026-11-06.json"
        old = json.loads(path.read_text("utf-8"))
        old["sectors"] = [{"sector": "Not stated", "count": 1}, {"sector": "Sector not disclosed", "count": old["stats"]["victims"] - 1}]
        path.write_text(json.dumps(old), "utf-8")  # as stored by an older version of the rules
        self.assertNotEqual(run("--check", "--out", str(self.out)), 0)
        self.assertEqual(run("--rebuild", "--out", str(self.out)), 0)
        self.assertEqual(run("--check", "--out", str(self.out)), 0)
        stored = json.loads(path.read_text("utf-8"))
        self.assertEqual(stored["sectors"], [{"sector": "Not disclosed", "count": old["stats"]["victims"]}])

    def test_name_guard_still_sees_the_raw_label(self):
        """A victim name used as a sector label must be refused, not quietly mapped to a sector."""
        self.assert_refused(self.variant(lambda i: i["sectors"][0].update(sector="Woodgrove Bank")))


class GroupNames(Base):
    """Spec 010: one gang is never counted as two."""

    def test_key_ignores_case_spaces_and_punctuation(self):
        k = add_breachwire.group_key
        self.assertEqual(k("The Gentlemen"), k("THE GENTLEMEN"))
        self.assertEqual(k("Brain Cipher"), k("BrainCipher"))
        self.assertEqual(k("SilentRansomGroup"), k("Silent Ransom Group"))
        self.assertNotEqual(k("Play"), k("Playa"))

    def test_alias_sets_the_stored_name(self):
        def spelled(i):
            i["groups"][0]["name"] = "INC RANSOM"
        self.assertEqual(self.publish(self.variant(spelled)), 0)
        stored = json.loads((self.out / "2026-11-06.json").read_text("utf-8"))
        self.assertIn("INC Ransom", [g["name"] for g in stored["groups"]])

    def test_same_gang_twice_in_one_issue_is_refused(self):
        def twice(i):
            i["groups"][1]["name"] = i["groups"][0]["name"].upper()
        self.assert_refused(self.variant(twice))


class Consistency(Base):
    """FR-4 / AC-4: the numbers must add up."""

    def test_country_sum(self):
        self.assert_refused(self.variant(lambda i: i["regions"][0]["countries"][0].update(count=7)))

    def test_sector_sum(self):
        self.assert_refused(self.variant(lambda i: i["sectors"][0].update(count=4)))

    def test_group_hits_sum(self):
        self.assert_refused(self.variant(lambda i: i["groups"][0].update(hits=5)))

    def test_group_count(self):
        self.assert_refused(self.variant(lambda i: i["stats"].update(groups=12)))

    def test_country_count(self):
        self.assert_refused(self.variant(lambda i: i["stats"].update(countries=6)))

    def test_region_count(self):
        self.assert_refused(self.variant(lambda i: i["stats"].update(regions=5)))

    def test_reconciliation(self):
        self.assert_refused(self.variant(lambda i: i["health"].update(merged=30)))

    def test_sweden_must_match_regions(self):
        self.assert_refused(self.variant(lambda i: i.update(sweden=1)))

    def test_zero_hit_group_not_allowed(self):
        def add_ghost(i):
            i["groups"].append({"name": "BYOD", "hits": 0, "profile": "Repost only.", "countries": "", "sectors": ""})
        self.assert_refused(self.variant(add_ghost))

    def test_quality_cannot_exceed_victims(self):
        self.assert_refused(self.variant(lambda i: i["quality"].update(claimOnly=17)))

    def test_new_groups_may_be_not_recorded(self):
        """Spec 012: older issues don't record it; null means "not recorded", never a guess."""
        issue = self.variant(lambda i: i["quality"].update(newGroups=None))
        stored = add_breachwire.validate_issue(json.loads(issue) if isinstance(issue, str) else issue)
        self.assertIsNone(stored["quality"]["newGroups"])
        for bad in ("2", -1, True):
            self.assert_refused(self.variant(lambda i, b=bad: i["quality"].update(newGroups=b)))

    def test_window_must_be_before_date(self):
        self.assert_refused(self.variant(lambda i: i.update(window="2026-11-06")))


class Refused(Base):
    """AC-6: malformed input is refused and nothing is written."""

    def test_not_json(self):
        self.assert_refused('{"date": ')

    def test_unknown_field(self):
        self.assert_refused(self.variant(lambda i: i.update(victims=["x"])))

    def test_unknown_group_field(self):
        self.assert_refused(self.variant(lambda i: i["groups"][0].update(leakSite="x")))

    def test_missing_field(self):
        self.assert_refused(self.variant(lambda i: i.pop("health")))

    def test_unknown_region(self):
        self.assert_refused(self.variant(lambda i: i["regions"][0].update(region="Atlantis")))

    def test_bad_date(self):
        self.assert_refused(self.variant(lambda i: i.update(date="2026-02-30")))

    def test_negative_count(self):
        self.assert_refused(self.variant(lambda i: i["health"].update(masked=-1)))

    def test_boolean_is_not_a_number(self):
        self.assert_refused(self.variant(lambda i: i.update(sweden=True)))

    def test_no_links_or_domains(self):
        self.assert_refused(self.variant(lambda i: i["groups"][3].update(profile="Leak site business-data-leaks.com is back.")))
        self.assert_refused(self.variant(lambda i: i["groups"][3].update(profile="See https://example.org/x")))
        self.assert_refused(self.variant(lambda i: i["groups"][3].update(profile="Masked ne*****h.com posting.")))
        self.assert_refused(self.variant(lambda i: i["groups"][3].update(profile="Mirror at abcdefghijklmnop.onion")))

    def test_oversized_profile(self):
        self.assert_refused(self.variant(lambda i: i["groups"][0].update(profile="x " * 1000)))


class HostileText(Base):
    """AC-7 (data side): markup is stored as plain text; the page renders it as text."""

    def test_markup_kept_verbatim(self):
        hostile = json.loads((FIXTURES / "breachwire_xss.json").read_text("utf-8"))
        self.assertEqual(self.publish(hostile), 0)
        stored = json.loads((self.out / "2026-11-04.json").read_text("utf-8"))
        self.assertIn("<script>", stored["groups"][0]["profile"])


class Idempotent(Base):
    """AC-8."""

    def test_byte_identical(self):
        self.publish(VALID)
        first = {p.name: p.read_bytes() for p in self.out.iterdir()}
        self.publish(VALID)
        self.assertEqual(first, {p.name: p.read_bytes() for p in self.out.iterdir()})


class Check(Base):
    def setUp(self):
        super().setUp()
        self.publish(VALID)

    def check(self):
        return run("--check", "--out", str(self.out))

    def test_good(self):
        self.assertEqual(self.check(), 0)

    def test_tampered_numbers(self):
        path = self.out / "2026-11-06.json"
        data = json.loads(path.read_text("utf-8"))
        data["stats"]["victims"] = 99
        path.write_text(json.dumps(data), "utf-8")
        self.assertNotEqual(self.check(), 0)

    def test_stale_index(self):
        (self.out / "index.json").write_text('{"issues": []}', "utf-8")
        self.assertNotEqual(self.check(), 0)

    def test_missing_folder_is_fine(self):
        self.assertEqual(run("--check", "--out", str(Path(self.tmp.name) / "none")), 0)


if __name__ == "__main__":
    unittest.main()

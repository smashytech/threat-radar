"""Tests for build_breach_stats.py (spec 010 AC-4, AC-5).
Run: python3 -m unittest scripts/test_build_breach_stats.py"""
import copy
import json
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import add_breachwire  # noqa: E402
import build_breach_stats as stats  # noqa: E402

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
VALID = json.loads((FIXTURES / "breachwire_valid.json").read_text("utf-8"))
V = VALID["stats"]["victims"]


def issue(window: str, *, issue_no=1, groups=None, sweden=0, sectors=None):
    """A valid stored issue for the claims posted on `window` (sent the day after)."""
    i = copy.deepcopy(VALID)
    i["window"] = window
    i["date"] = (date.fromisoformat(window) + timedelta(days=1)).isoformat()
    i["issue"] = issue_no
    if groups is not None:
        i["groups"] = [dict(i["groups"][0], name=n, hits=h, profile=f"Profile of {n}.") for n, h in groups]
        i["stats"]["groups"] = len(groups)
        i["quality"]["newGroups"] = min(i["quality"]["newGroups"], len(groups))
    if sectors is not None:
        i["sectors"] = [{"sector": s, "count": c} for s, c in sectors]
    if sweden:
        i["sweden"] = 0  # the fixture has no Swedish victims; keep it consistent
    return add_breachwire.validate_issue(i)


def write(folder: Path, issues):
    folder.mkdir(parents=True, exist_ok=True)
    for i in issues:
        (folder / f"{i['date']}.json").write_text(add_breachwire.to_json(i), "utf-8")
    (folder / "index.json").write_text(add_breachwire.to_json(add_breachwire.build_index({i["date"]: i for i in issues})), "utf-8")


class MonthsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name) / "breachwire"

    def tearDown(self):
        self.tmp.cleanup()

    def build(self, issues):
        write(self.folder, issues)
        return stats.build(add_breachwire.load_stored(self.folder))

    def test_a_month_is_the_day_the_claims_were_posted(self):
        """Claims posted 31 Oct belong to October, though the digest went out on 1 Nov."""
        s = self.build([issue("2026-10-31", issue_no=1), issue("2026-11-01", issue_no=2), issue("2026-11-02", issue_no=3)])
        self.assertEqual([(m["month"], m["days"], m["victims"]) for m in s["months"]], [("2026-10", 1, V), ("2026-11", 2, 2 * V)])
        self.assertEqual(s["months"][1]["perDay"], round(V, 1))
        self.assertEqual((s["from"], s["to"], s["issues"]), ("2026-10-31", "2026-11-02", 3))

    def test_sectors_per_month_cover_every_fixed_sector(self):
        s = self.build([issue("2026-11-01", sectors=[("Healthcare", V - 2), ("Banking", 2)])])
        month = s["months"][0]
        self.assertEqual(set(month["sectors"]), set(add_breachwire.SECTORS) | {"Other"})
        self.assertEqual(month["sectors"]["Healthcare & life sciences"], V - 2)
        self.assertEqual(month["sectors"]["Financial services & insurance"], 2)
        self.assertEqual(month["sectors"]["Education"], 0)
        self.assertEqual(sum(month["sectors"].values()), month["victims"])
        self.assertEqual(s["sectors"], add_breachwire.SECTORS + ["Other"])

    def test_one_gang_in_several_spellings_counts_once(self):
        """AC-3 across issues."""
        s = self.build([issue("2026-11-01", groups=[("The Gentlemen", V)]),
                        issue("2026-11-02", groups=[("THE GENTLEMEN", V - 1), ("Qilin", 1)]),
                        issue("2026-11-03", groups=[("The Gentlemen", V)])])
        top = s["months"][0]["groups"]
        self.assertEqual(top[0], {"name": "The Gentlemen", "hits": 3 * V - 1}, "shown in its most common spelling")
        self.assertEqual(s["months"][0]["groupCount"], 2)

    def test_tie_in_spelling_prefers_not_all_capitals(self):
        s = self.build([issue("2026-11-01", groups=[("CLIMAX", V)]), issue("2026-11-02", groups=[("Climax", V)])])
        self.assertEqual(s["months"][0]["groups"][0]["name"], "Climax")

    def test_new_groups_are_counted_from_the_second_month(self):
        s = self.build([issue("2026-10-30", groups=[("Akira", V)]),
                        issue("2026-11-01", groups=[("AKIRA", V - 2), ("Vortex", 2)])])
        self.assertIsNone(s["months"][0]["newGroups"], "the first month has nothing to compare with")
        self.assertEqual(s["months"][1]["newGroups"], ["Vortex"])

    def test_top_groups_capped_and_ordered(self):
        names = [(f"Gang{n:02}", 1) for n in range(V)]
        s = self.build([issue("2026-11-01", groups=names)])
        top = s["months"][0]["groups"]
        self.assertEqual(len(top), stats.TOP_GROUPS)
        self.assertEqual(top[0]["name"], "Gang00", "equal claims: alphabetical")

    def test_sweden_is_summed(self):
        i = issue("2026-11-01")
        i2 = copy.deepcopy(i)
        i2["date"], i2["window"] = "2026-11-03", "2026-11-02"
        self.assertEqual(self.build([i, i2])["months"][0]["sweden"], i["sweden"] + i2["sweden"])

    def test_only_numbers_sectors_and_group_names_reach_the_output(self):
        """AC-5: group profiles and other free text are never copied."""
        planted = issue("2026-11-01", groups=[("Akira", V)])
        planted["groups"][0]["profile"] = "Claimed PLANTED-VICTIM-NAME today."
        planted["groups"][0]["countries"] = "PLANTED-COUNTRY-TEXT"
        planted["groups"][0]["sectors"] = "PLANTED-SECTOR-TEXT"
        text = json.dumps(self.build([planted]))
        for needle in ("PLANTED", "Profile of", "lowCoverage", "health", "regions"):
            self.assertNotIn(needle, text)

    def test_same_issues_same_bytes(self):
        issues = [issue("2026-11-01", issue_no=1), issue("2026-11-02", issue_no=2)]
        self.assertEqual(stats.to_text(self.build(issues)), stats.to_text(self.build(list(reversed(issues)))))

    def test_no_issues_gives_an_empty_but_valid_file(self):
        s = self.build([])
        self.assertEqual((s["months"], s["issues"], s["from"]), ([], 0, None))


def profiled(window, groups, issue_no=1):
    """An issue whose groups carry the given (name, hits, profile)."""
    i = issue(window, issue_no=issue_no, groups=[(n, h) for n, h, _ in groups])
    for g, (_, _, p) in zip(i["groups"], groups):
        g["profile"] = p
    return i


class GroupProfilesTest(unittest.TestCase):
    """Spec 013: the latest profile per gang, for the (i) in Trends."""

    def build(self, issues):
        return stats.build_groups({i["date"]: i for i in issues})

    def test_newest_non_empty_profile_wins_and_spellings_merge(self):
        g = self.build([profiled("2026-11-01", [("Akira", V, "Old words.")], 1),
                        profiled("2026-11-02", [("AKIRA", V, "New words.")], 2),
                        profiled("2026-11-03", [("Akira", V, "")], 3)])
        entry = g["groups"][0]
        self.assertEqual((entry["name"], entry["profile"], entry["issue"]), ("Akira", "New words.", 2))
        self.assertEqual(entry["date"], (date(2026, 11, 2) + timedelta(days=1)).isoformat(), "the issue's date, for the link")

    def test_a_gang_never_profiled_has_no_entry(self):
        g = self.build([profiled("2026-11-01", [("Akira", V - 1, "Words."), ("Qilin", 1, "")])])
        self.assertEqual([e["name"] for e in g["groups"]], ["Akira"])

    def test_names_match_trends(self):
        issues = [profiled("2026-11-01", [("The Gentlemen", V, "A.")], 1), profiled("2026-11-02", [("THE GENTLEMEN", V, "B.")], 2),
                  profiled("2026-11-03", [("The Gentlemen", V, "")], 3)]
        trends = stats.build({i["date"]: i for i in issues})
        self.assertEqual(self.build(issues)["groups"][0]["name"], trends["months"][0]["groups"][0]["name"])

    def test_only_allow_listed_fields(self):
        """AC-2: nothing but name, profile, date and issue number."""
        i = profiled("2026-11-01", [("Akira", V, "Words.")])
        i["groups"][0]["countries"] = "PLANTED-COUNTRY"
        i["groups"][0]["sectors"] = "PLANTED-SECTOR"
        text = json.dumps(self.build([i]))
        self.assertNotIn("PLANTED", text)
        self.assertEqual(set(self.build([i])["groups"][0]), {"name", "profile", "date", "issue"})

    def test_same_issues_same_bytes(self):
        issues = [profiled("2026-11-01", [("Akira", V - 1, "A."), ("Qilin", 1, "Q.")], 1), profiled("2026-11-02", [("Play", V, "P.")], 2)]
        self.assertEqual(stats.to_text(self.build(issues)), stats.to_text(self.build(list(reversed(issues)))))


class CliTest(unittest.TestCase):
    def test_writes_next_to_the_breachwire_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            write(data / "breachwire", [issue("2026-11-01")])
            self.assertEqual(stats.main(["--data", str(data)]), 0)
            out = json.loads((data / "breachwire-stats.json").read_text("utf-8"))
            self.assertEqual(out["issues"], 1)
            self.assertEqual(add_breachwire.check(data / "breachwire"), 1, "the gatekeeper's folder stays clean")
            groups = json.loads((data / "breachwire-groups.json").read_text("utf-8"))
            self.assertEqual(len(groups["groups"]), len(VALID["groups"]))


if __name__ == "__main__":
    unittest.main()

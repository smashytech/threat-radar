"""Tests for notify_slack.py, the Slack alerts (spec 005 FR-10 to FR-17).

Run from the repo root:
    python3 -m unittest discover -s scripts -p "test_*.py" -v

No real Slack is involved: a tiny local web server plays Slack's part.
The victim names used here are INVENTED (spec 003 FR-2).
"""

import io
import json
import re
import sys
import tempfile
import threading
import time
import unittest
from contextlib import redirect_stderr, redirect_stdout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import notify_slack  # noqa: E402

BASE = "https://example.test/"
SECRET_PART = "T0000SECRET/B0000SECRET/xyzSUPERSECRETxyz"


def kev(cve, date, vendor="Acme", product="Widget", ransomware=False, name=None):
    return {"cveID": cve, "vendorProject": vendor, "product": product, "dateAdded": date, "dueDate": "2026-12-01",
            "vulnerabilityName": name or f"{vendor} {product} Remote Code Execution Vulnerability",
            "shortDescription": "Lets an attacker run code.", "requiredAction": "Patch.", "notes": "", "cwes": [],
            "knownRansomwareCampaignUse": "Known" if ransomware else "Unknown"}


def sitrep(date, action=False):
    return {"date": date, "tldr": f"Summary for {date}.", "items": 8, "emerging": 2, "actionNeeded": action}


def breachwire(issue, date, sweden=0):
    return {"date": date, "issue": issue, "window": date, "victims": 21, "groups": 11, "countries": 9, "sweden": sweden}


def texts(payload):
    """Every piece of text Slack will show, as one string."""
    out = [payload["text"]]
    for block in payload["blocks"]:
        if "text" in block:
            out.append(block["text"]["text"])
        for element in block.get("elements", []):
            out.append(element["text"])
    return "\n".join(out)


def our_links_only(test, payload):
    """In Slack text, '<' starts a link or mention. The only ones allowed are links we built to the site."""
    for match in re.finditer(r"<([^>]*)>", texts(payload)):
        test.assertTrue(match.group(1).startswith(BASE), f"unexpected Slack markup: {match.group(0)}")


class Escaping(unittest.TestCase):
    def test_mentions_links_and_ampersands_become_plain_text(self):
        self.assertEqual(notify_slack.slack_escape("<!channel> & <https://evil.example|click>"),
                         "&lt;!channel&gt; &amp; &lt;https://evil.example|click&gt;")

    def test_control_characters_removed_and_long_text_shortened(self):
        self.assertEqual(notify_slack.slack_escape("a\x00b\x1bc"), "abc")
        self.assertEqual(len(notify_slack.slack_escape("x" * 1000, limit=300)), 300)
        self.assertTrue(notify_slack.slack_escape("x" * 1000, limit=300).endswith("…"))


class WhatsNew(unittest.TestCase):
    def test_new_kev_entries_newest_first(self):
        old = [kev("CVE-2026-0001", "2026-11-01"), kev("CVE-2026-0002", "2026-11-02")]
        new = old[1:] + [kev("CVE-2026-0003", "2026-11-05"), kev("CVE-2026-0004", "2026-11-06"), kev("CVE-2026-10000", "2026-11-06")]
        self.assertEqual([e["cveID"] for e in notify_slack.new_kev(old, new)], ["CVE-2026-10000", "CVE-2026-0004", "CVE-2026-0003"])
        self.assertEqual(notify_slack.new_kev(new, new), [])

    def test_new_issues_by_date(self):
        old = {"issues": [sitrep("2026-11-05")]}
        new = {"issues": [sitrep("2026-11-06"), sitrep("2026-11-05")]}
        self.assertEqual([i["date"] for i in notify_slack.new_issues(old, new, notify_slack.SITREP_FIELDS)], ["2026-11-06"])


class KevMessage(unittest.TestCase):
    def test_nothing_new_means_no_message(self):
        self.assertIsNone(notify_slack.kev_message([], BASE))

    def test_three_new_entries(self):
        entries = [kev("CVE-2026-0003", "2026-11-06", ransomware=True), kev("CVE-2026-0002", "2026-11-06"), kev("CVE-2026-0001", "2026-11-05")]
        payload = notify_slack.kev_message(entries, BASE)
        shown = texts(payload)
        self.assertIn("3 new exploited vulnerabilities", shown)
        for cve in ("CVE-2026-0001", "CVE-2026-0002", "CVE-2026-0003"):
            self.assertIn(f"<{BASE}#{cve}|{cve}>", shown, "each CVE links to its Radar entry")
        self.assertEqual(shown.count("Known ransomware use"), 1)
        self.assertIn("Acme · Widget · CISA due 2026-12-01", shown)
        self.assertFalse(payload["unfurl_links"])
        self.assertFalse(payload["unfurl_media"])
        self.assertNotIn("more", shown.split("\n")[-1].split("Open Threat Radar")[0])

    def test_twenty_five_new_lists_ten_and_says_how_many_more(self):
        entries = [kev(f"CVE-2026-{1000 + i}", "2026-11-06") for i in range(25)]
        shown = texts(notify_slack.kev_message(entries, BASE))
        self.assertIn("25 new exploited vulnerabilities", shown)
        self.assertEqual(len(re.findall(r"\|CVE-2026-\d+>", shown)), 10)
        self.assertIn("and 15 more", shown)
        self.assertLessEqual(len(notify_slack.kev_message(entries, BASE)["blocks"]), 50, "Slack allows 50 blocks")

    def test_hostile_text_shows_literally(self):
        nasty = kev("CVE-2026-0001", "2026-11-06", vendor="Evil & Co", name="<!channel> look <https://evil.example|here>")
        payload = notify_slack.kev_message([nasty], BASE)
        our_links_only(self, payload)
        self.assertIn("&lt;!channel&gt; look &lt;https://evil.example|here&gt;", texts(payload))
        self.assertIn("Evil &amp; Co", texts(payload))

    def test_odd_cve_id_is_not_made_into_a_link(self):
        payload = notify_slack.kev_message([kev("CVE-2026-0001|x>", "2026-11-06")], BASE)
        our_links_only(self, payload)


class IssueMessages(unittest.TestCase):
    def test_sitrep(self):
        payload = notify_slack.sitrep_message([sitrep("2026-11-06", action=True)], BASE)
        shown = texts(payload)
        for part in ("Cyber Sitrep, Fri 6 Nov 2026", "Action needed", "Summary for 2026-11-06.", "8 items, 2 emerging threats",
                     f"<{BASE}sitrep/?d=2026-11-06|"):
            self.assertIn(part, shown)
        self.assertIsNone(notify_slack.sitrep_message([], BASE))

    def test_breachwire_with_sweden_hit_and_no_names(self):
        issue = breachwire(73, "2026-11-04", sweden=1)
        issue["victimNames"] = ["Northwind Traders"]  # planted: must never be sent
        issue["notes"] = "Contoso Pharmaceuticals"
        new = notify_slack.new_issues({"issues": []}, {"issues": [issue]}, notify_slack.BREACHWIRE_FIELDS)
        payload = notify_slack.breachwire_message(new, BASE)
        raw = json.dumps(payload)
        self.assertNotIn("Northwind", raw)
        self.assertNotIn("Contoso", raw)
        shown = texts(payload)
        for part in ("Breach Wire №73", "21 claimed victims in 9 countries, posted by 11 groups", "Sweden hit: 1 organisation claimed",
                     f"<{BASE}ransomware/?d=2026-11-04|"):
            self.assertIn(part, shown)
        self.assertNotIn("Sweden hit", texts(notify_slack.breachwire_message([breachwire(76, "2026-11-07")], BASE)))


class FromData(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.old, self.new = Path(self.tmp.name) / "old", Path(self.tmp.name) / "new"

    def write(self, root, kev_entries=None, sitreps=None, issues=None):
        if kev_entries is not None:
            root.mkdir(parents=True, exist_ok=True)
            (root / "kev.json").write_text(json.dumps(kev_entries), "utf-8")
        if sitreps is not None:
            (root / "sitrep").mkdir(parents=True, exist_ok=True)
            (root / "sitrep" / "index.json").write_text(json.dumps({"issues": sitreps}), "utf-8")
        if issues is not None:
            (root / "breachwire").mkdir(parents=True, exist_ok=True)
            (root / "breachwire" / "index.json").write_text(json.dumps({"issues": issues}), "utf-8")

    def test_one_message_per_kind_in_order(self):
        self.write(self.old, [kev("CVE-2026-0001", "2026-11-05")], [sitrep("2026-11-05")], [breachwire(75, "2026-11-06")])
        self.write(self.new, [kev("CVE-2026-0001", "2026-11-05"), kev("CVE-2026-0002", "2026-11-06")],
                   [sitrep("2026-11-06"), sitrep("2026-11-05")], [breachwire(76, "2026-11-07"), breachwire(75, "2026-11-06")])
        messages, notes = notify_slack.messages_for(self.old, self.new, BASE)
        self.assertEqual([m.kind for m in messages], ["KEV", "Sitrep", "Breach Wire"])
        self.assertEqual([m.count for m in messages], [1, 1, 1])
        self.assertEqual(notes, [])

    def test_nothing_new_nothing_sent(self):
        self.write(self.old, [kev("CVE-2026-0001", "2026-11-05")], [sitrep("2026-11-05")], [breachwire(75, "2026-11-06")])
        self.write(self.new, [kev("CVE-2026-0001", "2026-11-05")], [sitrep("2026-11-05")], [breachwire(75, "2026-11-06")])
        self.assertEqual(notify_slack.messages_for(self.old, self.new, BASE)[0], [])

    def test_missing_old_data_is_no_baseline_not_a_flood(self):
        self.write(self.old, [kev("CVE-2026-0001", "2026-11-05")])
        self.write(self.new, [kev("CVE-2026-0001", "2026-11-05")], [sitrep("2026-11-06")], [breachwire(76, "2026-11-07")])
        messages, notes = notify_slack.messages_for(self.old, self.new, BASE)
        self.assertEqual(messages, [])
        self.assertEqual(len(notes), 2)

    def test_empty_or_broken_old_file_is_skipped_not_a_crash(self):
        self.write(self.old, [kev("CVE-2026-0001", "2026-11-05")], [sitrep("2026-11-05")])
        (self.old / "sitrep" / "index.json").write_text("", "utf-8")
        self.write(self.new, [kev("CVE-2026-0001", "2026-11-05"), kev("CVE-2026-0002", "2026-11-06")], [sitrep("2026-11-06")])
        messages, notes = notify_slack.messages_for(self.old, self.new, BASE)
        self.assertEqual([m.kind for m in messages], ["KEV"])
        self.assertEqual(notes, ["Sitrep: couldn't read sitrep/index.json; skipped this time"])


class FakeSlack(BaseHTTPRequestHandler):
    """Plays Slack: /ok → 200 ok, /bad → 400 invalid_payload, /gone → 404 no_service, /slow → too slow."""
    requests = []

    def do_POST(self):  # noqa: N802 (name required by http.server)
        body = self.rfile.read(int(self.headers["Content-Length"]))
        FakeSlack.requests.append({"path": self.path, "type": self.headers["Content-Type"], "body": json.loads(body)})
        status, reply = {"ok": (200, "ok"), "bad": (400, "invalid_payload"), "gone": (404, "no_service")}.get(self.path.split("/")[-1], (200, "ok"))
        if self.path.endswith("/slow"):
            time.sleep(1.5)
        try:
            self.send_response(status)
            self.end_headers()
            self.wfile.write(reply.encode())
        except OSError:
            pass  # the "too slow" client has already hung up

    def log_message(self, *args):
        pass


class Sending(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeSlack)  # one slow request mustn't block the next test
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.root = f"http://127.0.0.1:{cls.server.server_port}/services/{SECRET_PART}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        FakeSlack.requests = []
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.old, self.new = Path(self.tmp.name) / "old", Path(self.tmp.name) / "new"
        for root, entries in ((self.old, [kev("CVE-2026-0001", "2026-11-05")]),
                              (self.new, [kev("CVE-2026-0001", "2026-11-05"), kev("CVE-2026-0002", "2026-11-06")])):
            root.mkdir()
            (root / "kev.json").write_text(json.dumps(entries), "utf-8")
            (root / "sitrep").mkdir()
            (root / "breachwire").mkdir()
        (self.old / "sitrep" / "index.json").write_text(json.dumps({"issues": [sitrep("2026-11-05")]}), "utf-8")
        (self.new / "sitrep" / "index.json").write_text(json.dumps({"issues": [sitrep("2026-11-06"), sitrep("2026-11-05")]}), "utf-8")
        for root in (self.old, self.new):
            (root / "breachwire" / "index.json").write_text(json.dumps({"issues": [breachwire(75, "2026-11-06")]}), "utf-8")
        self.sleeps = []

    def run_main(self, *args, url=None, allow_local=True):
        env = {} if url is None else {"SLACK_WEBHOOK_URL": url}
        out, err = io.StringIO(), io.StringIO()
        prefixes = ("https://hooks.slack.com/", "http://127.0.0.1:") if allow_local else notify_slack.WEBHOOK_PREFIXES
        with mock.patch.object(notify_slack, "WEBHOOK_PREFIXES", prefixes), mock.patch.object(notify_slack, "TIMEOUT", 0.5), \
                redirect_stdout(out), redirect_stderr(err):
            code = notify_slack.main(["--old", str(self.old), "--new", str(self.new), "--site-url", BASE, *args],
                                     env=env, sleep=self.sleeps.append)
        output = out.getvalue() + err.getvalue()
        self.assertNotIn("SECRET", output, "the webhook address must never be printed")
        return code, output

    def test_sends_json_and_reports_without_the_address(self):
        code, output = self.run_main(url=self.root + "/ok")
        self.assertEqual(code, 0)
        self.assertEqual(len(FakeSlack.requests), 2, "KEV + Sitrep; Breach Wire had nothing new")
        self.assertEqual(FakeSlack.requests[0]["type"], "application/json")
        self.assertIn("1 new exploited vulnerability", FakeSlack.requests[0]["body"]["text"])
        self.assertEqual(self.sleeps, [notify_slack.PAUSE], "a pause between messages (Slack allows about one per second)")
        self.assertIn("KEV: 1 new → sent", output)
        self.assertIn("Breach Wire: nothing new", output)

    def test_refused_or_unreachable_is_a_failure_with_slacks_reason(self):
        for path, reason in (("/bad", "invalid_payload"), ("/gone", "no_service"), ("/slow", "timed out")):
            code, output = self.run_main(url=self.root + path)
            self.assertEqual(code, 1, path)
            self.assertIn(reason, output)

    def test_no_secret_means_skip_quietly(self):
        code, output = self.run_main()
        self.assertEqual(code, 0)
        self.assertIn("aren't set up", output)
        self.assertEqual(FakeSlack.requests, [])

    def test_only_slack_addresses_are_accepted(self):
        code, output = self.run_main(url=self.root + "/ok", allow_local=False)
        self.assertEqual(code, 2)
        self.assertIn("doesn't look like a Slack webhook", output)
        self.assertEqual(FakeSlack.requests, [])

    def test_test_message(self):
        code, output = self.run_main("--test-message", url=self.root + "/ok")
        self.assertEqual(code, 0)
        self.assertEqual(len(FakeSlack.requests), 1)
        self.assertIn("Threat Radar alerts are set up", FakeSlack.requests[0]["body"]["text"])

    def test_dry_run_shows_messages_and_sends_nothing(self):
        code, output = self.run_main("--dry-run")
        self.assertEqual(code, 0)
        self.assertEqual(FakeSlack.requests, [])
        self.assertIn('"unfurl_links": false', output)


if __name__ == "__main__":
    unittest.main()

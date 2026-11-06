// Tests for site/sitrep-logic.js, the Sitrep page's pure logic.
// Run from the repo root:  node --test tests/sitrep.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { pickIssueDate, kevSet, markCves, isActionNeeded, teaserLabel, CVE_ID_RE } from "../site/sitrep-logic.js";

const issues = [{ date: "2026-11-06" }, { date: "2026-11-05" }, { date: "2026-11-04" }];

test("no ?d= shows the latest issue", () => {
  assert.deepEqual(pickIssueDate("", issues), { date: "2026-11-06", status: "latest" });
});

test("a listed date opens that issue (AC-3)", () => {
  assert.deepEqual(pickIssueDate("?d=2026-11-04", issues), { date: "2026-11-04", status: "requested" });
});

test("unknown or malformed dates fall back to the latest, flagged (AC-3)", () => {
  for (const bad of ["2026-11-01", "2026-13-99", "../data/kev", "2026-11-06.json", "2026-11-06/../x", "%2e%2e%2f", "<script>"]) {
    const result = pickIssueDate(`?d=${encodeURIComponent(bad)}`, issues);
    assert.equal(result.status, "unknown", bad);
    assert.equal(result.date, "2026-11-06", bad);
    assert.equal(result.requested, bad);
  }
});

test("no issues at all", () => {
  assert.deepEqual(pickIssueDate("?d=2026-11-06", []), { date: null, status: "none" });
  assert.deepEqual(pickIssueDate("", undefined), { date: null, status: "none" });
});

test("CVE ↔ KEV matching marks only KEV-listed CVEs (AC-5)", () => {
  const kev = kevSet([{ cveID: "CVE-2026-7273" }, { cveID: "CVE-2024-27834" }]);
  assert.deepEqual(markCves(["CVE-2026-7273", "CVE-2026-107441"], kev), [
    { cve: "CVE-2026-7273", inKev: true },
    { cve: "CVE-2026-107441", inKev: false },
  ]);
  assert.deepEqual(markCves([], kev), []);
  assert.deepEqual(markCves(undefined, kev), []);
  assert.deepEqual(markCves(["CVE-2024-27834"], null), [{ cve: "CVE-2024-27834", inKev: false }]); // KEV not loaded yet
});

test("action-needed detection matches the Python gatekeeper", () => {
  assert.equal(isActionNeeded("Nothing requiring action."), false);
  assert.equal(isActionNeeded("  nothing requiring action today"), false);
  assert.equal(isActionNeeded("Patch Zyxel GS1900 switches now."), true);
});

test("teaser says Today's for today's issue, Latest otherwise", () => {
  assert.equal(teaserLabel("2026-11-06", "2026-11-06"), "Today's Sitrep");
  assert.equal(teaserLabel("2026-11-05", "2026-11-06"), "Latest Sitrep");
});

test("CVE id pattern used for /#CVE-… deep links", () => {
  assert.ok(CVE_ID_RE.test("CVE-2021-44228"));
  assert.ok(CVE_ID_RE.test("CVE-2026-111497"));
  assert.ok(!CVE_ID_RE.test("CVE-2021-44228x"));
  assert.ok(!CVE_ID_RE.test("javascript:alert(1)"));
});

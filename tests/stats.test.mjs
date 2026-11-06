// Tests for site/stats.js, the site's number crunching.
// Run from the repo root:  node --test tests/stats.test.mjs
//
// "Today" is pinned to 2026-11-06 so the answers never drift.
// The expected numbers were counted by hand from tests/fixtures/kev_valid.json.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  shiftDays, summarize, monthlyCounts, topVendors, vendorList, filterEntries, matchesQuery,
} from "../site/stats.js";

const TODAY = "2026-11-06";
const feed = JSON.parse(readFileSync(new URL("./fixtures/kev_valid.json", import.meta.url), "utf8"));
const entries = feed.vulnerabilities;

test("shiftDays moves across month and year boundaries", () => {
  assert.equal(shiftDays("2026-11-06", -6), "2026-10-31");
  assert.equal(shiftDays("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDays("2024-02-28", 1), "2024-02-29");
});

test("summary cards (AC-4)", () => {
  assert.deepEqual(summarize(entries, TODAY), {
    total: 12,
    last7: 2,       // 2026-11-03, 2026-11-04
    last30: 6,      // 10-13, 10-29, 10-30 x2, 11-03, 11-04
    ransomware: 4,  // Cisco, JetBrains, Broadcom, Apache (Log4j)
  });
});

test("summary agrees with an independent recount (AC-4)", () => {
  const cutoff7 = shiftDays(TODAY, -6);
  const cutoff30 = shiftDays(TODAY, -29);
  let last7 = 0, last30 = 0, ransomware = 0;
  for (const e of entries) {
    if (e.dateAdded >= cutoff7 && e.dateAdded <= TODAY) last7++;
    if (e.dateAdded >= cutoff30 && e.dateAdded <= TODAY) last30++;
    if (e.knownRansomwareCampaignUse === "Known") ransomware++;
  }
  assert.deepEqual(summarize(entries, TODAY), { total: entries.length, last7, last30, ransomware });
});

test("monthly counts cover exactly the last 12 months, oldest first", () => {
  const months = monthlyCounts(entries, TODAY, 12);
  assert.equal(months.length, 12);
  assert.equal(months[0].month, "2025-12");
  assert.equal(months[11].month, "2026-11");
  const byMonth = Object.fromEntries(months.map((m) => [m.month, m.count]));
  assert.equal(byMonth["2026-07"], 1);
  assert.equal(byMonth["2026-08"], 2);
  assert.equal(byMonth["2026-09"], 2);
  assert.equal(byMonth["2026-10"], 4);
  assert.equal(byMonth["2026-11"], 2);
  assert.equal(byMonth["2026-01"], 0);
  // Log4j (2021) is outside the window and must not be counted anywhere.
  assert.equal(months.reduce((sum, m) => sum + m.count, 0), 11);
});

test("top vendors: most entries first, ties alphabetical", () => {
  assert.deepEqual(topVendors(entries, 3), [
    { vendor: "Microsoft", count: 3 },
    { vendor: "Ivanti", count: 2 },
    { vendor: "Apache", count: 1 },
  ]);
  assert.equal(topVendors(entries, 10).length, 9); // only 9 distinct vendors exist
});

test("vendor list for the dropdown is complete", () => {
  const list = vendorList(entries);
  assert.equal(list.length, 9);
  assert.deepEqual(list[0], { vendor: "Microsoft", count: 3 });
});

test("search by CVE ID finds Log4j (AC-5)", () => {
  const hits = filterEntries(entries, { query: "CVE-2021-44228", today: TODAY });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].product, "Log4j2");
});

test("an exact CVE ID match is listed first, even if newer entries mention it", () => {
  const original = { cveID: "CVE-2021-44228", vendorProject: "Apache", product: "Log4j2", vulnerabilityName: "Log4j RCE", shortDescription: "", dateAdded: "2021-12-10" };
  const followUp = { cveID: "CVE-2021-45046", vendorProject: "Apache", product: "Log4j2", vulnerabilityName: "Log4j", shortDescription: "Incomplete fix for CVE-2021-44228", dateAdded: "2023-05-01" };
  const hits = filterEntries([followUp, original], { query: " cve-2021-44228 ", today: TODAY });
  assert.deepEqual(hits.map((e) => e.cveID), ["CVE-2021-44228", "CVE-2021-45046"]);
});

test("search is case-insensitive and every word must match", () => {
  assert.equal(filterEntries(entries, { query: "log4j", today: TODAY }).length, 1);
  assert.equal(filterEntries(entries, { query: "LOG4J apache", today: TODAY }).length, 1);
  assert.equal(filterEntries(entries, { query: "log4j cisco", today: TODAY }).length, 0);
});

test("vendor filter returns only that vendor (AC-5)", () => {
  const hits = filterEntries(entries, { vendor: "Microsoft", today: TODAY });
  assert.equal(hits.length, 3);
  assert.ok(hits.every((e) => e.vendorProject === "Microsoft"));
});

test("ransomware and time-window filters, alone and combined", () => {
  assert.equal(filterEntries(entries, { ransomwareOnly: true, today: TODAY }).length, 4);
  assert.equal(filterEntries(entries, { windowDays: 30, today: TODAY }).length, 6);
  assert.equal(filterEntries(entries, { windowDays: 7, today: TODAY }).length, 2);
  assert.equal(filterEntries(entries, { ransomwareOnly: true, windowDays: 30, today: TODAY }).length, 0);
  assert.equal(filterEntries(entries, { vendor: "Ivanti", windowDays: 30, today: TODAY }).length, 2);
  assert.equal(filterEntries(entries, { today: TODAY }).length, 12); // no filters = everything
});

test("hostile search text is treated as plain text, never as a pattern", () => {
  for (const q of ["(", "[a-z", ".*", "\\", "<script>"]) {
    assert.doesNotThrow(() => filterEntries(entries, { query: q, today: TODAY }));
  }
  assert.equal(matchesQuery({ cveID: "CVE-1", vendorProject: "a.b", product: "", vulnerabilityName: "", shortDescription: "" }, "a.b"), true);
  assert.equal(matchesQuery({ cveID: "CVE-1", vendorProject: "axb", product: "", vulnerabilityName: "", shortDescription: "" }, "a.b"), false);
});

test("filtering never reorders or mutates the input", () => {
  const before = JSON.stringify(entries);
  filterEntries(entries, { query: "microsoft", ransomwareOnly: true, windowDays: 7, today: TODAY });
  assert.equal(JSON.stringify(entries), before);
});

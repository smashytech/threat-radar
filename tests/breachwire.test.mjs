// Tests for site/breachwire-logic.js.
// Run from the repo root:  node --test tests/breachwire.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { swedenStatus, regionTotals, ransomwareKev, chartBars, teaserSummary } from "../site/breachwire-logic.js";

const issue = JSON.parse(readFileSync(new URL("./fixtures/breachwire_valid.json", import.meta.url), "utf8"));

test("Sweden status: clear and hit", () => {
  assert.deepEqual(swedenStatus(0), { level: "clear", text: "No Swedish organisations were claimed in this window." });
  assert.deepEqual(swedenStatus(1), { level: "hit", text: "1 Swedish organisation was claimed in this window." });
  assert.equal(swedenStatus(3).text, "3 Swedish organisations were claimed in this window.");
});

test("region totals, biggest first, Unattributed always last", () => {
  const totals = regionTotals(issue.regions);
  assert.deepEqual(totals.map((r) => [r.region, r.total]), [
    ["North America", 7], ["Latin America & Caribbean", 1], ["Asia", 1], ["Oceania", 1], ["Unattributed", 6],
  ]);
});

test("Sweden's region is pinned to the top when present", () => {
  const withSweden = [{ region: "Europe", countries: [{ country: "Sweden", flag: "🇸🇪", count: 1 }] }, ...issue.regions];
  assert.equal(regionTotals(withSweden)[0].region, "Europe");
});

test("KEV entries with known ransomware use, newest first, within the window (AC-11)", () => {
  const kev = [
    { cveID: "CVE-1", dateAdded: "2026-11-04", knownRansomwareCampaignUse: "Known" },
    { cveID: "CVE-2", dateAdded: "2026-11-05", knownRansomwareCampaignUse: "Unknown" },
    { cveID: "CVE-3", dateAdded: "2026-10-01", knownRansomwareCampaignUse: "Known" },
    { cveID: "CVE-4", dateAdded: "2026-06-01", knownRansomwareCampaignUse: "Known" },
    { cveID: "CVE-5", dateAdded: "2026-11-05", knownRansomwareCampaignUse: "Known" },
  ];
  const result = ransomwareKev(kev, "2026-11-06", 90, 8);
  assert.deepEqual(result.recent.map((e) => e.cveID), ["CVE-5", "CVE-1", "CVE-3"]);
  assert.equal(result.total, 4);
  assert.deepEqual(ransomwareKev(kev, "2026-11-06", 90, 2).recent.map((e) => e.cveID), ["CVE-5", "CVE-1"]);
  assert.deepEqual(ransomwareKev(null, "2026-11-06").recent, []);
});

test("without a window: the newest known-ransomware entries regardless of age", () => {
  // CISA usually marks new entries "Unknown" and flips them to "Known" later, so a short window is often empty.
  const kev = [
    { cveID: "CVE-A", dateAdded: "2026-03-01", knownRansomwareCampaignUse: "Known" },
    { cveID: "CVE-B", dateAdded: "2025-12-01", knownRansomwareCampaignUse: "Known" },
    { cveID: "CVE-C", dateAdded: "2026-11-05", knownRansomwareCampaignUse: "Unknown" },
  ];
  assert.deepEqual(ransomwareKev(kev, "2026-11-06", null, 8).recent.map((e) => e.cveID), ["CVE-A", "CVE-B"]);
});

test("chart bars: oldest left, scaled to the biggest day, never zero-height for non-zero days", () => {
  const index = [{ date: "2026-11-06", victims: 16 }, { date: "2026-11-05", victims: 84 }, { date: "2026-11-04", victims: 0 }];
  const bars = chartBars(index, 30);
  assert.deepEqual(bars.map((b) => b.date), ["2026-11-04", "2026-11-05", "2026-11-06"]);
  assert.equal(bars[1].ratio, 1);
  assert.equal(bars[0].ratio, 0);
  assert.ok(bars[2].ratio > 0.18 && bars[2].ratio < 0.2);
  assert.equal(chartBars(index, 2).length, 2); // only the most recent N
});

test("homepage teaser summary", () => {
  assert.equal(teaserSummary({ victims: 16, groups: 11, countries: 5 }),
    "16 claimed victims across 5 countries, posted by 11 groups.");
  assert.equal(teaserSummary({ victims: 1, groups: 1, countries: 1 }),
    "1 claimed victim across 1 country, posted by 1 group.");
});

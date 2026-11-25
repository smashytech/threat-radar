// Spec 010 FR-8 – FR-11: the Trends section's logic.
// Run from the repo root:  node --test tests/breach-stats.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { monthName, monthRows, sectorGrid, shadeLevel, topGroups, sinceLine, tabFromHash, TABS, groupIndex, factsLine } from "../site/breach-stats-logic.js";

const SECTORS = ["Healthcare & life sciences", "Education", "Not disclosed", "Other"];
const month = (m, victims, sectors, groups, newGroups = null, days = 30) =>
  ({ month: m, days, victims, perDay: Math.round((victims / days) * 10) / 10, sweden: 1,
     sectors: Object.fromEntries(SECTORS.map((s, i) => [s, sectors[i]])), groupCount: groups.length, groups, newGroups });
const g = (name, hits) => ({ name, hits });

const STATS = {
  from: "2026-10-01", to: "2026-11-24", issues: 54, sectors: SECTORS,
  months: [
    month("2026-10", 100, [20, 10, 60, 10], [g("Akira", 30), g("Qilin", 20), g("Play", 10)], null, 31),
    month("2026-11", 200, [60, 10, 110, 20], [g("Qilin", 80), g("Akira", 40), g("Vortex", 30), g("Lynx", 5)], ["Vortex"], 23),
  ],
};

test("month names are English and UTC-safe", () => {
  assert.equal(monthName("2026-11"), "November 2026");
  assert.equal(monthName("2026-01", { short: true }), "Jan");
});

test("per-month rows, newest first, with 'so far' only on the current month", () => {
  const rows = monthRows(STATS, "2026-11-25");
  assert.deepEqual(rows.map((r) => [r.month, r.label, r.soFar]), [["2026-11", "November 2026", true], ["2026-10", "October 2026", false]]);
  assert.equal(rows[0].perDay, 8.7);
  assert.equal(monthRows(STATS, "2026-12-01")[0].soFar, false, "a finished month is no longer 'so far'");
});

test("sector grid: shares per month, change in percentage points, sorted by the latest month", () => {
  const grid = sectorGrid(STATS);
  assert.deepEqual(grid.months, ["2026-10", "2026-11"]);
  assert.deepEqual(grid.rows.map((r) => r.sector), ["Not disclosed", "Healthcare & life sciences", "Education", "Other"],
    "largest share first, but Other always last");
  const health = grid.rows[1].cells;
  assert.deepEqual(health[0], { count: 20, share: 20, change: null });
  assert.deepEqual(health[1], { count: 60, share: 30, change: 10 });
  assert.equal(grid.rows[2].cells[1].change, -5);
});

test("sector grid: a month with no victims shows 0 % rather than dividing by zero", () => {
  const empty = { ...STATS, months: [month("2026-10", 0, [0, 0, 0, 0], [])] };
  assert.deepEqual(sectorGrid(empty).rows[0].cells[0], { count: 0, share: 0, change: null });
});

test("shade levels step with the share", () => {
  assert.deepEqual([0, 0.4, 3, 8, 15, 30].map(shadeLevel), [0, 1, 1, 2, 3, 4]);
});

test("top groups: share, rank change and the 'new' mark", () => {
  const top = topGroups(STATS, "2026-11", 10);
  assert.deepEqual(top.map((t) => [t.rank, t.name, t.share, t.move]), [
    [1, "Qilin", 40, { kind: "up", by: 1 }],
    [2, "Akira", 20, { kind: "down", by: 1 }],
    [3, "Vortex", 15, { kind: "new" }],
    [4, "Lynx", 2.5, { kind: "entered" }],
  ]);
  assert.deepEqual(topGroups(STATS, "2026-10", 10).map((t) => t.move), [null, null, null], "the first month has nothing to compare with");
  assert.equal(topGroups(STATS, "2026-11", 2).length, 2);
  assert.deepEqual(topGroups(STATS, "2099-01", 10), []);
});

test("an unchanged rank is marked as the same", () => {
  const same = { ...STATS, months: [STATS.months[0], month("2026-11", 60, [0, 0, 60, 0], [g("Akira", 60)], [])] };
  assert.deepEqual(topGroups(same, "2026-11", 10)[0].move, { kind: "same" });
});

test("the note says where the statistics start", () => {
  assert.equal(sinceLine(STATS), "Statistics from 1 October 2026, 54 daily issues.");
  assert.equal(sinceLine({ ...STATS, from: null, issues: 0, months: [] }), "No statistics yet.");
});

test("amendment A1: the address picks the tab; anything unknown opens today's issue", () => {
  assert.deepEqual(TABS, ["issue", "trends"]);
  assert.equal(tabFromHash("#trends"), "trends");
  assert.equal(tabFromHash("#TRENDS"), "trends");
  for (const h of ["", "#", "#issue", "#nope", "#trends-x"]) assert.equal(tabFromHash(h), "issue", h);
});

test("spec 015: group info is found by the name Trends shows; malformed entries are dropped", () => {
  const ok = { name: "Akira", brief: "B.", firstSeen: "2026-10-02", activeDays: { "2026-10": 21 }, latestIssue: "2026-11-24" };
  const index = groupIndex({ groups: [ok, { ...ok, name: "Qilin", brief: undefined }, { name: 5 }, { ...ok, name: "X", firstSeen: "soon" }, null] });
  assert.deepEqual(index.get("Akira"), ok);
  assert.equal(index.get("Qilin").brief, undefined, "facts only is fine");
  assert.equal(index.size, 2);
  assert.equal(groupIndex(null).size, 0);
  assert.equal(groupIndex({ groups: "nope" }).size, 0);
});

test("spec 015: the facts line follows the picked month", () => {
  const g = { firstSeen: "2026-10-02", activeDays: { "2026-10": 21, "2026-11": 23 } };
  assert.equal(factsLine(g, "2026-10", 25), "First seen 2 Oct 2026 · active on 21 of 25 days in October");
  assert.equal(factsLine(g, "2026-11", 24), "First seen 2 Oct 2026 · active on 23 of 24 days in November");
  assert.equal(factsLine({ ...g, activeDays: { "2026-11": 1 } }, "2026-11", 24), "First seen 2 Oct 2026 · active on 1 of 24 days in November");
  assert.equal(factsLine(g, "2026-12", 0), "First seen 2 Oct 2026");
});

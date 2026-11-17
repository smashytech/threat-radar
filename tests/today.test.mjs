// Spec 007 AC-1 – AC-4: the Today page's logic.
// Run from the repo root:  node --test tests/today.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstSentence, weekLine, weekEntries, newest, dueStatus, todayNumbers, wireBars, busiestMonth, stackWeekCount,
} from "../site/today-logic.js";

const TODAY = "2026-11-17";
const kev = (cveID, dateAdded, vendorProject = "Acme", extra = {}) =>
  ({ cveID, dateAdded, vendorProject, product: "Widget", vulnerabilityName: `${vendorProject} flaw`, dueDate: "2026-12-01", ...extra });

test("headline: the first sentence of the Sitrep summary", () => {
  assert.equal(firstSentence("Two live campaigns hit MSP tooling. Optimizely disclosed a breach."), "Two live campaigns hit MSP tooling.");
  assert.equal(firstSentence("Uber disclosed a breach affecting ~150,000 people. More follows."), "Uber disclosed a breach affecting ~150,000 people.");
  assert.equal(firstSentence("Is this real? Yes."), "Is this real?");
  assert.equal(firstSentence("No full stop at all"), "No full stop at all");
  assert.equal(firstSentence("  spaced   out.  Next. "), "spaced out.");
});

test("headline: cut at 160 characters at a word boundary, with an ellipsis", () => {
  const long = "Lighter news cycle but notably severe: a destructive wiper campaign hit Check Point gateways via a new webshell, two more zero-days saw same-day exploitation, and a new state-linked actor appeared. Second.";
  const h = firstSentence(long);
  assert.ok(h.length <= 160, `${h.length} characters`);
  assert.ok(h.endsWith("…"));
  assert.ok(long.startsWith(h.slice(0, -1).trimEnd()), "never cuts mid-word");
  assert.doesNotMatch(h, /[,:;]…$/, "no dangling punctuation before the ellipsis");
});

test("headline: missing or empty summary gives null", () => {
  assert.equal(firstSentence(undefined), null);
  assert.equal(firstSentence("   "), null);
});

test("week line handles 0, 1, 2, 3 and 4+ vendors (AC-2)", () => {
  assert.equal(weekLine([], TODAY), "CISA added no new exploited flaws this week.");
  assert.equal(weekLine([kev("CVE-2026-1", "2026-11-13", "Check Point")], TODAY), "CISA added 1 exploited flaw this week: Check Point.");
  assert.equal(weekLine([kev("CVE-2026-2", "2026-11-13", "Check Point"), kev("CVE-2026-1", "2026-11-13", "UnrealIRCd")], TODAY),
    "CISA added 2 exploited flaws this week: Check Point and UnrealIRCd.");
  assert.equal(weekLine([kev("CVE-2026-3", "2026-11-14", "A"), kev("CVE-2026-2", "2026-11-13", "B"), kev("CVE-2026-1", "2026-11-12", "A"), kev("CVE-2026-0", "2026-11-12", "C")], TODAY),
    "CISA added 4 exploited flaws this week: A, B and C.");
  const many = ["A", "B", "C", "D", "E"].map((v, i) => kev(`CVE-2026-${i}`, "2026-11-15", v));
  assert.equal(weekLine(many, TODAY), "CISA added 5 exploited flaws this week: E, D, C and 2 more vendors.");
});

test("this week = the last 7 days, today counted as day 1, nothing from the future", () => {
  const entries = [kev("CVE-2026-9", "2026-11-18"), kev("CVE-2026-8", "2026-11-17"), kev("CVE-2026-7", "2026-11-11"), kev("CVE-2026-6", "2026-11-10")];
  assert.deepEqual(weekEntries(entries, TODAY).map((e) => e.cveID), ["CVE-2026-8", "CVE-2026-7"]);
});

test("newest entries: by date, then by CVE number (CVE-2026-10000 after CVE-2026-9999)", () => {
  const list = [kev("CVE-2026-9999", "2026-11-10"), kev("CVE-2026-10000", "2026-11-10"), kev("CVE-2025-1", "2026-11-13")];
  assert.deepEqual(newest(list, 2).map((e) => e.cveID), ["CVE-2025-1", "CVE-2026-10000"]);
});

test("due status: overdue only once the due date has passed", () => {
  assert.deepEqual(dueStatus({ dueDate: "2026-11-16" }, TODAY), { overdue: true, date: "2026-11-16" });
  assert.deepEqual(dueStatus({ dueDate: "2026-11-17" }, TODAY), { overdue: false, date: "2026-11-17" });
  assert.deepEqual(dueStatus({ dueDate: "" }, TODAY), { overdue: false, date: null });
});

test("four key numbers, with and without a Breach Wire issue (AC-1, AC-3)", () => {
  const entries = [kev("CVE-2026-2", "2026-11-13"), kev("CVE-2026-1", "2026-10-20"), kev("CVE-2026-0", "2026-09-01")];
  const bw = { date: "2026-11-16", issue: 85, window: "2026-11-15", victims: 22, groups: 5, countries: 6, sweden: 0 };
  assert.deepEqual(todayNumbers(entries, bw, TODAY), { week: 1, month: 2, claims: 22, sweden: 0 });
  assert.deepEqual(todayNumbers(entries, null, TODAY), { week: 1, month: 2, claims: null, sweden: null });
});

test("Breach Wire bars use only the allowed counts, never names (AC-4)", () => {
  const issue = { victims: 22, groups: 5, countries: 6, sweden: 0, victimNames: ["Should Never Appear Ltd"] };
  const bars = wireBars(issue);
  assert.deepEqual(bars.map((b) => [b.label, b.n]), [["Victims", 22], ["Countries", 6], ["Groups", 5]]);
  assert.equal(bars[0].ratio, 1);
  assert.doesNotMatch(JSON.stringify(bars), /Should Never Appear/);
  assert.deepEqual(wireBars({ victims: 0, groups: 0, countries: 0 }).map((b) => b.ratio), [0, 0, 0], "no division by zero");
});

test("busiest month and the current month", () => {
  const months = [{ month: "2026-09", count: 43 }, { month: "2026-10", count: 36 }, { month: "2026-11", count: 15 }];
  assert.deepEqual(busiestMonth(months), { month: "2026-09", count: 43 });
  assert.equal(busiestMonth([]), null);
});

test("stack line counts only this week's entries that hit the stack (FR-5)", () => {
  const entries = [kev("CVE-2026-3", "2026-11-15", "Microsoft"), kev("CVE-2026-2", "2026-11-14", "Cisco"), kev("CVE-2026-1", "2026-10-01", "Microsoft")];
  assert.equal(stackWeekCount(entries, { Microsoft: [] }, TODAY), 1);
  assert.equal(stackWeekCount(entries, {}, TODAY), 0);
});

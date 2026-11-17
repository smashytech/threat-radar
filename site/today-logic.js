// today-logic.js: pure functions for the Today page (spec 007).
// No DOM, no network, no clock (tests/today.test.mjs).

import { shiftDays } from "./stats.js";
import { inStack } from "./stack-logic.js";

const HEADLINE_MAX = 160;

/** The first sentence of a text, at most 160 characters (cut at a word, with "…").
 *  A sentence ends at . ! or ? followed by a space and a capital letter, quote or bracket,
 *  so "~150,000" or "v2.1" don't end it. */
export function firstSentence(text) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const end = clean.search(/[.!?](?=\s+["“(A-Z])/);
  const sentence = end >= 0 ? clean.slice(0, end + 1) : clean;
  if (sentence.length <= HEADLINE_MAX) return sentence;
  const cut = sentence.slice(0, HEADLINE_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : HEADLINE_MAX - 1).replace(/[\s,;:–—-]+$/, "")}…`;
}

/** Same order as the feeds: newest date first; same day, higher CVE number first. */
function cveOrder(a, b) {
  if (a.dateAdded !== b.dateAdded) return a.dateAdded < b.dateAdded ? 1 : -1;
  const num = (e) => {
    const m = /^CVE-(\d{4})-(\d+)$/.exec(e.cveID);
    return m ? [Number(m[1]), Number(m[2])] : [0, 0];
  };
  const [ya, na] = num(a);
  const [yb, nb] = num(b);
  return yb - ya || nb - na || (a.cveID < b.cveID ? 1 : -1);
}

export function newest(entries, n) {
  return [...(entries || [])].sort(cveOrder).slice(0, n);
}

/** Entries added in the last 7 days (today is day 1), newest first. */
export function weekEntries(entries, today) {
  const from = shiftDays(today, -6);
  return newest((entries || []).filter((e) => e.dateAdded >= from && e.dateAdded <= today), Infinity);
}

/** "CISA added 2 exploited flaws this week: Check Point and UnrealIRCd." */
export function weekLine(entries, today) {
  const week = weekEntries(entries, today);
  if (!week.length) return "CISA added no new exploited flaws this week.";
  const vendors = [...new Set(week.map((e) => e.vendorProject))];
  const shown = vendors.slice(0, 3);
  const rest = vendors.length - shown.length;
  let names;
  if (rest > 0) names = `${shown.join(", ")} and ${rest} more ${rest === 1 ? "vendor" : "vendors"}`;
  else if (shown.length === 1) names = shown[0];
  else names = `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  const n = week.length;
  return `CISA added ${n} exploited ${n === 1 ? "flaw" : "flaws"} this week: ${names}.`;
}

/** CISA's due date, and whether it has passed. */
export function dueStatus(entry, today) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(entry?.dueDate || "") ? entry.dueDate : null;
  return { overdue: Boolean(date && date < today), date };
}

/** The four numbers under the headline. Breach Wire figures are null when there is no issue. */
export function todayNumbers(entries, breachWireIssue, today) {
  const from30 = shiftDays(today, -29);
  return {
    week: weekEntries(entries, today).length,
    month: (entries || []).filter((e) => e.dateAdded >= from30 && e.dateAdded <= today).length,
    claims: breachWireIssue ? Number(breachWireIssue.victims) || 0 : null,
    sweden: breachWireIssue ? Number(breachWireIssue.sweden) || 0 : null,
  };
}

/** Bars for the Breach Wire column. Reads ONLY these three counts (never names). */
export function wireBars(issue) {
  const rows = [["Victims", issue?.victims], ["Countries", issue?.countries], ["Groups", issue?.groups]]
    .map(([label, n]) => [label, Math.max(0, Number(n) || 0)]);
  const top = Math.max(0, ...rows.map(([, n]) => n));
  return rows.map(([label, n]) => ({ label, n, ratio: top ? n / top : 0 }));
}

export function busiestMonth(months) {
  if (!months || !months.length) return null;
  return months.reduce((best, m) => (m.count > best.count ? m : best));
}

/** How many of this week's new entries hit the visitor's stack. */
export function stackWeekCount(entries, vendors, today) {
  return weekEntries(entries, today).filter((e) => inStack(e, vendors)).length;
}

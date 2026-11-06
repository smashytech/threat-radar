// breachwire-logic.js: pure functions for the Ransomware (Breach Wire) page and teaser.
// No DOM, no network, no clock (tests/breachwire.test.mjs).

import { shiftDays } from "./stats.js";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function swedenStatus(count) {
  if (!count) return { level: "clear", text: "No Swedish organisations were claimed in this window." };
  return { level: "hit", text: `${plural(count, "Swedish organisation was", "Swedish organisations were")} claimed in this window.` };
}

/** Regions with their totals: Sweden's region first if present, then biggest first, Unattributed last. */
export function regionTotals(regions) {
  const rows = (regions || []).map((r, order) => ({
    region: r.region,
    countries: r.countries,
    total: r.countries.reduce((sum, c) => sum + c.count, 0),
    hasSweden: r.countries.some((c) => c.country.toLowerCase() === "sweden"),
    order,
  }));
  return rows.sort((a, b) =>
    (b.hasSweden - a.hasSweden) ||
    ((a.region === "Unattributed") - (b.region === "Unattributed")) ||
    (b.total - a.total) ||
    (a.order - b.order));
}

/** KEV entries known to be used in ransomware: total, plus the most recently added ones
 *  (optionally only within the last `days`; pass null for no age limit). */
export function ransomwareKev(kevEntries, today, days = null, limit = 8) {
  const known = (kevEntries || []).filter((e) => e.knownRansomwareCampaignUse === "Known");
  const cutoff = days ? shiftDays(today, -(days - 1)) : "";
  const recent = known
    .filter((e) => e.dateAdded >= cutoff && e.dateAdded <= today)
    .sort((a, b) => (a.dateAdded < b.dateAdded ? 1 : a.dateAdded > b.dateAdded ? -1 : a.cveID.localeCompare(b.cveID)))
    .slice(0, limit);
  return { total: known.length, recent };
}

/** Bars for the victims-per-issue chart: most recent `max` issues, oldest first, ratio 0..1. */
export function chartBars(indexIssues, max = 30) {
  const issues = (indexIssues || []).slice(0, max).reverse();
  const top = Math.max(1, ...issues.map((i) => i.victims));
  return issues.map((i) => ({ date: i.date, victims: i.victims, ratio: i.victims / top }));
}

export function teaserSummary({ victims, groups, countries }) {
  return `${plural(victims, "claimed victim", "claimed victims")} across ${plural(countries, "country", "countries")}, posted by ${plural(groups, "group", "groups")}.`;
}

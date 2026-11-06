// stats.js: pure functions that turn KEV entries into numbers and lists.
//
// "Pure" means: no web page, no network, no clock. Each function only looks
// at its inputs and returns a result. That makes them easy to test (see
// tests/stats.test.mjs) and easy to trust.
//
// Dates are handled as "YYYY-MM-DD" strings. Strings in that format sort the
// same way the dates do, so plain string comparison (>=, <=) works.

/** Move an ISO date string by n days (n can be negative). */
export function shiftDays(isoDate, n) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

/** Number of entries added in the last `days` days, counting today as day 1. */
export function countAddedWithin(entries, days, today) {
  const cutoff = shiftDays(today, -(days - 1));
  return entries.filter((e) => e.dateAdded >= cutoff && e.dateAdded <= today).length;
}

/** The four numbers on the summary cards. */
export function summarize(entries, today) {
  return {
    total: entries.length,
    last7: countAddedWithin(entries, 7, today),
    last30: countAddedWithin(entries, 30, today),
    ransomware: entries.filter((e) => e.knownRansomwareCampaignUse === "Known").length,
  };
}

/** Additions per calendar month for the last `months` months, oldest first. */
export function monthlyCounts(entries, today, months = 12) {
  const [year, month] = today.split("-").map(Number);
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    buckets.push({ month: d.toISOString().slice(0, 7), count: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.month, i]));
  for (const e of entries) {
    const i = index.get(e.dateAdded.slice(0, 7));
    if (i !== undefined && e.dateAdded <= today) buckets[i].count++;
  }
  return buckets;
}

/** Every vendor with its entry count: most entries first, ties alphabetical. */
export function vendorList(entries) {
  const counts = new Map();
  for (const e of entries) counts.set(e.vendorProject, (counts.get(e.vendorProject) || 0) + 1);
  return [...counts]
    .map(([vendor, count]) => ({ vendor, count }))
    .sort((a, b) => b.count - a.count || a.vendor.localeCompare(b.vendor, "en"));
}

/** The `n` vendors with the most entries. */
export function topVendors(entries, n = 10) {
  return vendorList(entries).slice(0, n);
}

const SEARCH_FIELDS = ["cveID", "vendorProject", "product", "vulnerabilityName", "shortDescription"];

/** True if every word of the query appears somewhere in the entry (case-insensitive).
 *  Uses plain text matching (includes), never regular expressions, so odd
 *  characters like "(" or ".*" are just characters. */
export function matchesQuery(entry, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = SEARCH_FIELDS.map((f) => String(entry[f] ?? "")).join(" \u0000 ").toLowerCase();
  return words.every((w) => haystack.includes(w));
}

/** Apply search text plus filters. Returns a new array; the input is untouched.
 *  options: { query, vendor, ransomwareOnly, windowDays, today } */
export function filterEntries(entries, { query = "", vendor = "", ransomwareOnly = false, windowDays = 0, today } = {}) {
  const cutoff = windowDays > 0 ? shiftDays(today, -(windowDays - 1)) : null;
  const hits = entries.filter((e) =>
    (!vendor || e.vendorProject === vendor) &&
    (!ransomwareOnly || e.knownRansomwareCampaignUse === "Known") &&
    (!cutoff || (e.dateAdded >= cutoff && e.dateAdded <= today)) &&
    matchesQuery(e, query)
  );
  // If someone typed an exact CVE ID, that entry goes first, ahead of entries
  // that merely mention it in their description.
  const exact = query.trim().toUpperCase();
  const index = exact.startsWith("CVE-") ? hits.findIndex((e) => e.cveID === exact) : -1;
  if (index > 0) hits.unshift(...hits.splice(index, 1));
  return hits;
}

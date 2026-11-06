// sitrep-logic.js: pure functions for the Sitrep page and the homepage teaser.
// No DOM, no network, no clock, so they're easy to test (tests/sitrep.test.mjs).

export const CVE_ID_RE = /^CVE-\d{4}-\d{4,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOTHING_TO_DO_RE = /^\s*nothing requiring action/i;

/** Decide which issue to show from the page address (?d=YYYY-MM-DD).
 *  Only a date that is BOTH well-formed AND listed in the index is accepted,
 *  so the address can never point the page at some other file. */
export function pickIssueDate(search, issues) {
  if (!Array.isArray(issues) || issues.length === 0) return { date: null, status: "none" };
  const latest = issues[0].date;
  const requested = new URLSearchParams(search).get("d");
  if (requested === null || requested === "") return { date: latest, status: "latest" };
  if (DATE_RE.test(requested) && issues.some((i) => i.date === requested)) {
    return { date: requested, status: "requested" };
  }
  return { date: latest, status: "unknown", requested };
}

/** A fast lookup of every CVE in the KEV catalog. */
export function kevSet(kevEntries) {
  return new Set((kevEntries || []).map((e) => e.cveID));
}

/** Pair each CVE with whether it's in KEV right now. */
export function markCves(cves, kev) {
  return (cves || []).map((cve) => ({ cve, inKev: Boolean(kev && kev.has(cve)) }));
}

/** Same rule as add_sitrep.py: "Nothing requiring action…" means no action needed. */
export function isActionNeeded(action) {
  return !NOTHING_TO_DO_RE.test(String(action || ""));
}

export function teaserLabel(issueDate, today) {
  return issueDate === today ? "Today's Sitrep" : "Latest Sitrep";
}

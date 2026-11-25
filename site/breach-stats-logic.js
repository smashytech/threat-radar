// breach-stats-logic.js: pure helpers for the Breaches page's Trends section (spec 010).
// No DOM here, so Node can test it: tests/breach-stats.test.mjs.
//
// Input is breachwire-stats.json, built at deploy by scripts/build_breach_stats.py.
// A month is the month the claims were posted (UTC), written "YYYY-MM".

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const OTHER = "Other";

/** "2026-11" → "November 2026", or "Nov" with { short: true }. */
export function monthName(ym, { short = false } = {}) {
  const [year, m] = ym.split("-").map(Number);
  const name = MONTHS[m - 1] ?? "?";
  return short ? name.slice(0, 3) : `${name} ${year}`;
}

/** Percentages with one decimal, as numbers (12.5, not "12.5"). */
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

/** FR-8: one row per month, newest first; the month containing `today` is "so far". */
export function monthRows(stats, today) {
  const current = today.slice(0, 7);
  return [...stats.months].reverse().map((m) => ({
    month: m.month, label: monthName(m.month), days: m.days, victims: m.victims,
    perDay: m.perDay, sweden: m.sweden, groupCount: m.groupCount, soFar: m.month === current,
  }));
}

/** FR-9: sectors × months. Each cell: count, share (%), change against the previous month (points). */
export function sectorGrid(stats) {
  const months = stats.months.map((m) => m.month);
  const rows = stats.sectors.map((sector) => {
    let prev = null;
    const cells = stats.months.map((m) => {
      const count = m.sectors[sector] ?? 0;
      const share = pct(count, m.victims);
      const change = prev === null ? null : Math.round((share - prev) * 10) / 10;
      prev = share;
      return { count, share, change };
    });
    return { sector, cells };
  });
  const latest = (r) => (r.cells.length ? r.cells[r.cells.length - 1].share : 0);
  rows.sort((a, b) =>
    (a.sector === OTHER) - (b.sector === OTHER) || latest(b) - latest(a) || a.sector.localeCompare(b.sector));
  return { months, rows };
}

/** Background strength for a share: 0 (none) to 4 (a big slice). */
export function shadeLevel(share) {
  if (share <= 0) return 0;
  if (share < 5) return 1;
  if (share < 10) return 2;
  if (share < 20) return 3;
  return 4;
}

/**
 * FR-10: the month's top `n` groups with share and movement against the previous month.
 * move: null (first month), {kind:"new"} (never seen before), {kind:"entered"} (seen before,
 * not in last month's list), {kind:"up"|"down", by}, or {kind:"same"}.
 */
export function topGroups(stats, ym, n = 10) {
  const i = stats.months.findIndex((m) => m.month === ym);
  if (i < 0) return [];
  const m = stats.months[i];
  const prev = i > 0 ? stats.months[i - 1] : null;
  const prevRank = new Map((prev?.groups ?? []).map((g, r) => [g.name, r + 1]));
  const fresh = new Set(m.newGroups ?? []);
  return m.groups.slice(0, n).map((g, r) => {
    const rank = r + 1;
    let move = null;
    if (prev) {
      const before = prevRank.get(g.name);
      if (fresh.has(g.name)) move = { kind: "new" };
      else if (before === undefined) move = { kind: "entered" };
      else if (before > rank) move = { kind: "up", by: before - rank };
      else if (before < rank) move = { kind: "down", by: rank - before };
      else move = { kind: "same" };
    }
    return { rank, name: g.name, hits: g.hits, share: pct(g.hits, m.victims), move };
  });
}

/** FR-11: where the statistics start. */
export function sinceLine(stats) {
  if (!stats.from || !stats.issues) return "No statistics yet.";
  const [y, m, d] = stats.from.split("-").map(Number);
  return `Statistics from ${d} ${MONTHS[m - 1]} ${y}, ${stats.issues} daily ${stats.issues === 1 ? "issue" : "issues"}.`;
}

/** Amendment A1: the Breaches page's two tabs, picked by the address (#trends). */
export const TABS = ["issue", "trends"];
export function tabFromHash(hash) {
  return String(hash).toLowerCase() === "#trends" ? "trends" : "issue";
}

/** Spec 015: name → { name, brief?, firstSeen, activeDays, latestIssue } from breachwire-groups.json. */
export function groupIndex(data) {
  const day = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v));
  const ok = (g) => g && typeof g.name === "string" && (g.brief === undefined || typeof g.brief === "string")
    && day(g.firstSeen) && day(g.latestIssue) && g.activeDays && typeof g.activeDays === "object";
  const list = data && Array.isArray(data.groups) ? data.groups.filter(ok) : [];
  return new Map(list.map((g) => [g.name, g]));
}

/**
 * Spec 015: "In Breach Wire since 2 Oct 2026 · active on 21 of 25 days in October" for the picked month.
 * `since` is the first day of our records: a gang seen that day may well be older.
 */
export function factsLine(group, ym, daysCovered, since) {
  const [y, m, d] = group.firstSeen.split("-").map(Number);
  const date = `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
  const first = group.firstSeen === since ? `In Breach Wire since our records began (${date})` : `In Breach Wire since ${date}`;
  const active = group.activeDays[ym];
  if (!active || !daysCovered) return first;
  return `${first} · active on ${active} of ${daysCovered} days in ${MONTHS[Number(ym.slice(5)) - 1]}`;
}

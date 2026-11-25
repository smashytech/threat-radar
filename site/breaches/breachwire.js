// breachwire.js: the Ransomware (Breach Wire) page.
//
// Flow: load the index → pick the issue from ?d= → draw stats, Sweden, regions,
//       sectors, ledger, data quality → draw the archive chart → load KEV and
//       list vulnerabilities known to be used by ransomware.
// My stack (spec 004): the visitor's ransomware-linked KEV entries are listed
// first and marked in the newest list.
//
// Issue text is untrusted (AI-copied from an email built from leak-site data),
// so it only reaches the page as text via el() (textContent). See ui.js.

import { el, svgEl, numberFmt, formatDate, formatLongDate, formatShortDay, localToday, loadJSON, infoTip, enableInfoTips } from "../ui.js";
import { pickIssueDate } from "../sitrep-logic.js";
import { swedenStatus, regionTotals, ransomwareKev, chartBars, archiveNote } from "../breachwire-logic.js";
import { monthRows, sectorGrid, shadeLevel, topGroups, sinceLine, monthName, tabFromHash, TABS, groupIndex, factsLine } from "../breach-stats-logic.js";
import { inStack } from "../stack-logic.js";
import { readStack, renderStackLine } from "../stack-page.js";

const $ = (id) => document.getElementById(id);
const stack = readStack();

async function init() {
  enableInfoTips();
  setupTabs();
  renderStackLine($("stack-line"), stack, "../exploited/#mystack");
  // KEV loads in parallel: the "Known ransomware use" panel works even before any issue exists.
  const kevPromise = loadJSON("../data/kev.json", { optional: true });
  try {
    const index = await loadJSON("../data/breachwire/index.json", { optional: true });
    const issues = index && Array.isArray(index.issues) ? index.issues : [];
    const pick = pickIssueDate(window.location.search, issues);
    renderArchive(issues, pick.date);

    if (pick.status === "none") {
      $("issue-line").textContent = "No issues published yet.";
      showNotice("The first Breach Wire issue will appear here after the next daily run.");
    } else {
      if (pick.status === "unknown") showNotice(`There's no issue for “${pick.requested}”. Showing the latest one instead.`);
      // Safe path: pick.date is a well-formed date listed in the index.
      renderIssue(await loadJSON(`../data/breachwire/${pick.date}.json`));
    }
  } catch (err) {
    console.error(err);
    $("issue-line").textContent = "Couldn't load Breach Wire. Please try refreshing the page.";
  }
  renderKev(await kevPromise);
}

// ---------- Tabs (spec 010 amendment A1) ----------
// "Today's issue" and "Trends". #trends in the address opens Trends; the statistics
// are fetched the first time Trends is shown, so the issue is never delayed.

function showTab(name, { focus = false, push = false } = {}) {
  for (const tab of TABS) {
    const button = $(`tab-${tab}`), panel = $(`panel-${tab}`), on = tab === name;
    button.setAttribute("aria-selected", String(on));
    button.tabIndex = on ? 0 : -1;
    panel.hidden = !on;
    if (on && focus) button.focus();
  }
  if (push) {
    const url = `${location.pathname}${location.search}${name === "trends" ? "#trends" : ""}`;
    history.pushState(null, "", url);
  }
  if (name === "trends") loadTrends();
}

function setupTabs() {
  for (const tab of TABS) $(`tab-${tab}`).addEventListener("click", () => showTab(tab, { push: tabFromHash(location.hash) !== tab }));
  $("tab-issue").parentElement.addEventListener("keydown", (event) => {
    const current = TABS.indexOf(tabFromHash(location.hash));
    const next = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: TABS.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const name = TABS[(next + TABS.length) % TABS.length];
    showTab(name, { focus: true, push: name !== TABS[current] });
  });
  window.addEventListener("popstate", () => showTab(tabFromHash(location.hash)));
  showTab(tabFromHash(location.hash));
}

// ---------- Trends (spec 010) ----------

let trendsLoading = null;
let groupInfo = new Map();
function loadTrends() {
  trendsLoading ??= (async () => {
    try {
      // Spec 013/015: briefs and facts per gang come with the statistics; Trends works without them.
      const groupsPromise = loadJSON("../data/breachwire-groups.json", { optional: true }).catch(() => null);
      const stats = await loadJSON("../data/breachwire-stats.json", { optional: true });
      groupInfo = groupIndex(await groupsPromise);
      if (!stats || !Array.isArray(stats.months) || !stats.months.length) {
        $("trends-status").textContent = "No statistics yet.";
        return;
      }
      renderTrends(stats);
      $("trends-status").hidden = true;
    } catch (err) {
      console.error(err); // Trends is extra; today's issue stays usable.
      $("trends-status").textContent = "Couldn't load the statistics. Please try refreshing the page.";
    }
  })();
  return trendsLoading;
}

function renderTrends(stats) {
  $("trends-since").textContent = sinceLine(stats);

  $("trend-months").replaceChildren(...monthRows(stats, localToday()).map((r) => el("tr", {}, [
    el("th", { attrs: { scope: "row" } }, [document.createTextNode(r.label), ...(r.soFar ? [el("span", { className: "muted", text: " so far" })] : [])]),
    el("td", { text: numberFmt.format(r.days) }),
    el("td", { text: numberFmt.format(r.victims) }),
    el("td", { text: r.perDay.toFixed(1) }),
    el("td", { text: numberFmt.format(r.sweden) }),
    el("td", { text: numberFmt.format(r.groupCount) }),
  ])));

  const grid = sectorGrid(stats);
  const head = el("tr", {}, [el("th", { attrs: { scope: "col" }, text: "Sector" }),
    ...grid.months.map((m) => el("th", { attrs: { scope: "col" }, text: monthName(m, { short: true }) + " " + m.slice(2, 4) }))]);
  const body = grid.rows.map((row) => el("tr", {}, [
    el("th", { attrs: { scope: "row" }, text: row.sector }),
    ...row.cells.map((c) => el("td", { className: `shade shade--${shadeLevel(c.share)}`, attrs: { title: `${numberFmt.format(c.count)} claimed victims` } }, [
      el("span", { className: "shade__share", text: `${c.share.toFixed(1)} %` }),
      ...(c.change === null ? [] : [changeMark(c.change)]),
    ])),
  ]));
  $("sector-grid").replaceChildren(
    el("caption", { className: "visually-hidden", text: "Each sector's share of the month's claimed victims, and the change from the month before in percentage points" }),
    el("thead", {}, [head]), el("tbody", {}, body));

  const picker = $("groups-month");
  picker.replaceChildren(...[...grid.months].reverse().map((m) => el("option", { attrs: { value: m }, text: monthName(m) })));
  const draw = () => renderTopGroups(stats, picker.value);
  picker.addEventListener("change", draw);
  draw();
  $("trends").hidden = false;
}

function changeMark(points) {
  if (points === 0) return el("span", { className: "change change--same", text: " ±0", attrs: { "aria-label": "unchanged" } });
  const up = points > 0;
  return el("span", { className: `change change--${up ? "up" : "down"}`, text: ` ${up ? "▲" : "▼"}${Math.abs(points).toFixed(1)}`,
    attrs: { "aria-label": `${up ? "up" : "down"} ${Math.abs(points).toFixed(1)} points` } });
}

const MOVES = {
  new: () => ["new", "new", "first seen this month"],
  entered: () => ["entered", "▲", "back in the top list"],
  up: (m) => ["up", `▲${m.by}`, `up ${m.by}`],
  down: (m) => ["down", `▼${m.by}`, `down ${m.by}`],
  same: () => ["same", "–", "same rank"],
};

/** Spec 015: an (i) with the gang's written brief (if any), facts for the picked month and its latest issue. */
function groupTip(name, rank, month, daysCovered) {
  const g = groupInfo.get(name);
  if (!g) return [];
  return infoTip(`group-tip-${rank}`, `About ${name}`, [
    el("strong", { className: "group-tip__name", text: name }),
    ...(g.brief ? [el("span", { className: "group-tip__brief", text: g.brief })] : []),
    el("span", { className: "group-tip__facts", text: factsLine(g, month, daysCovered) }),
    el("span", { className: "group-tip__source" }, [
      el("a", { text: `Latest issue: ${formatShortDay(g.latestIssue)} →`, attrs: { href: `?d=${encodeURIComponent(g.latestIssue)}` } }),
    ]),
  ], { className: "info-tip--group" });
}

function renderTopGroups(stats, month) {
  const daysCovered = stats.months.find((m) => m.month === month)?.days ?? 0;
  const items = topGroups(stats, month, 10).map((g) => {
    const mark = g.move ? MOVES[g.move.kind](g.move) : null;
    return el("li", { className: "top-groups__row" }, [
      el("span", { className: "top-groups__rank", text: String(g.rank) }),
      el("span", { className: "top-groups__name" }, [document.createTextNode(g.name), ...groupTip(g.name, g.rank, month, daysCovered)]),
      el("span", { className: "top-groups__hits", text: `${numberFmt.format(g.hits)} · ${g.share.toFixed(1)} %` }),
      mark ? el("span", { className: `move move--${mark[0]}`, text: mark[1], attrs: { title: mark[2], "aria-label": mark[2] } })
        : el("span", { className: "move" }),
    ]);
  });
  $("top-groups").replaceChildren(...items);
}

function showNotice(text) {
  $("notice").textContent = text;
  $("notice").hidden = false;
}

// ---------- Issue ----------

function renderIssue(issue) {
  document.title = `Breaches, Breach Wire №${issue.issue}: Threat Radar`;
  $("issue-line").textContent =
    `Breach Wire №${issue.issue} · ${formatLongDate(issue.date)} · covering ${formatShortDay(issue.window)} (UTC)`;

  $("bw-victims").textContent = numberFmt.format(issue.stats.victims);
  $("bw-groups").textContent = numberFmt.format(issue.stats.groups);
  $("bw-countries").textContent = numberFmt.format(issue.stats.countries);
  $("bw-regions").textContent = numberFmt.format(issue.stats.regions);

  const sweden = swedenStatus(issue.sweden);
  $("sweden").className = `sweden sweden--${sweden.level}`;
  $("sweden-text").textContent = sweden.text;

  renderRegions(issue.regions, issue.stats.victims);
  renderBars($("sectors"), issue.sectors.map((s) => ({ label: s.sector, count: s.count })), issue.stats.victims);
  renderLedger(issue.groups);
  renderQuality(issue);
  $("issue-body").hidden = false;
}

function barRow(label, count, max, flag) {
  const fill = el("span", { className: "vendor-bar__fill" });
  fill.style.width = `${max ? (count / max) * 100 : 0}%`;
  return el("li", { className: "bar-row" }, [
    el("span", { className: "bar-row__label" }, flag ? [el("span", { text: `${flag} `, attrs: { "aria-hidden": "true" } }), document.createTextNode(label)] : [document.createTextNode(label)]),
    el("span", { className: "vendor-bar__track" }, [fill]),
    el("span", { className: "vendor-bar__count", text: numberFmt.format(count) }),
  ]);
}

function renderBars(list, rows, max) {
  list.replaceChildren(...rows.map((r) => barRow(r.label, r.count, max, r.flag)));
  if (!rows.length) list.replaceChildren(el("li", { className: "muted", text: "None in this window." }));
}

function renderRegions(regions, victims) {
  const blocks = regionTotals(regions).map((r) => {
    const list = el("ol", { className: "bars" });
    renderBars(list, r.countries.map((c) => ({ label: c.country, count: c.count, flag: c.flag })), victims);
    return el("div", { className: "region" }, [
      el("h4", { className: "region__name" }, [document.createTextNode(r.region), el("span", { className: "muted", text: ` · ${r.total}` })]),
      list,
    ]);
  });
  $("regions").replaceChildren(...blocks);
  if (!blocks.length) $("regions").replaceChildren(el("p", { className: "muted", text: "No claimed victims in this window." }));
}

function renderLedger(groups) {
  const cards = groups.map((g) => el("li", { className: "ledger__card" }, [
    el("p", { className: "ledger__top" }, [
      el("span", { className: "ledger__name", text: g.name }),
      el("span", { className: "badge badge--ransom", text: `${g.hits} ${g.hits === 1 ? "posting" : "postings"}` }),
    ]),
    g.profile ? el("p", { className: "ledger__profile", text: g.profile }) : el("p", { className: "muted", text: "No profile yet." }),
    el("p", { className: "ledger__meta" }, [el("strong", { text: "Countries: " }), document.createTextNode(g.countries || "Not disclosed")]),
    el("p", { className: "ledger__meta" }, [el("strong", { text: "Sectors: " }), document.createTextNode(g.sectors || "Not disclosed")]),
  ]));
  $("ledger").replaceChildren(...cards);
  if (!cards.length) $("ledger").replaceChildren(el("li", { className: "muted", text: "No active groups in this window." }));
}

function renderQuality(issue) {
  const q = issue.quality;
  const facts = [
    ["Single-sourced", q.singleSourced, "seen on only one aggregator"],
    ["Claim only", q.claimOnly, "no evidence posted"],
    ["Sources disagree", q.sourcesDisagree, "on date or details"],
    ["New groups", q.newGroups, "first seen very recently"],
  ];
  $("quality").replaceChildren(...facts.map(([label, value, hint]) => el("div", { className: "quality__fact" }, [
    el("dt", { text: label }),
    el("dd", { text: value === null ? "not recorded" : numberFmt.format(value) }),
    el("span", { className: "muted", text: hint }),
  ])));
  const h = issue.health;
  $("reconciliation").textContent =
    `Reconciliation: ${issue.stats.victims} victims + ${h.masked} masked + ${h.reposts} reposts + ${h.nonVictims} non-victim postings = ${h.merged} merged records.`;
  $("health").replaceChildren(...h.sources.map((s) => el("li", { className: s.ok ? "health__ok" : "health__fail" }, [
    el("span", { text: s.ok ? "✓ " : "✗ ", attrs: { "aria-hidden": "true" } }),
    document.createTextNode(`${s.source}: ${s.ok ? "OK" : "FAILED"} · ${numberFmt.format(s.records)} records`),
  ])));
  $("low-coverage").hidden = !h.lowCoverage;
}

// ---------- Known ransomware use (KEV) ----------

function renderKev(kev) {
  if (!kev) {
    $("kev-ransom").replaceChildren(el("li", { className: "muted", text: "KEV data unavailable right now." }));
    return;
  }
  const today = localToday();
  const isMine = (e) => stack.has && inStack(e, stack.vendors);
  const { total, recent } = ransomwareKev(kev, today, null, 8);
  // Same helper, run on just the visitor's entries (spec 004 FR-12).
  const mine = stack.has ? ransomwareKev(kev.filter(isMine), today, null, 8) : { total: 0, recent: [] };

  const lede = `${numberFmt.format(total)} vulnerabilities in CISA's catalog are confirmed as used by ransomware.`;
  $("kev-ransom-lede").textContent = !stack.has ? `${lede} The most recently added:`
    : mine.total ? `${lede} ${numberFmt.format(mine.total)} of them affect your stack "${stack.name}".`
    : `${lede} None of them affect your stack "${stack.name}".`;

  const item = (e) => el("li", {}, [
    el("a", { className: isMine(e) ? "kev-ransom__item kev-ransom__item--mine" : "kev-ransom__item", attrs: { href: `../exploited/#${encodeURIComponent(e.cveID)}` } }, [
      el("span", { className: "kev-ransom__date", text: formatDate(e.dateAdded) }),
      el("span", { className: "kev-ransom__body" }, [
        el("span", { className: "kev-ransom__top" }, [
          el("span", { className: "entry__cve", text: e.cveID }),
          ...(isMine(e) ? [el("span", { className: "badge badge--mine", text: "Your stack" })] : []),
        ]),
        el("span", { className: "kev-ransom__name", text: e.vulnerabilityName }),
      ]),
    ]),
  ]);
  $("kev-ransom-mine").replaceChildren(...mine.recent.map(item));
  $("kev-mine").hidden = mine.recent.length === 0;
  $("kev-ransom").replaceChildren(...recent.map(item));
  if (!recent.length) $("kev-ransom").replaceChildren(el("li", { className: "muted", text: "None listed." }));
}

// ---------- Archive ----------

function renderArchive(issues, selected) {
  const bars = chartBars(issues, 30);
  const width = 260, height = 90, gap = 3;
  // Bars are capped at 16 px and right-aligned, so the newest day is always on the right
  // and the chart fills in from the right as the archive grows.
  const barWidth = bars.length ? Math.min(16, Math.max(3, (width - gap * (bars.length - 1)) / bars.length)) : 0;
  const offset = width - bars.length * (barWidth + gap) + gap;
  const chart = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", role: "img",
    "aria-label": bars.length ? `Claimed victims per day: ${bars.map((b) => `${b.date} ${b.victims}`).join(", ")}` : "No issues yet" });
  bars.forEach((b, i) => {
    const h = b.victims ? Math.max(2, b.ratio * (height - 4)) : 0;
    const rect = svgEl("rect", { class: b.date === selected ? "bar bar--current" : "bar",
      x: (offset + i * (barWidth + gap)).toFixed(1), y: (height - h).toFixed(1), width: barWidth.toFixed(1), height: h.toFixed(1), rx: 2 });
    rect.append(svgEl("title", {}, `${formatShortDay(b.date)}: ${b.victims} claimed victims`));
    chart.append(rect);
  });
  $("archive-chart").replaceChildren(chart);

  const rows = issues.map((issue) => {
    const link = el("a", { className: "archive__item", attrs: { href: `?d=${encodeURIComponent(issue.date)}` } }, [
      el("span", { className: "archive__date", text: `${formatShortDay(issue.date)} · №${issue.issue}` }),
      el("span", { className: "archive__meta", text: `${issue.victims} victims · ${issue.groups} groups · ${issue.countries} countries` }),
      el("span", { className: issue.sweden ? "archive__meta archive__meta--alert" : "archive__meta", text: issue.sweden ? `Sweden: ${issue.sweden}` : "Sweden: none" }),
    ]);
    if (issue.date === selected) link.setAttribute("aria-current", "page");
    return el("li", {}, [link]);
  });
  $("archive").replaceChildren(...rows);
  if (!rows.length) $("archive").replaceChildren(el("li", { className: "muted", text: "No issues yet." }));
  const note = archiveNote(issues);
  $("archive-note").textContent = note ?? "";
  $("archive-note").hidden = !note;
}

init();

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

import { el, svgEl, numberFmt, formatDate, formatLongDate, formatShortDay, localToday, loadJSON } from "../ui.js";
import { pickIssueDate } from "../sitrep-logic.js";
import { swedenStatus, regionTotals, ransomwareKev, chartBars } from "../breachwire-logic.js";
import { inStack } from "../stack-logic.js";
import { readStack, renderStackLine } from "../stack-page.js";

const $ = (id) => document.getElementById(id);
const stack = readStack();

async function init() {
  renderStackLine($("stack-line"), stack, "../#mystack");
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

function showNotice(text) {
  $("notice").textContent = text;
  $("notice").hidden = false;
}

// ---------- Issue ----------

function renderIssue(issue) {
  document.title = `Breach Wire №${issue.issue}: Threat Radar`;
  $("issue-line").textContent =
    `Issue №${issue.issue} · ${formatLongDate(issue.date)} · covering ${formatShortDay(issue.window)} (UTC)`;

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
    el("dd", { text: numberFmt.format(value) }),
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
    el("a", { className: isMine(e) ? "kev-ransom__item kev-ransom__item--mine" : "kev-ransom__item", attrs: { href: `../#${encodeURIComponent(e.cveID)}` } }, [
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
}

init();

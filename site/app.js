// app.js: the Radar page.
//
// Flow:  load data → draw stats, radar, charts → wire up search & filters → draw the list
//
// SECURITY RULE (spec 001 NFR-2, AC-6): text that comes from a feed is only ever
// placed on the page with textContent, via el() from ui.js. The browser treats
// that as plain characters, never as HTML, so a description containing "<script>"
// just shows the literal text. tests/site.test.mjs enforces this.

import { summarize, monthlyCounts, topVendors, vendorList, filterEntries, shiftDays } from "./stats.js";
import { teaserLabel, CVE_ID_RE } from "./sitrep-logic.js";
import {
  el, svgEl, safeWebUrl, localToday, daysBetween, isoToDate, numberFmt, formatDate, formatShortDay,
  monthFmt, monthYearFmt, timeAgo, debounce, loadJSON,
} from "./ui.js";

const PAGE_SIZE = 25;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

const state = {
  all: [],          // every entry, newest first
  filtered: [],     // entries matching the current search & filters
  shown: PAGE_SIZE, // how many of `filtered` are on screen
  today: localToday(),
  query: "",
  vendor: "",
  windowDays: 0,
  ransomwareOnly: false,
};

async function init() {
  try {
    const [kev, meta, status, sitrep] = await Promise.all([
      loadJSON("data/kev.json"),
      loadJSON("data/meta.json"),
      loadJSON("data/status.json", { optional: true }), // missing when previewing locally
      loadJSON("data/sitrep/index.json", { optional: true }), // missing until the first Sitrep is published
    ]);
    state.all = kev;
    renderFreshness(meta, status);
    renderStats();
    renderRadar();
    renderMonthly();
    renderVendors();
    populateVendorSelect();
    wireControls();
    applyFilters();
    setRepoLink();
    renderSitrepTeaser(sitrep);
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
  } catch (err) {
    console.error(err);
    $("freshness").textContent = "Couldn't load the catalog data. Please try refreshing the page.";
    $("result-count").textContent = "";
  }
}

// ---------- Header ----------

function renderFreshness(meta, status) {
  const parts = [
    document.createTextNode("Catalog "),
    el("strong", { text: meta.catalogVersion }),
    document.createTextNode(meta.dateReleased ? `, released ${timeAgo(meta.dateReleased)}` : ""),
  ];
  if (status && status.checkedAt) {
    parts.push(document.createTextNode(" · last checked "), el("strong", { text: timeAgo(status.checkedAt) }));
  }
  $("freshness").replaceChildren(...parts);
}

function renderStats() {
  const s = summarize(state.all, state.today);
  $("stat-total").textContent = numberFmt.format(s.total);
  $("stat-7").textContent = numberFmt.format(s.last7);
  $("stat-30").textContent = numberFmt.format(s.last30);
  $("stat-ransom").textContent = numberFmt.format(s.ransomware);
}

/** A stable pseudo-random angle per CVE, so each blip always sits in the same spot. */
function angleFor(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return ((hash >>> 0) % 3600) / 10;
}

function renderRadar() {
  const recent = filterEntries(state.all, { windowDays: 30, today: state.today });
  const blips = recent.map((entry) => {
    const age = Math.max(0, daysBetween(entry.dateAdded, state.today)); // 0 = today
    const radius = 12 + (Math.min(age, 29) / 29) * 80; // newer = closer to the centre
    const angle = angleFor(entry.cveID);
    const rad = (angle * Math.PI) / 180;
    const kind = entry.knownRansomwareCampaignUse === "Known" ? " blip--ransom" : age < 7 ? " blip--hot" : "";
    const dot = svgEl("circle", {
      class: `blip${kind}`,
      cx: (100 + radius * Math.sin(rad)).toFixed(1),
      cy: (100 - radius * Math.cos(rad)).toFixed(1),
      r: age < 7 ? 4.5 : 3.5,
    });
    // Light up exactly when the sweeping beam passes over this blip (4 s per turn).
    dot.style.animationDelay = `${((angle / 360) * 4).toFixed(2)}s`;
    dot.append(svgEl("title", {}, `${entry.cveID}: ${entry.vulnerabilityName}`));
    return dot;
  });
  $("radar-blips").replaceChildren(...blips);
  $("radar-label").textContent =
    `Radar of the ${recent.length} vulnerabilities added in the last 30 days. Newer ones sit closer to the centre.`;
}

// ---------- Charts ----------

function renderMonthly() {
  const host = $("chart-monthly");
  const width = Math.max(260, Math.round(host.clientWidth || 520));
  const height = Math.round(Math.min(280, Math.max(190, width * 0.42))); // taller on wide screens
  const months = monthlyCounts(state.all, state.today, 12);
  const max = Math.max(1, ...months.map((m) => m.count));
  const top = 20, bottom = height - 24;
  const slot = width / months.length;
  const barWidth = Math.max(8, slot * 0.62);
  const showEveryLabel = slot >= 30;

  const chart = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`, width, height, role: "img",
    "aria-label": "Vulnerabilities added per month: " +
      months.map((m) => `${monthYearFmt.format(isoToDate(m.month))} ${m.count}`).join(", "),
  });
  chart.append(svgEl("line", { class: "baseline", x1: 0, x2: width, y1: bottom + 0.5, y2: bottom + 0.5 }));

  months.forEach((m, i) => {
    const h = Math.round((m.count / max) * (bottom - top));
    const x = i * slot + (slot - barWidth) / 2;
    const isCurrent = i === months.length - 1;
    const bar = svgEl("rect", {
      class: isCurrent ? "bar bar--current" : "bar",
      x: x.toFixed(1), y: bottom - h, width: barWidth.toFixed(1), height: Math.max(h, m.count ? 2 : 0), rx: 3,
    });
    bar.append(svgEl("title", {}, `${monthYearFmt.format(isoToDate(m.month))}: ${m.count} added${isCurrent ? " (so far)" : ""}`));
    chart.append(bar);
    if (m.count) {
      chart.append(svgEl("text", { class: "bar-value", x: (x + barWidth / 2).toFixed(1), y: bottom - h - 6, "text-anchor": "middle" }, m.count));
    }
    if (showEveryLabel || i % 2 === 1) {
      chart.append(svgEl("text", { class: "bar-label", x: (x + barWidth / 2).toFixed(1), y: height - 6, "text-anchor": "middle" },
        monthFmt.format(isoToDate(m.month))));
    }
  });
  host.replaceChildren(chart);
}

function renderVendors() {
  const vendors = topVendors(state.all, 10);
  const max = vendors.length ? vendors[0].count : 1;
  const rows = vendors.map(({ vendor, count }) => {
    const fill = el("span", { className: "vendor-bar__fill" });
    fill.style.width = `${(count / max) * 100}%`;
    const button = el("button", {
      className: "vendor-bar",
      attrs: { type: "button", "aria-pressed": "false", "data-vendor": vendor, "aria-label": `${vendor}: ${count} entries. Filter the list by ${vendor}` },
    }, [
      el("span", { className: "vendor-bar__name", text: vendor }),
      el("span", { className: "vendor-bar__track" }, [fill]),
      el("span", { className: "vendor-bar__count", text: numberFmt.format(count) }),
    ]);
    button.addEventListener("click", () => {
      setVendor(state.vendor === vendor ? "" : vendor);
      $("latest").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    });
    return el("li", {}, [button]);
  });
  $("chart-vendors").replaceChildren(...rows);
}

// ---------- Search & filters ----------

function populateVendorSelect() {
  const options = vendorList(state.all).map(({ vendor, count }) =>
    el("option", { text: `${vendor} (${numberFmt.format(count)})`, attrs: { value: vendor } }));
  $("vendor").append(...options);
}

function setVendor(vendor) {
  state.vendor = vendor;
  $("vendor").value = vendor;
  applyFilters();
}

function wireControls() {
  $("controls").addEventListener("submit", (event) => event.preventDefault());
  $("q").addEventListener("input", debounce((event) => { state.query = event.target.value; applyFilters(); }, 120));
  $("vendor").addEventListener("change", (event) => setVendor(event.target.value));
  for (const radio of document.querySelectorAll('input[name="window"]')) {
    radio.addEventListener("change", () => { state.windowDays = Number(radio.value); applyFilters(); });
  }
  $("ransom").addEventListener("change", (event) => { state.ransomwareOnly = event.target.checked; applyFilters(); });
  $("more").addEventListener("click", () => { state.shown += PAGE_SIZE; renderList(); });
  $("clear").addEventListener("click", clearFilters);

  $("detail").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close(); // click on the dimmed backdrop
  });

  let pending = false;
  new ResizeObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; renderMonthly(); });
  }).observe($("chart-monthly"));
}

function clearFilters() {
  Object.assign(state, { query: "", vendor: "", windowDays: 0, ransomwareOnly: false });
  $("q").value = "";
  $("vendor").value = "";
  $("ransom").checked = false;
  document.querySelector('input[name="window"][value="0"]').checked = true;
  applyFilters();
  $("q").focus();
}

function applyFilters() {
  state.filtered = filterEntries(state.all, state);
  state.shown = PAGE_SIZE;
  for (const button of document.querySelectorAll(".vendor-bar")) {
    button.setAttribute("aria-pressed", String(button.dataset.vendor === state.vendor));
  }
  renderList();
}

// ---------- The list ----------

function badgesFor(entry) {
  const badges = [];
  if (entry.dateAdded >= shiftDays(state.today, -6)) badges.push(el("span", { className: "badge badge--new", text: "New" }));
  if (entry.knownRansomwareCampaignUse === "Known") badges.push(el("span", { className: "badge badge--ransom", text: "Ransomware" }));
  return badges;
}

function entryRow(entry) {
  const button = el("button", { className: "entry", attrs: { type: "button" } }, [
    el("span", { className: "entry__date", text: formatDate(entry.dateAdded) }),
    el("span", { className: "entry__body" }, [
      el("span", { className: "entry__top" }, [el("span", { className: "entry__cve", text: entry.cveID }), ...badgesFor(entry)]),
      el("span", { className: "entry__name", text: entry.vulnerabilityName }),
      el("span", { className: "entry__vendor", text: `${entry.vendorProject} · ${entry.product}` }),
    ]),
  ]);
  button.addEventListener("click", () => openDetail(entry));
  return el("li", {}, [button]);
}

function renderList() {
  const total = state.filtered.length;
  const visible = state.filtered.slice(0, state.shown);
  $("entries").replaceChildren(...visible.map(entryRow));

  const filtering = state.query || state.vendor || state.windowDays || state.ransomwareOnly;
  $("result-count").textContent = total === 0 ? "" : filtering
    ? `${numberFmt.format(total)} ${total === 1 ? "match" : "matches"} · showing ${numberFmt.format(visible.length)}`
    : `Showing ${numberFmt.format(visible.length)} of ${numberFmt.format(total)}, newest first`;

  $("empty").hidden = total !== 0;
  const remaining = total - visible.length;
  $("more").hidden = remaining <= 0;
  $("more").textContent = `Show ${Math.min(PAGE_SIZE, remaining)} more (${numberFmt.format(remaining)} left)`;
}

// ---------- Detail view ----------

function openDetail(entry) {
  $("detail-cve").textContent = entry.cveID;
  $("detail-title").textContent = entry.vulnerabilityName;
  const badges = badgesFor(entry);
  if (entry.forensicTriage === "Yes") badges.push(el("span", { className: "badge badge--triage", text: "Forensic triage required" }));
  $("detail-badges").replaceChildren(...badges);
  $("detail-desc").textContent = entry.shortDescription;
  $("detail-vendor").textContent = entry.vendorProject;
  $("detail-product").textContent = entry.product;
  $("detail-added").textContent = formatDate(entry.dateAdded);
  $("detail-due").textContent = formatDate(entry.dueDate);
  $("detail-cwes").textContent = Array.isArray(entry.cwes) && entry.cwes.length ? entry.cwes.join(", ") : "Not specified";
  $("detail-ransom").textContent = entry.knownRansomwareCampaignUse === "Known" ? "Known to be used" : "Not known";
  $("detail-action").textContent = entry.requiredAction;

  const notes = String(entry.notes || "").split(/\s*;\s*/).filter(Boolean);
  const items = notes.map((note) => {
    const href = safeWebUrl(note);
    return el("li", {}, [href
      ? el("a", { text: note, attrs: { href, target: "_blank", rel: "noopener noreferrer" } })
      : document.createTextNode(note)]);
  });
  $("detail-notes").replaceChildren(...items);
  $("detail-notes-head").hidden = items.length === 0;

  $("detail-nvd").href = `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(entry.cveID)}`;
  $("detail").showModal();
}

// ---------- Sitrep teaser & deep links (spec 002) ----------

/** Show the latest Cyber Sitrep above the stats. Stays hidden if there's none (AC-4). */
function renderSitrepTeaser(sitrepIndex) {
  const latest = sitrepIndex && Array.isArray(sitrepIndex.issues) ? sitrepIndex.issues[0] : null;
  if (!latest) return;
  const badges = [];
  if (latest.actionNeeded) badges.push(el("span", { className: "badge badge--ransom", text: "Action needed" }));
  $("teaser-label").textContent = `${teaserLabel(latest.date, state.today)} · ${formatShortDay(latest.date)}`;
  $("teaser-badges").replaceChildren(...badges);
  $("teaser-tldr").textContent = latest.tldr;
  $("teaser-meta").textContent = `${latest.items} items · ${latest.emerging} emerging threats`;
  $("teaser-link").href = `sitrep/?d=${encodeURIComponent(latest.date)}`;
  $("sitrep-teaser").hidden = false;
}

/** /#CVE-2026-12345 opens that entry's detail, e.g. from an "In KEV" badge on the Sitrep page (AC-5). */
function openFromHash() {
  const id = decodeURIComponent(window.location.hash.slice(1)).toUpperCase();
  if (!CVE_ID_RE.test(id)) return;
  const entry = state.all.find((e) => e.cveID === id);
  if (entry && !$("detail").open) openDetail(entry);
}

// ---------- Footer ----------

/** On GitHub Pages the address is <user>.github.io/<repo>/, so we can link back to the repo. */
function setRepoLink() {
  const host = window.location.hostname;
  const repo = window.location.pathname.split("/").filter(Boolean)[0];
  if (!host.endsWith(".github.io") || !repo) return;
  const link = $("repo-link");
  link.href = `https://github.com/${host.split(".")[0]}/${repo}`;
  link.rel = "noopener noreferrer";
  link.hidden = false;
}

init();

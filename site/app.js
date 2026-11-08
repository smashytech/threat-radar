// app.js: the Radar page.
//
// Flow:  load data → read the visitor's stack → draw stats, radar, charts
//        → wire up search, filters and My stack → draw the list
//
// SECURITY RULE (spec 001 NFR-2, AC-6): text that comes from a feed is only ever
// placed on the page with textContent, via el() from ui.js. The browser treats
// that as plain characters, never as HTML, so a description containing "<script>"
// just shows the literal text. tests/site.test.mjs enforces this.

import { summarize, monthlyCounts, topVendors, vendorList, filterEntries, shiftDays } from "./stats.js";
import { teaserLabel, CVE_ID_RE } from "./sitrep-logic.js";
import { teaserSummary } from "./breachwire-logic.js";
import { vendorIndex, inStack, stackSummary, catalogMark, describeStack, encodeShare, decodeShare } from "./stack-logic.js";
import { activePreset, emptyRecord, setMyStackOnly, addShared, touchLastSeen, STORAGE_KEY } from "./presets.js";
import { createStore } from "./stack-store.js";
import { createPicker } from "./stack-picker.js";
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

// ---------- My stack (spec 004) ----------
//
// app.js owns the visitor's presets record. The picker and the share banner ask
// for changes through commit(), which saves (stack-store.js) and redraws.

const store = createStore();
const stack = {
  record: emptyRecord(),
  remembered: false,  // true = kept in localStorage (the Remember tickbox)
  previousMark: null, // where the catalog stood at the previous visit (only when remembered)
};
let picker = null;
let pendingShare = null; // a stack from a #stack= link, waiting for "Add as preset"

const preset = () => activePreset(stack.record);
const myVendors = () => preset().vendors;
const hasStack = () => Object.keys(myVendors()).length > 0;
const stackOnly = () => hasStack() && preset().myStackOnly;
const isMine = (entry) => inStack(entry, myVendors());

async function init() {
  try {
    const [kev, meta, status, sitrep, breachwire] = await Promise.all([
      loadJSON("data/kev.json"),
      loadJSON("data/meta.json"),
      loadJSON("data/status.json", { optional: true }), // missing when previewing locally
      loadJSON("data/sitrep/index.json", { optional: true }), // missing until the first Sitrep is published
      loadJSON("data/breachwire/index.json", { optional: true }), // missing until the first Breach Wire issue
    ]);
    state.all = kev;
    initStack();
    renderFreshness(meta, status);
    renderStats();
    renderRadar();
    renderMonthly();
    renderVendors();
    populateVendorSelect();
    wireControls();
    wireStack();
    renderStack(); // also draws the list
    renderSitrepTeaser(sitrep);
    renderBreachWireTeaser(breachwire);
    handleHash();
    window.addEventListener("hashchange", handleHash);
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

const blipEntries = new Map(); // radar dot → its KEV entry
let radarLabel = "";

/** Drawn once: rebuilding the dots would knock their ping out of step with the sweeping beam. */
function renderRadar() {
  const recent = filterEntries(state.all, { windowDays: 30, today: state.today });
  blipEntries.clear();
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
    blipEntries.set(dot, entry);
    return dot;
  });
  $("radar-blips").replaceChildren(...blips);
  radarLabel = `Radar of the ${recent.length} vulnerabilities added in the last 30 days. Newer ones sit closer to the centre.`;
  markRadar();
}

/** Ring the blips in the visitor's stack; with "My stack only", fade the rest. */
function markRadar() {
  const mine = hasStack();
  const rings = [];
  for (const [dot, entry] of blipEntries) {
    const own = mine && isMine(entry);
    dot.classList.toggle("blip--mine", own);
    if (own) {
      rings.push(svgEl("circle", {
        class: "blip-ring", cx: dot.getAttribute("cx"), cy: dot.getAttribute("cy"), r: Number(dot.getAttribute("r")) + 3,
      }));
    }
  }
  $("radar-rings").replaceChildren(...rings);
  $("radar").classList.toggle("radar--mine-only", stackOnly());
  $("radar-label").textContent = radarLabel + (mine ? ` ${rings.length} of them are in your stack and have a ring.` : "");
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
  if (preset().myStackOnly) commit(setMyStackOnly(stack.record, false).record); // also redraws the list
  else applyFilters();
  $("q").focus();
}

function applyFilters() {
  const filtered = filterEntries(state.all, state);
  state.filtered = stackOnly() ? filtered.filter(isMine) : filtered;
  state.shown = PAGE_SIZE;
  for (const button of document.querySelectorAll(".vendor-bar")) {
    button.setAttribute("aria-pressed", String(button.dataset.vendor === state.vendor));
  }
  renderList();
}

// ---------- The list ----------

function badgesFor(entry) {
  const badges = [];
  if (isMine(entry)) badges.push(el("span", { className: "badge badge--mine", text: "Your stack" }));
  if (entry.dateAdded >= shiftDays(state.today, -6)) badges.push(el("span", { className: "badge badge--new", text: "New" }));
  if (entry.knownRansomwareCampaignUse === "Known") badges.push(el("span", { className: "badge badge--ransom", text: "Ransomware" }));
  return badges;
}

function entryRow(entry) {
  const button = el("button", { className: isMine(entry) ? "entry entry--mine" : "entry", attrs: { type: "button" } }, [
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

  const filtering = state.query || state.vendor || state.windowDays || state.ransomwareOnly || stackOnly();
  $("result-count").textContent = total === 0 ? "" : filtering
    ? `${numberFmt.format(total)} ${total === 1 ? "match" : "matches"} · showing ${numberFmt.format(visible.length)}`
    : `Showing ${numberFmt.format(visible.length)} of ${numberFmt.format(total)}, newest first`;

  $("empty").hidden = total !== 0;
  $("empty-text").textContent = stackOnly() && !state.all.some(isMine)
    ? "Good news: nothing in your stack is in the catalog right now."
    : "No exploited vulnerabilities match those filters.";
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

// ---------- My stack: state, saving and the summary strip ----------

/** Load the presets. If remembered, work out "new since last visit". */
function initStack() {
  const loaded = store.load();
  stack.record = loaded.record;
  stack.remembered = loaded.remembered;
  if (!stack.remembered) return;
  // A visit lasts as long as the tab, so Radar → Sitrep → Radar keeps the same starting point.
  const touched = touchLastSeen(stack.record, catalogMark(state.all));
  let previous = store.visitStart();
  if (previous === undefined) {
    previous = touched.previous;
    store.startVisit(previous);
  }
  stack.previousMark = previous;
  stack.record = touched.record;
  stack.remembered = store.save(stack.record, true).remembered;
}

/** The one way the stack changes: keep the new record, save it, redraw. */
function commit(record) {
  stack.record = record;
  const saved = store.save(record, stack.remembered);
  if (stack.remembered && !saved.remembered) stack.remembered = false; // e.g. the browser's storage filled up
  renderStack();
}

/** The Remember tickbox: on = localStorage; off = sessionStorage, and the stored copy is deleted. */
function setRemember(on) {
  if (on) {
    const touched = touchLastSeen(stack.record, catalogMark(state.all));
    const saved = store.save(touched.record, true);
    stack.remembered = saved.remembered;
    stack.record = saved.remembered ? touched.record : touchLastSeen(touched.record, null).record;
    stack.previousMark = null; // "new since last visit" starts counting from the next visit
    if (saved.remembered) store.startVisit(null);
    renderStack();
    return saved;
  }
  stack.record = touchLastSeen(stack.record, null).record; // no visit tracking unless remembered
  stack.remembered = false;
  stack.previousMark = null;
  const saved = store.save(stack.record, false);
  renderStack();
  return saved;
}

/** "Forget everything on this device." */
function forgetAll() {
  store.forget();
  stack.record = emptyRecord();
  stack.remembered = false;
  stack.previousMark = null;
  renderStack();
}

function wireStack() {
  picker = createPicker({
    index: vendorIndex(state.all),
    available: store.available,
    getState: () => ({ record: stack.record, remembered: stack.remembered }),
    commit,
    setRemember,
    forget: forgetAll,
    countEntries: (vendors) => state.all.filter((e) => inStack(e, vendors)).length,
    // The stack goes after "#": browsers never send that part to the server.
    shareUrl: (vendors) => `${window.location.origin}${window.location.pathname}#${encodeShare(vendors)}`,
  });
  for (const id of ["stack-open", "prompt-open", "strip-edit"]) $(id).addEventListener("click", () => picker.open());
  $("stack-only").addEventListener("change", (event) => commit(setMyStackOnly(stack.record, event.target.checked).record));
  $("share-add").addEventListener("click", acceptShare);
  $("share-ignore").addEventListener("click", closeShareOffer);
  window.addEventListener("storage", followOtherTab);
}

/**
 * Another tab changed the remembered presets. Browsers announce that with a
 * "storage" event (only to OTHER tabs). A remembered tab follows along, so its
 * older copy can't overwrite newer changes the next time it saves.
 */
function followOtherTab(event) {
  if (!stack.remembered || (event.key !== STORAGE_KEY && event.key !== null)) return; // null = storage was cleared
  const loaded = store.load();
  if (loaded.remembered) {
    stack.record = loaded.record;
  } else {
    // The other tab unticked Remember or forgot everything: stop remembering here too.
    // What this tab shows now lasts only until it is closed.
    stack.remembered = false;
    stack.previousMark = null;
    stack.record = touchLastSeen(stack.record, null).record;
    store.save(stack.record, false);
  }
  renderStack();
  picker.refresh();
}

/** Button, toggle, summary strip, list and radar rings, all from the active preset. */
function renderStack() {
  const p = preset();
  const n = Object.keys(p.vendors).length;
  $("stack-count").textContent = numberFmt.format(n);
  $("stack-open").setAttribute("aria-label",
    n ? `My stack: "${p.name}", ${n} ${n === 1 ? "vendor" : "vendors"} ticked` : "My stack: nothing ticked yet");
  $("stack-only-wrap").hidden = n === 0;
  $("stack-only").checked = stackOnly();
  $("stack-prompt").hidden = n > 0;
  $("stack-strip").hidden = n === 0;

  if (n) {
    const s = stackSummary(state.all, p.vendors, state.today, stack.remembered ? stack.previousMark : null);
    $("strip-preset").textContent = p.name;
    $("strip-desc").textContent = describeStack(p.vendors);
    $("strip-total").textContent = numberFmt.format(s.inCatalog);
    $("strip-30").textContent = numberFmt.format(s.last30);
    $("strip-ransom").textContent = numberFmt.format(s.ransomware);
    // "New since your last visit" only exists when remembered (spec 004 FR-10).
    $("strip-new-wrap").hidden = !stack.remembered;
    $("strip-new").textContent = s.newSinceLastVisit === null ? "–" : numberFmt.format(s.newSinceLastVisit);
    $("strip-new").classList.toggle("is-hot", s.newSinceLastVisit > 0);
    $("strip-new-label").textContent = s.newSinceLastVisit === null
      ? "New since your last visit (counting from now)"
      : "New since your last visit";
  }
  applyFilters();
  markRadar();
}

// ---------- My stack: share links ----------

const stackKey = (vendors) => JSON.stringify(Object.keys(vendors).sort().map((k) => [k, vendors[k]]));

/** A #stack=… link: show an offer. Nothing is stored until "Add as preset" (AC-11). */
function offerShare(hash) {
  pendingShare = decodeShare(hash);
  const ok = Boolean(pendingShare);
  $("share-title").textContent = ok ? "A stack was shared with you" : "This shared link couldn't be read";
  if (ok) {
    const count = state.all.filter((e) => inStack(e, pendingShare)).length;
    $("share-desc").textContent = `${describeStack(pendingShare)} · ${numberFmt.format(count)} ${count === 1 ? "entry" : "entries"} in the catalog`;
    const same = stack.record.presets.find((p) => stackKey(p.vendors) === stackKey(pendingShare));
    $("share-note").textContent = same
      ? `It's the same as your preset "${same.name}". Adding it makes a copy.`
      : "Adding it creates a new preset. Your existing presets stay exactly as they are.";
  } else {
    $("share-desc").textContent = "It may have been cut off or changed along the way. Nothing was added.";
  }
  $("share-note").hidden = !ok;
  $("share-add").hidden = !ok;
  $("share-ignore").textContent = ok ? "Ignore" : "OK";
  $("share-offer").hidden = false;
  $("share-title").focus();
}

function acceptShare() {
  const result = addShared(stack.record, pendingShare);
  if (result.error) { // e.g. already 20 presets
    $("share-note").textContent = result.error;
    return;
  }
  closeShareOffer();
  commit(result.record);
  picker.open(`Added "${result.record.active}" from the link.${stack.remembered ? "" : " Tick Remember below to keep it for next time."}`);
}

function closeShareOffer() {
  pendingShare = null;
  $("share-offer").hidden = true;
  clearHash();
}

/** Remove the #… part from the address bar without reloading or adding a history entry. */
function clearHash() {
  history.replaceState(null, "", window.location.pathname + window.location.search);
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
  $("teaser-link").hidden = false;
  $("teasers").hidden = false;
}

/** Breach Wire teaser: stats only, never victim names (spec 003). */
function renderBreachWireTeaser(bwIndex) {
  const latest = bwIndex && Array.isArray(bwIndex.issues) ? bwIndex.issues[0] : null;
  if (!latest) return;
  $("bw-label").textContent = `Breach Wire №${latest.issue} · ${formatShortDay(latest.date)}`;
  $("bw-badges").replaceChildren(latest.sweden
    ? el("span", { className: "badge badge--ransom", text: `Sweden: ${latest.sweden}` })
    : el("span", { className: "badge badge--clear", text: "Sweden: none" }));
  $("bw-summary").textContent = teaserSummary(latest);
  $("bw-meta").textContent = `Leak-site claims from ${formatShortDay(latest.window)} (UTC)`;
  $("bw-teaser").href = `ransomware/?d=${encodeURIComponent(latest.date)}`;
  $("bw-teaser").hidden = false;
  $("teasers").hidden = false;
}

/**
 * The part after # decides what happens:
 *   #mystack          opens the picker (the "Edit" links on the other pages)
 *   #stack=…          offers a shared stack
 *   #CVE-2026-12345   opens that entry, e.g. from an "In KEV" chip on the Sitrep (spec 002 AC-5)
 */
function handleHash() {
  const hash = window.location.hash;
  if (hash === "#mystack") {
    clearHash();
    picker.open();
    return;
  }
  if (hash.startsWith("#stack=")) {
    offerShare(hash);
    return;
  }
  let id;
  try {
    id = decodeURIComponent(hash.slice(1)).toUpperCase();
  } catch {
    return; // a malformed "%" sequence: ignore it instead of crashing
  }
  if (!CVE_ID_RE.test(id)) return;
  const entry = state.all.find((e) => e.cveID === id);
  if (entry && !$("detail").open) openDetail(entry);
}

init();

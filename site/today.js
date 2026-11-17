// today.js: the Today page, a morning briefing (spec 007).
//
// Reads the same published data as the other pages and shows a summary:
// a headline from the latest Cyber Sitrep, four key numbers, three columns
// (newly exploited, Sitrep highlights, Breach Wire) and the monthly trend.
// All the deciding is in today-logic.js (tested); this file only draws.

import { el, numberFmt, formatDate, formatLongDate, formatShortDay, monthFmt, monthYearFmt, isoToDate, localToday, timeAgo, loadJSON } from "./ui.js";
import { monthlyCounts } from "./stats.js";
import { teaserLabel } from "./sitrep-logic.js";
import {
  firstSentence, weekLine, weekEntries, newest, dueStatus, todayNumbers, wireBars, busiestMonth, stackWeekCount,
} from "./today-logic.js";
import { readStack } from "./stack-page.js";

const $ = (id) => document.getElementById(id);

// Old links (bookmarks, feeds, Slack) pointed at the Radar on the front page:
// zelin.se/#CVE-…, #mystack, #stack=…  The Radar now lives at /exploited/.
// replace() keeps the Back button working (no extra history entry).
const OLD_RADAR_HASH = /^#(CVE-\d{4}-\d+|mystack|stack=.*)$/i;
if (OLD_RADAR_HASH.test(window.location.hash)) {
  window.location.replace(`exploited/${window.location.hash}`);
} else {
  init();
}

async function init() {
  const today = localToday();
  $("today-date").textContent = `${formatLongDate(today)} · Briefing`;
  try {
    const [kev, meta, sitrepIndex, bwIndex] = await Promise.all([
      loadJSON("data/kev.json"),
      loadJSON("data/meta.json", { optional: true }),
      loadJSON("data/sitrep/index.json", { optional: true }),
      loadJSON("data/breachwire/index.json", { optional: true }),
    ]);
    const sitrep = sitrepIndex?.issues?.[0] || null;
    // Breach Wire: only the allow-listed index fields are ever read (spec 003 rule: no victim names).
    const bw = bwIndex?.issues?.[0] || null;

    renderHero(kev, sitrep, meta, today);
    renderGlance(kev, bw, today);
    renderKev(kev, today);
    renderWire(bw);
    renderTrend(kev, today);
    await renderSitrep(sitrep, today);
  } catch (err) {
    $("today-headline").textContent = "The briefing couldn't load. Please try again in a moment.";
    console.error(err);
  }
}

function renderHero(kev, sitrep, meta, today) {
  const headline = firstSentence(sitrep?.tldr);
  $("today-headline").textContent = headline || "This week in exploited vulnerabilities";
  $("today-week").textContent = weekLine(kev, today);

  const link = $("today-sitrep-link");
  if (sitrep) {
    link.href = `sitrep/?d=${encodeURIComponent(sitrep.date)}`;
    link.textContent = sitrep.date === today ? "Read today's Sitrep" : `Read the latest Sitrep (${formatShortDay(sitrep.date)})`;
  } else {
    link.hidden = true;
  }

  const stack = readStack();
  if (stack.has) {
    const mine = stackWeekCount(kev, stack.vendors, today);
    const total = weekEntries(kev, today).length;
    $("today-stack").replaceChildren(
      "Your stack (", el("strong", { text: stack.name }), `): ${mine} of this week's ${total} new ${total === 1 ? "entry" : "entries"}. `,
      el("a", { text: "See them", attrs: { href: "exploited/" } }));
    $("today-stack").hidden = false;
  }

  if (meta?.catalogVersion) {
    $("today-fresh").replaceChildren("CISA catalog ", el("strong", { text: meta.catalogVersion }),
      meta.dateReleased ? `, released ${timeAgo(meta.dateReleased)}` : "");
  }
}

function renderGlance(kev, bw, today) {
  const n = todayNumbers(kev, bw, today);
  $("glance-week").textContent = numberFmt.format(n.week);
  $("glance-month").textContent = numberFmt.format(n.month);
  $("glance-claims").textContent = n.claims === null ? "–" : numberFmt.format(n.claims);
  if (bw?.window) $("glance-claims-label").textContent = `ransomware claims on ${formatShortDay(bw.window)}`;
  const sweden = $("glance-sweden");
  sweden.textContent = n.sweden === null ? "–" : numberFmt.format(n.sweden);
  sweden.classList.toggle("glance__n--alert", n.sweden > 0);
  sweden.classList.toggle("glance__n--ok", n.sweden === 0);
}

function renderKev(kev, today) {
  const items = newest(kev, 4).map((e) => {
    const due = dueStatus(e, today);
    return el("li", {}, [
      el("a", { className: "today-item", attrs: { href: `exploited/#${encodeURIComponent(e.cveID)}` } }, [
        el("span", { className: "today-item__top" }, [
          el("span", { className: "today-item__code", text: e.cveID }),
          el("span", {
            className: due.overdue ? "today-item__due today-item__due--overdue" : "today-item__due",
            text: due.overdue ? "Overdue" : due.date ? `Due ${formatDate(due.date)}` : "",
          }),
        ]),
        el("span", { className: "today-item__title", text: e.vulnerabilityName }),
      ]),
    ]);
  });
  $("today-kev").replaceChildren(...items);
}

async function renderSitrep(sitrep, today) {
  const list = $("today-sitrep");
  if (!sitrep) {
    $("sitrep-meta").textContent = "No Sitrep has been published yet.";
    $("sitrep-more").hidden = true;
    return;
  }
  const href = `sitrep/?d=${encodeURIComponent(sitrep.date)}`;
  $("sitrep-more").href = href;
  $("sitrep-more").textContent = `All ${sitrep.items} items →`;
  $("sitrep-meta").textContent = sitrep.date === today
    ? `${teaserLabel(sitrep.date, today)} · ${sitrep.items} items`
    : `No Sitrep yet today. From ${formatShortDay(sitrep.date)}:`;
  const issue = await loadJSON(`data/sitrep/${encodeURIComponent(sitrep.date)}.json`, { optional: true });
  const titles = (issue?.items || []).slice(0, 3).map((item) => String(item.title || "")).filter(Boolean);
  list.replaceChildren(...titles.map((title) =>
    el("li", {}, [el("a", { className: "today-item", attrs: { href } }, [el("span", { className: "today-item__title", text: title })])])));
}

function renderWire(bw) {
  if (!bw) {
    $("bw-meta").textContent = "No Breach Wire issue has been published yet.";
    $("bw-more").hidden = true;
    return;
  }
  $("col-bw").textContent = `Breach Wire №${bw.issue}`;
  $("bw-meta").textContent = `Leak-site claims from ${formatLongDate(bw.window)} (UTC). Claims, not confirmed breaches.`;
  $("bw-more").href = `ransomware/?d=${encodeURIComponent(bw.date)}`;
  $("bw-bars").replaceChildren(...wireBars(bw).map((bar) => {
    const fill = el("span", { className: "today-bar__fill" });
    fill.style.width = `${Math.round(bar.ratio * 100)}%`;
    return el("div", { className: "today-bar" }, [
      el("span", { className: "today-bar__label", text: bar.label }),
      el("span", { className: "today-bar__track" }, [fill]),
      el("span", { className: "today-bar__n", text: numberFmt.format(bar.n) }),
    ]);
  }));
  const sweden = $("bw-sweden");
  const hit = Number(bw.sweden) > 0;
  sweden.textContent = hit ? `Sweden: ${bw.sweden} claimed` : "Sweden: no claims";
  sweden.className = hit ? "chip chip--alert" : "chip chip--ok";
  sweden.hidden = false;
}

function renderTrend(kev, today) {
  const months = monthlyCounts(kev, today, 12);
  const busiest = busiestMonth(months);
  const current = months[months.length - 1];
  if (busiest) {
    $("trend-note").textContent =
      `Busiest: ${monthYearFmt.format(isoToDate(busiest.month))} (${busiest.count}). This month so far: ${current.count}.`;
  }
  const top = Math.max(1, ...months.map((m) => m.count));
  $("today-chart").replaceChildren(...months.map((m, i) => {
    const isCurrent = i === months.length - 1;
    const isBusiest = busiest && m.month === busiest.month;
    const bar = el("span", { className: `today-chart__bar${isCurrent ? " today-chart__bar--current" : isBusiest ? " today-chart__bar--busiest" : ""}` });
    bar.style.height = `${Math.round((m.count / top) * 100)}%`;
    return el("div", { className: "today-chart__col", attrs: { title: `${monthYearFmt.format(isoToDate(m.month))}: ${m.count} added` } }, [
      el("span", { className: "today-chart__n", text: String(m.count) }),
      el("span", { className: "today-chart__plot" }, [bar]),
      el("span", { className: "today-chart__label", text: monthFmt.format(isoToDate(m.month)) }),
    ]);
  }));
  $("today-chart").setAttribute("aria-label", months.map((m) => `${monthFmt.format(isoToDate(m.month))} ${m.count}`).join(", "));
  $("today-chart").setAttribute("role", "img");
}

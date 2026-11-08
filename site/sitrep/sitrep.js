// sitrep.js: the Cyber Sitrep page.
//
// Flow: load the index → pick the issue from ?d= → draw the issue and archive
//       → load KEV data and add "In KEV" badges to matching CVEs.
// My stack (spec 004): KEV chips in the visitor's stack get a "Your stack" tag,
// and stories naming a ticked vendor get "Mentions <vendor>" tags.
//
// Issue text was written by an AI from web sources, so it's untrusted. It is
// only ever placed on the page as text (el() / textContent), and links go
// through safeWebUrl() via externalLink(). See ui.js.

import { el, externalLink, formatDate, formatLongDate, formatShortDay, loadJSON } from "../ui.js";
import { pickIssueDate, kevSet, markCves, isActionNeeded } from "../sitrep-logic.js";
import { inStack, mentionedVendors } from "../stack-logic.js";
import { readStack, renderStackLine } from "../stack-page.js";

const $ = (id) => document.getElementById(id);
const NVD = "https://nvd.nist.gov/vuln/detail/";
const stack = readStack();

async function init() {
  let issues = [];
  renderStackLine($("stack-line"), stack, "../#mystack");
  try {
    const index = await loadJSON("../data/sitrep/index.json", { optional: true });
    issues = index && Array.isArray(index.issues) ? index.issues : [];
    const pick = pickIssueDate(window.location.search, issues);
    renderArchive(issues, pick.date);

    if (pick.status === "none") {
      $("issue-line").textContent = "No issues published yet.";
      showNotice("The first Sitrep will appear here on the next weekday morning.");
      return;
    }
    if (pick.status === "unknown") {
      showNotice(`There's no Sitrep for “${pick.requested}”. Showing the latest issue instead.`);
    }

    // Safe to build this path: pick.date is a well-formed date that is listed in the index.
    const issue = await loadJSON(`../data/sitrep/${pick.date}.json`);
    renderIssue(issue);

    const kev = await loadJSON("../data/kev.json", { optional: true });
    if (kev) applyKev(kev);
  } catch (err) {
    console.error(err);
    $("issue-line").textContent = "Couldn't load the Sitrep. Please try refreshing the page.";
  }
}

function showNotice(text) {
  $("notice").textContent = text;
  $("notice").hidden = false;
}

// ---------- Issue ----------

function renderIssue(issue) {
  const items = issue.items || [];
  const emerging = issue.emerging || [];
  document.title = `Cyber Sitrep ${formatShortDay(issue.date)}: Threat Radar`;
  $("issue-line").textContent =
    `${formatLongDate(issue.date)} · ${items.length} incidents · ${emerging.length} emerging threats`;

  $("tldr").textContent = issue.tldr;
  $("tldr-box").hidden = false;

  $("emerging").replaceChildren(...emerging.map((entry) => story(entry, null)));
  $("emerging-section").hidden = emerging.length === 0;

  $("items").replaceChildren(...items.map((entry, i) => story(entry, i + 1)));
  $("items-section").hidden = items.length === 0;

  const needed = isActionNeeded(issue.action);
  $("action-h").textContent = needed ? "Action needed" : "No action needed";
  $("action-box").classList.toggle("action--needed", needed);
  $("action").textContent = issue.action;
  $("action-box").hidden = false;
}

function story(entry, number) {
  const meta = [externalLink(`${entry.source} ↗`, entry.url, "story__source")];
  if (entry.published) meta.push(document.createTextNode(` · ${formatDate(entry.published)}`));

  const cves = el("p", { className: "story__cves" });
  cves.dataset.cves = (entry.cves || []).join(" ");
  cves.append(...markCves(entry.cves, null).map(cveChip));
  cves.hidden = !(entry.cves || []).length;

  // "Mentions", not "Affects": a vendor being named doesn't mean your setup is hit.
  const mentions = stack.has ? mentionedVendors(`${entry.title} ${entry.description}`, stack.vendors) : [];
  const tags = el("p", { className: "story__mentions" },
    mentions.map((vendor) => el("span", { className: "badge badge--mine", text: `Mentions ${vendor}` })));
  tags.hidden = mentions.length === 0;

  return el("li", { className: "story" }, [
    el("span", { className: number ? "story__num" : "story__num story__num--emerging", text: number ? String(number) : "◆", attrs: { "aria-hidden": "true" } }),
    el("div", { className: "story__body" }, [
      el("h4", { className: "story__title", text: entry.title }),
      el("p", { className: "story__desc", text: entry.description }),
      el("p", { className: "story__meta" }, meta),
      cves,
      tags,
    ]),
  ]);
}

/** A CVE chip: links to the Radar entry if it's in KEV, otherwise to NVD. */
function cveChip({ cve, inKev, mine }) {
  if (inKev) {
    const parts = [el("span", { className: "mono", text: cve }), el("span", { className: "cve-chip__tag", text: "In KEV" })];
    if (mine) parts.push(el("span", { className: "cve-chip__tag cve-chip__tag--mine", text: "Your stack" }));
    return el("a", {
      className: mine ? "cve-chip cve-chip--kev cve-chip--mine" : "cve-chip cve-chip--kev",
      attrs: { href: `../#${encodeURIComponent(cve)}`, title: "In CISA's Known Exploited Vulnerabilities catalog. Open it on the Radar." },
    }, parts);
  }
  return el("a", {
    className: "cve-chip",
    attrs: { href: NVD + encodeURIComponent(cve), target: "_blank", rel: "noopener noreferrer", title: "Not in KEV. Open on NVD." },
  }, [el("span", { className: "mono", text: cve })]);
}

/** Once KEV data has loaded, redraw every CVE chip with its KEV status (AC-5) and stack match. */
function applyKev(kevEntries) {
  const kev = kevSet(kevEntries);
  const mine = new Set(stack.has ? kevEntries.filter((e) => inStack(e, stack.vendors)).map((e) => e.cveID) : []);
  for (const holder of document.querySelectorAll(".story__cves")) {
    const cves = holder.dataset.cves ? holder.dataset.cves.split(" ") : [];
    holder.replaceChildren(...markCves(cves, kev).map((chip) => cveChip({ ...chip, mine: mine.has(chip.cve) })));
  }
}

// ---------- Archive ----------

function renderArchive(issues, selected) {
  const rows = issues.map((issue) => {
    const link = el("a", { className: "archive__item", attrs: { href: `?d=${encodeURIComponent(issue.date)}` } }, [
      el("span", { className: "archive__date", text: formatShortDay(issue.date) }),
      el("span", { className: "archive__meta", text: `${issue.items} items${issue.actionNeeded ? " · action needed" : ""}` }),
      el("span", { className: "archive__tldr", text: issue.tldr }),
    ]);
    if (issue.date === selected) link.setAttribute("aria-current", "page");
    return el("li", {}, [link]);
  });
  $("archive").replaceChildren(...rows);
  if (!rows.length) $("archive").replaceChildren(el("li", { className: "muted", text: "No issues yet." }));
}

init();

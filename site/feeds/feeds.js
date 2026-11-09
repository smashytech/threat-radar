// feeds.js: the Feeds page (spec 005 FR-8, FR-9).
//
// Shows each feed's full address with a Copy button, a vendor-feed finder, and
// "Subscribe in a feed reader" for the visitor's My stack. Everything is drawn
// with textContent via el(), like the rest of the site.

import { el, debounce, numberFmt } from "../ui.js";
import { readStack } from "../stack-page.js";
import { describeStack } from "../stack-logic.js";
import { downloadStackOpml, vendorFeedList } from "../opml-download.js";

const $ = (id) => document.getElementById(id);
const ROOT = new URL("../", window.location.href).href; // the site's own address, e.g. https://zelin.se/
const MAX_RESULTS = 20;

/** Copy text; if the browser won't allow it (e.g. on http), select it so the visitor can press Ctrl+C. */
async function copy(input, button, what) {
  try {
    await navigator.clipboard.writeText(input.value);
    button.textContent = "Copied ✓";
    $("copy-status").textContent = `Copied the ${what} address.`;
  } catch {
    input.focus();
    input.select();
    button.textContent = "Press Ctrl+C (⌘C)";
    $("copy-status").textContent = `The ${what} address is selected. Press Ctrl+C, or Command+C on a Mac, to copy it.`;
  }
  setTimeout(() => { button.textContent = "Copy address"; }, 2500);
}

function copyRow(id, address, label) {
  const input = el("input", { className: "copy-row__input", attrs: { type: "text", id, readonly: "", value: address } });
  const button = el("button", { className: "button button--quiet", text: "Copy address", attrs: { type: "button", "aria-label": `Copy the ${label} feed address` } });
  button.addEventListener("click", () => copy(input, button, `${label} feed`));
  return el("div", { className: "copy-row" }, [
    el("label", { className: "visually-hidden", text: `Address of the ${label} feed`, attrs: { for: id } }), input, button,
  ]);
}

function wireMainFeeds() {
  for (const input of document.querySelectorAll("input[data-feed]")) {
    input.value = new URL(input.dataset.feed, ROOT).href;
    const button = document.querySelector(`button[data-copy="${input.id}"]`);
    const label = input.closest(".feed-card").querySelector(".feed-card__title").textContent;
    button.addEventListener("click", () => copy(input, button, label));
  }
}

async function wireVendorFinder() {
  let feeds;
  try {
    feeds = await vendorFeedList(ROOT); // the same list the subscribe button uses
  } catch {
    $("vendor-count").textContent = "The vendor feeds aren't available right now.";
    $("vendor-q").disabled = true;
    return;
  }
  const vendors = Object.keys(feeds).sort((a, b) => a.localeCompare(b, "en"));
  $("vendor-intro").textContent = `One feed for each of the ${numberFmt.format(vendors.length)} vendors in the catalog, with that vendor's 20 newest exploited vulnerabilities.`;
  const fold = (text) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const render = () => {
    const q = fold($("vendor-q").value.trim());
    if (!q) {
      $("vendor-count").textContent = "Type a vendor name to get its feed address.";
      $("vendor-results").replaceChildren();
      return;
    }
    const matches = vendors.filter((v) => fold(v).includes(q));
    const shown = matches.slice(0, MAX_RESULTS);
    $("vendor-count").textContent = matches.length === 0 ? `No vendor matches "${$("vendor-q").value.trim()}".`
      : matches.length > MAX_RESULTS ? `${matches.length} vendors match; showing the first ${MAX_RESULTS}. Keep typing to narrow it down.`
      : `${matches.length} ${matches.length === 1 ? "vendor matches" : "vendors match"}.`;
    $("vendor-results").replaceChildren(...shown.map((vendor, i) => el("li", { className: "vendor-result" }, [
      el("span", { className: "vendor-result__name", text: vendor }),
      copyRow(`vendor-addr-${i}`, new URL(feeds[vendor], ROOT).href, vendor),
    ])));
  };
  $("vendor-q").addEventListener("input", debounce(render, 120));
  render();
}

function wireStack() {
  const stack = readStack();
  const button = $("opml-download");
  if (!stack.has) {
    $("opml-stack").replaceChildren(
      el("a", { text: "Tick your stack", attrs: { href: "../#mystack" } }),
      " on the Radar, then come back here to subscribe to just the vendors you run.");
    return;
  }
  $("opml-stack").replaceChildren("Your stack: ", el("strong", { text: stack.name }), ` · ${describeStack(stack.vendors)}`);
  button.disabled = false;
  button.addEventListener("click", async () => {
    const result = await downloadStackOpml({ presetName: stack.name, vendors: stack.vendors, root: ROOT });
    $("opml-status").textContent = result.message;
    $("opml-status").classList.toggle("picker__status--error", !result.ok);
  });
}

wireMainFeeds();
wireStack();
wireVendorFinder();

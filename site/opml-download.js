// opml-download.js: the "Subscribe in a feed reader" button, shared by the
// My stack picker and the Feeds page (spec 005 FR-9).
//
// 1. feeds/vendors.json (vendor → feed address) is fetched AHEAD of time, when
//    the page or the picker opens, so clicking the button makes no request at all
// 2. the OPML text is built here in the browser (opml.js)
// 3. it's handed to the visitor as a download. The stack is never sent anywhere.

import { buildOpml, opmlFilename } from "./opml.js";
import { loadJSON } from "./ui.js";

let pending = null; // one fetch per page; retried if it failed

/** The vendor → feed address list, fetched once. */
export function vendorFeedList(root) {
  if (!pending) {
    pending = loadJSON(new URL("feeds/vendors.json", root).href).catch((err) => {
      pending = null;
      throw err;
    });
  }
  return pending;
}

/** Download the OPML for one preset. Returns { ok, message } for the status line. */
export async function downloadStackOpml({ presetName, vendors, root }) {
  let vendorFeeds;
  try {
    vendorFeeds = await vendorFeedList(root);
  } catch {
    return { ok: false, message: "The feeds aren't available right now. Please try again later." };
  }
  const result = buildOpml({ presetName, vendors, vendorFeeds, baseUrl: root });
  if (!result) return { ok: false, message: "Tick at least one vendor first." };
  if (!result.text) return { ok: false, message: "None of the ticked vendors has a feed (CISA may have renamed them)." };

  const name = opmlFilename(presetName);
  const url = URL.createObjectURL(new Blob([result.text], { type: "text/x-opml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  const narrowed = Object.values(vendors).some((products) => products.length > 0);
  const parts = [`Downloaded ${name} with ${result.count} vendor ${result.count === 1 ? "feed" : "feeds"}. Import it in your feed reader.`];
  if (narrowed) parts.push("Feeds are per vendor, so they include all of a vendor's products, not only the ones you ticked.");
  if (result.missing.length) parts.push(`No feed for: ${result.missing.join(", ")}.`);
  return { ok: true, message: parts.join(" ") };
}

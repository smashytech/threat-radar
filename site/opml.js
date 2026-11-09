// opml.js: turn a My stack preset into an OPML file (spec 005 FR-9).
//
// OPML is the standard "list of feeds" format: feed readers import it and
// subscribe to every feed inside at once. This file is built here, in the
// browser, and downloaded. The site never sees the stack.
//
// Pure functions, no DOM: tested in tests/opml.test.mjs.

// Characters XML forbids (see scripts/build_feeds.py): they'd make the whole file unreadable.
const FORBIDDEN_XML = /[^\t\n\r -퟿-�\u{10000}-\u{10ffff}]/gu;
// Only addresses the feed builder itself writes are accepted from vendors.json.
const VENDOR_FEED_PATH = /^feeds\/vendors\/[a-z0-9-]+\.xml$/;

const tidy = (value) => String(value ?? "").replace(FORBIDDEN_XML, "").replace(/\s+/g, " ").trim();
const escapeXml = (value) => tidy(value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * @returns {{ text: string|null, count: number, missing: string[] } | null}
 *   null when the stack is empty or the site address isn't a web address.
 *   `missing` lists ticked vendors that have no feed (e.g. renamed by CISA).
 */
export function buildOpml({ presetName, vendors, vendorFeeds, baseUrl }) {
  const names = Object.keys(vendors || {}).sort((a, b) => a.localeCompare(b, "en"));
  if (!names.length || !/^https?:\/\/[^\s"<>]+\/$/.test(String(baseUrl))) return null;

  const outlines = [];
  const missing = [];
  for (const vendor of names) {
    const path = vendorFeeds && Object.hasOwn(vendorFeeds, vendor) ? vendorFeeds[vendor] : null;
    if (typeof path !== "string" || !VENDOR_FEED_PATH.test(path)) {
      missing.push(vendor);
      continue;
    }
    const name = escapeXml(vendor);
    outlines.push(`    <outline type="rss" text="${name}" title="${name}" xmlUrl="${escapeXml(baseUrl + path)}" htmlUrl="${escapeXml(baseUrl)}"/>`);
  }
  if (!outlines.length) return { text: null, count: 0, missing };

  const text = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    "  <head>",
    `    <title>Threat Radar: ${escapeXml(presetName)}</title>`,
    "  </head>",
    "  <body>",
    ...outlines,
    "  </body>",
    "</opml>",
    "",
  ].join("\n");
  return { text, count: outlines.length, missing };
}

/** "Customer A" → "threat-radar-customer-a.opml" */
export function opmlFilename(presetName) {
  const slug = String(presetName ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
  return `threat-radar-${slug || "stack"}.opml`;
}

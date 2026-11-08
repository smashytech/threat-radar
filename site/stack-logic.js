// stack-logic.js: pure functions behind "My stack" (spec 004).
//
// A "stack" is a plain object: vendor name → list of product names.
// An empty list means "all products of this vendor".
//     { "Microsoft": ["Windows", "Exchange Server"], "Fortinet": [] }
// Names are exactly as they appear in CISA's KEV catalog.
//
// No DOM, no storage, no clock: tested in tests/stack.test.mjs.

import { shiftDays } from "./stats.js";

export const LIMITS = { vendors: 300, productsPerVendor: 50, name: 120, shareChars: 20000 };

// Names that are special inside JavaScript objects. No real vendor is called
// this, and refusing them means a crafted stack can't tamper with an object's internals.
const RESERVED = new Set(["__proto__", "constructor", "prototype"]);
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const SHARE_PREFIX = "stack=";

const byName = (a, b) => a.localeCompare(b, "en");

/** Every vendor with its products and counts: biggest first, ties alphabetical. */
export function vendorIndex(kev) {
  const vendors = new Map();
  for (const e of kev || []) {
    const v = vendors.get(e.vendorProject) || { count: 0, products: new Map() };
    v.count++;
    v.products.set(e.product, (v.products.get(e.product) || 0) + 1);
    vendors.set(e.vendorProject, v);
  }
  return [...vendors]
    .map(([vendor, v]) => ({
      vendor,
      count: v.count,
      products: [...v.products]
        .map(([product, count]) => ({ product, count }))
        .sort((a, b) => b.count - a.count || byName(a.product, b.product)),
    }))
    .sort((a, b) => b.count - a.count || byName(a.vendor, b.vendor));
}

/** Vendors whose name, or any of whose product names, contain the query (plain text, case-insensitive). */
export function searchIndex(index, query) {
  const q = String(query || "").trim().toLowerCase();
  const out = [];
  for (const v of index) {
    if (!q || v.vendor.toLowerCase().includes(q)) {
      out.push({ ...v, productMatch: false, matchedProducts: [] });
      continue;
    }
    const matched = v.products.filter((p) => p.product.toLowerCase().includes(q)).map((p) => p.product);
    if (matched.length) out.push({ ...v, productMatch: true, matchedProducts: matched });
  }
  return out;
}

function cleanName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > LIMITS.name || CONTROL_RE.test(name) || RESERVED.has(name)) return null;
  return name;
}

/** Validate and normalise a stack. Returns a clean copy, or null if anything is wrong. */
export function cleanVendors(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length > LIMITS.vendors) return null;
  const out = {};
  for (const key of keys) {
    const vendor = cleanName(key);
    const products = value[key];
    if (!vendor || Object.hasOwn(out, vendor) || !Array.isArray(products) || products.length > LIMITS.productsPerVendor) return null;
    const clean = [];
    for (const p of products) {
      const product = cleanName(p);
      if (!product) return null;
      if (!clean.includes(product)) clean.push(product);
    }
    out[vendor] = clean.sort(byName);
  }
  return out;
}

/** Is this KEV entry part of the stack? */
export function inStack(entry, vendors) {
  if (!vendors || typeof vendors !== "object" || !Object.hasOwn(vendors, entry.vendorProject)) return false;
  const products = vendors[entry.vendorProject];
  return Array.isArray(products) && (products.length === 0 || products.includes(entry.product));
}

/** Where the catalog stood at a visit: the newest date, plus every CVE added on that date.
 *  Dates alone would miss entries CISA adds later on the same day. */
export function catalogMark(kev) {
  if (!kev || !kev.length) return null;
  const through = kev.reduce((max, e) => (e.dateAdded > max ? e.dateAdded : max), "");
  const ids = kev.filter((e) => e.dateAdded === through).map((e) => e.cveID).sort();
  return { through, ids };
}

function isNewSince(entry, mark) {
  return entry.dateAdded > mark.through || (entry.dateAdded === mark.through && !mark.ids.includes(entry.cveID));
}

/** Numbers for the "My stack" summary strip. newSinceLastVisit is null when there's no previous visit. */
export function stackSummary(kev, vendors, today, previousMark) {
  const mine = (kev || []).filter((e) => inStack(e, vendors));
  const cutoff = shiftDays(today, -29);
  return {
    inCatalog: mine.length,
    last30: mine.filter((e) => e.dateAdded >= cutoff && e.dateAdded <= today).length,
    ransomware: mine.filter((e) => e.knownRansomwareCampaignUse === "Known").length,
    newSinceLastVisit: previousMark ? mine.filter((e) => isNewSince(e, previousMark)).length : null,
  };
}

/** Ticked vendors/products that aren't in the current catalog (e.g. after a CISA rename). */
export function staleNames(vendors, index) {
  const known = new Map(index.map((v) => [v.vendor, new Set(v.products.map((p) => p.product))]));
  const stale = [];
  for (const vendor of Object.keys(vendors || {})) {
    if (!known.has(vendor)) { stale.push({ vendor, product: null }); continue; }
    for (const product of vendors[vendor]) {
      if (!known.get(vendor).has(product)) stale.push({ vendor, product });
    }
  }
  return stale;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Ticked vendors named in a piece of text, as whole words ("Apple" is not in "pineapple"). */
export function mentionedVendors(text, vendors) {
  const haystack = String(text || "");
  return Object.keys(vendors || {}).filter((vendor) =>
    new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(vendor)}(?=$|[^\\p{L}\\p{N}])`, "iu").test(haystack));
}

/** "Microsoft (2 products), Cisco, Fortinet" */
export function describeStack(vendors) {
  const keys = Object.keys(vendors || {});
  if (!keys.length) return "Nothing ticked yet";
  const label = (k) => {
    const n = vendors[k].length;
    return n ? `${k} (${n} ${n === 1 ? "product" : "products"})` : k;
  };
  if (keys.length <= 4) return keys.map(label).join(", ");
  return `${keys.slice(0, 3).map(label).join(", ")} and ${keys.length - 3} more`;
}

/** The part after # in a share link. Browsers never send it to the server. */
export function encodeShare(vendors) {
  return SHARE_PREFIX + encodeURIComponent(JSON.stringify(vendors));
}

/** Read a share link's #stack=… part. Returns a clean stack, or null for anything odd. Never throws. */
export function decodeShare(hash) {
  if (typeof hash !== "string" || hash.length > LIMITS.shareChars) return null;
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!fragment.startsWith(SHARE_PREFIX)) return null;
  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(fragment.slice(SHARE_PREFIX.length)));
  } catch {
    return null;
  }
  const vendors = cleanVendors(parsed);
  return vendors && Object.keys(vendors).length ? vendors : null;
}

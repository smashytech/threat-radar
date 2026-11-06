// ui.js: small helpers shared by the Radar page and the Sitrep page.
//
// SECURITY RULE: el() puts text on the page with textContent, which the
// browser always treats as plain characters, never as HTML. Every page builds
// its DOM through these helpers. tests/site.test.mjs fails the build if any
// site file uses an HTML-injection API.

export const SVG_NS = "http://www.w3.org/2000/svg";

/** Create an element. Text goes in via textContent, which is always safe. */
export function el(tag, { className, text, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

/** Create an SVG element (SVG needs its own namespace). */
export function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Only real web links become clickable. Blocks tricks like "javascript:" URLs. */
export function safeWebUrl(text) {
  try {
    const url = new URL(String(text).trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** A link that opens in a new tab and can't control this page (or null if the URL is unsafe). */
export function externalLink(text, url, className) {
  const href = safeWebUrl(url);
  if (!href) return el("span", { className, text });
  return el("a", { className, text, attrs: { href, target: "_blank", rel: "noopener noreferrer" } });
}

export function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isoToDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function daysBetween(fromIso, toIso) {
  return Math.round((isoToDate(toIso) - isoToDate(fromIso)) / 86400000);
}

export const numberFmt = new Intl.NumberFormat();
const dateFmt = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const longDateFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const shortDayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
export const monthFmt = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" });
export const monthYearFmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
const relFmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export const formatDate = (iso) => dateFmt.format(isoToDate(iso));
export const formatLongDate = (iso) => longDateFmt.format(isoToDate(iso));
export const formatShortDay = (iso) => shortDayFmt.format(isoToDate(iso));

export function timeAgo(isoDateTime) {
  const seconds = (new Date(isoDateTime).getTime() - Date.now()) / 1000;
  if (!Number.isFinite(seconds)) return "";
  for (const [unit, size] of [["day", 86400], ["hour", 3600], ["minute", 60]]) {
    if (Math.abs(seconds) >= size) return relFmt.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function debounce(fn, wait) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}

export async function loadJSON(path, { optional = false } = {}) {
  try {
    const response = await fetch(path, { cache: "no-cache" });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    if (optional) return null;
    throw err;
  }
}

// presets.js: named presets for "My stack" (spec 004).
//
// A record holds every preset plus which one is active:
//   {
//     "v": 1,
//     "active": "Customer A",
//     "lastSeen": { "through": "2026-11-06", "ids": ["CVE-…"] } | null,
//     "presets": [ { "name": "Work", "myStackOnly": true, "vendors": { "Microsoft": ["Windows"] } }, … ]
//   }
//
// Every operation returns { record } or { error } and never changes its input,
// which makes the code easy to test (tests/presets.test.mjs) and to reason about.
// Pure: no storage here (see stack-store.js), no DOM.

import { cleanVendors } from "./stack-logic.js";

export const STORAGE_KEY = "threat-radar.presets.v1";
export const MAX_PRESETS = 20;
export const NAME_MAX = 40;
export const DEFAULT_NAME = "My stack";
const MAX_RECORD_CHARS = 300000;
const MAX_SEEN_IDS = 500;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CVE_RE = /^CVE-\d{4}-\d{4,}$/;

const clone = (value) => JSON.parse(JSON.stringify(value));
const fail = (error) => ({ error });
const tidy = (name) => String(name ?? "").replace(/\s+/g, " ").trim();
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
const find = (record, name) => record.presets.findIndex((p) => p.name === name);

export function emptyRecord() {
  return { v: 1, active: DEFAULT_NAME, lastSeen: null, presets: [{ name: DEFAULT_NAME, myStackOnly: false, vendors: {} }] };
}

export function activePreset(record) {
  return record.presets[find(record, record.active)] || record.presets[0];
}

/** Check a proposed preset name. `except` is the preset being renamed. */
function checkName(record, raw, except = null) {
  const name = tidy(raw);
  if (!name) return fail("Give the preset a name.");
  if (CONTROL_RE.test(String(raw))) return fail("That name contains characters that aren't allowed.");
  if (name.length > NAME_MAX) return fail(`Preset names can be at most ${NAME_MAX} characters.`);
  if (record.presets.some((p) => p.name !== except && sameName(p.name, name))) {
    return fail(`There's already a preset called "${name}".`);
  }
  return { name };
}

function withActive(record, change) {
  const next = clone(record);
  const i = find(next, next.active);
  change(next.presets[i < 0 ? 0 : i]);
  return { record: next };
}

export function setVendors(record, vendors) {
  const clean = cleanVendors(vendors);
  if (!clean) return fail("That isn't a valid stack.");
  return withActive(record, (p) => { p.vendors = clean; });
}

export function setMyStackOnly(record, on) {
  return withActive(record, (p) => { p.myStackOnly = Boolean(on); });
}

export function saveAs(record, rawName) {
  if (record.presets.length >= MAX_PRESETS) return fail(`You can keep up to ${MAX_PRESETS} presets. Delete one first.`);
  const checked = checkName(record, rawName);
  if (checked.error) return checked;
  const next = clone(record);
  const current = activePreset(next);
  next.presets.push({ name: checked.name, myStackOnly: current.myStackOnly, vendors: clone(current.vendors) });
  next.active = checked.name;
  return { record: next };
}

export function rename(record, oldName, rawName) {
  const i = find(record, oldName);
  if (i < 0) return fail("That preset doesn't exist.");
  const checked = checkName(record, rawName, oldName);
  if (checked.error) return checked;
  const next = clone(record);
  next.presets[i].name = checked.name;
  if (next.active === oldName) next.active = checked.name;
  return { record: next };
}

export function remove(record, name) {
  const i = find(record, name);
  if (i < 0) return fail("That preset doesn't exist.");
  if (record.presets.length === 1) return fail("Keep at least one preset. Clear its ticks instead.");
  const next = clone(record);
  next.presets.splice(i, 1);
  if (next.active === name) next.active = next.presets[0].name;
  return { record: next };
}

export function switchTo(record, name) {
  if (find(record, name) < 0) return fail("That preset doesn't exist.");
  return { record: { ...clone(record), active: name } };
}

/** A stack from a share link always becomes a NEW preset: "Shared stack", "Shared stack 2", … */
export function addShared(record, vendors) {
  if (record.presets.length >= MAX_PRESETS) return fail(`You can keep up to ${MAX_PRESETS} presets. Delete one first.`);
  const clean = cleanVendors(vendors);
  if (!clean) return fail("That isn't a valid stack.");
  let name = "Shared stack";
  for (let n = 2; record.presets.some((p) => sameName(p.name, name)); n++) name = `Shared stack ${n}`;
  const next = clone(record);
  next.presets.push({ name, myStackOnly: false, vendors: clean });
  next.active = name;
  return { record: next };
}

/** Store where the catalog stands now; hand back where it stood at the previous visit. */
export function touchLastSeen(record, mark) {
  return { previous: record.lastSeen ? clone(record.lastSeen) : null, record: { ...clone(record), lastSeen: mark ? clone(mark) : null } };
}

export function serializeRecord(record) {
  return JSON.stringify(record);
}

// ---------- Reading a stored record: strict, all-or-nothing ----------

const hasExactKeys = (obj, keys) =>
  obj && typeof obj === "object" && !Array.isArray(obj) &&
  Object.keys(obj).length === keys.length && keys.every((k) => Object.hasOwn(obj, k));

function validDate(text) {
  if (typeof text !== "string" || !DATE_RE.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

/** A catalog mark { through, ids } read from storage: a clean copy, or null if it's not a valid mark. */
export function validMark(value) {
  if (!hasExactKeys(value, ["through", "ids"]) || !validDate(value.through) || !Array.isArray(value.ids) ||
      value.ids.length > MAX_SEEN_IDS || !value.ids.every((id) => typeof id === "string" && CVE_RE.test(id))) {
    return null;
  }
  return { through: value.through, ids: [...value.ids] };
}

function parseLastSeen(value) {
  if (value === null) return { ok: true, value: null };
  const mark = validMark(value);
  return mark ? { ok: true, value: mark } : { ok: false };
}

/** Parse a stored record. Anything unexpected → null, so the page starts fresh instead of half-loading. */
export function parseRecord(text) {
  if (typeof text !== "string" || text.length > MAX_RECORD_CHARS) return null;
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (!hasExactKeys(data, ["v", "active", "lastSeen", "presets"]) || data.v !== 1) return null;
  if (!Array.isArray(data.presets) || data.presets.length < 1 || data.presets.length > MAX_PRESETS) return null;

  const record = { v: 1, active: null, lastSeen: null, presets: [] };
  for (const p of data.presets) {
    if (!hasExactKeys(p, ["name", "myStackOnly", "vendors"]) || typeof p.name !== "string" || typeof p.myStackOnly !== "boolean") return null;
    const checked = checkName(record, p.name);
    if (checked.error || checked.name !== p.name) return null;
    const vendors = cleanVendors(p.vendors);
    if (!vendors) return null;
    record.presets.push({ name: p.name, myStackOnly: p.myStackOnly, vendors });
  }
  if (typeof data.active !== "string" || find(record, data.active) < 0) return null;
  record.active = data.active;
  const seen = parseLastSeen(data.lastSeen);
  if (!seen.ok) return null;
  record.lastSeen = seen.value;
  return record;
}

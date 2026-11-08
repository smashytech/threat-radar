// Tests for site/presets.js: named presets for "My stack" (spec 004).
// Run from the repo root:  node --test tests/presets.test.mjs
//
// Every operation takes a record and returns { record } or { error }. Records are never changed in place.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyRecord, parseRecord, serializeRecord, activePreset, saveAs, rename, remove, switchTo,
  setVendors, setMyStackOnly, addShared, touchLastSeen, MAX_PRESETS,
} from "../site/presets.js";

const ok = (result) => { assert.ok(result.record, result.error); return result.record; };

function sample() {
  let r = emptyRecord();
  r = ok(setVendors(r, { Microsoft: ["Windows"], Cisco: [] }));
  r = ok(setMyStackOnly(r, true));
  r = ok(saveAs(r, "Customer A"));
  r = ok(setVendors(r, { Citrix: ["NetScaler"] }));
  r = ok(setMyStackOnly(r, false));
  return r;
}

test("a fresh record has one empty preset called My stack", () => {
  const r = emptyRecord();
  assert.equal(r.active, "My stack");
  assert.deepEqual(r.presets, [{ name: "My stack", myStackOnly: false, vendors: {} }]);
  assert.equal(r.lastSeen, null);
});

test("each preset keeps its own stack and its own My-stack-only view (AC-5)", () => {
  const r = sample();
  assert.deepEqual(r.presets.map((p) => p.name), ["My stack", "Customer A"]);
  assert.equal(r.active, "Customer A");
  assert.deepEqual(activePreset(r), { name: "Customer A", myStackOnly: false, vendors: { Citrix: ["NetScaler"] } });
  const back = ok(switchTo(r, "My stack"));
  assert.deepEqual(activePreset(back), { name: "My stack", myStackOnly: true, vendors: { Cisco: [], Microsoft: ["Windows"] } });
});

test("Save as copies the current stack and view, then switches to the copy", () => {
  let r = ok(setVendors(emptyRecord(), { Fortinet: [] }));
  r = ok(setMyStackOnly(r, true));
  r = ok(saveAs(r, "Home lab"));
  assert.deepEqual(activePreset(r), { name: "Home lab", myStackOnly: true, vendors: { Fortinet: [] } });
});

test("names: trimmed and tidied, unique ignoring case, 1-40 characters", () => {
  const r = sample();
  assert.equal(activePreset(ok(saveAs(r, "   Home    lab  "))).name, "Home lab");
  assert.match(saveAs(r, "customer a").error, /already a preset called/);
  assert.match(saveAs(r, "   ").error, /Give the preset a name/);
  assert.match(saveAs(r, "x".repeat(41)).error, /at most 40 characters/);
  assert.match(saveAs(r, "Tab\u0007bell").error, /aren't allowed/);
  assert.ok(saveAs(r, "<b>Not bold</b>").record, "markup is just text, rendered with textContent");
});

test("at most 20 presets", () => {
  let r = emptyRecord();
  for (let i = 2; i <= MAX_PRESETS; i++) r = ok(saveAs(r, `Preset ${i}`));
  assert.equal(r.presets.length, MAX_PRESETS);
  assert.match(saveAs(r, "One too many").error, /up to 20 presets/);
  assert.match(addShared(r, { Cisco: [] }).error, /up to 20 presets/);
});

test("rename updates the active name; duplicates refused; same name is fine", () => {
  const r = sample();
  const renamed = ok(rename(r, "Customer A", "Customer Alpha"));
  assert.equal(renamed.active, "Customer Alpha");
  assert.deepEqual(renamed.presets.map((p) => p.name), ["My stack", "Customer Alpha"]);
  assert.match(rename(r, "Customer A", "MY STACK").error, /already a preset called/);
  assert.ok(rename(r, "Customer A", "Customer A").record);
  assert.match(rename(r, "Nope", "Whatever").error, /doesn't exist/);
});

test("delete: never the last preset; deleting the active one switches to the first", () => {
  const r = sample();
  const after = ok(remove(r, "Customer A"));
  assert.deepEqual(after.presets.map((p) => p.name), ["My stack"]);
  assert.equal(after.active, "My stack");
  assert.match(remove(after, "My stack").error, /Keep at least one preset/);
  assert.match(remove(r, "Nope").error, /doesn't exist/);
});

test("switching to an unknown preset is refused", () => {
  assert.match(switchTo(sample(), "Ghost").error, /doesn't exist/);
});

test("invalid stacks are refused, not stored", () => {
  assert.match(setVendors(emptyRecord(), { constructor: [] }).error, /isn't a valid stack/);
  assert.match(setVendors(emptyRecord(), ["Cisco"]).error, /isn't a valid stack/);
});

test("a shared stack becomes a NEW preset and never replaces one (AC-11)", () => {
  let r = sample();
  r = ok(addShared(r, { Ivanti: [] }));
  assert.equal(r.active, "Shared stack");
  r = ok(addShared(r, { Zoho: [] }));
  assert.equal(r.active, "Shared stack 2");
  assert.deepEqual(r.presets.map((p) => p.name), ["My stack", "Customer A", "Shared stack", "Shared stack 2"]);
  assert.deepEqual(r.presets[1].vendors, { Citrix: ["NetScaler"] }, "existing presets untouched");
});

test("touchLastSeen hands back the previous mark and stores the new one", () => {
  const mark1 = { through: "2026-11-04", ids: ["CVE-2024-27834"] };
  const first = touchLastSeen(emptyRecord(), mark1);
  assert.equal(first.previous, null);
  const second = touchLastSeen(first.record, { through: "2026-11-06", ids: ["CVE-2026-19868"] });
  assert.deepEqual(second.previous, mark1);
  assert.equal(second.record.lastSeen.through, "2026-11-06");
});

test("operations never change the record they were given", () => {
  const r = sample();
  const before = JSON.stringify(r);
  saveAs(r, "X"); rename(r, "Customer A", "Y"); remove(r, "Customer A"); switchTo(r, "My stack");
  setVendors(r, { Zoho: [] }); setMyStackOnly(r, true); addShared(r, { Zoho: [] }); touchLastSeen(r, null);
  assert.equal(JSON.stringify(r), before);
});

test("round trip through storage text", () => {
  const r = touchLastSeen(sample(), { through: "2026-11-06", ids: ["CVE-2026-19868"] }).record;
  assert.deepEqual(parseRecord(serializeRecord(r)), r);
});

test("tampered or broken records are ignored as a whole (AC-12)", () => {
  const good = JSON.parse(serializeRecord(sample()));
  const variants = {
    "not JSON": "{oops",
    "an array": "[]",
    "wrong version": { ...good, v: 2 },
    "unknown field": { ...good, extra: 1 },
    "no presets": { ...good, presets: [] },
    "too many presets": { ...good, presets: Array.from({ length: 21 }, (_, i) => ({ name: `P${i}`, myStackOnly: false, vendors: {} })), active: "P0" },
    "duplicate names": { ...good, presets: [good.presets[0], { ...good.presets[1], name: "MY STACK" }] },
    "active missing": { ...good, active: "Ghost" },
    "bad view flag": { ...good, presets: [{ ...good.presets[0], myStackOnly: "yes" }, good.presets[1]] },
    "unknown preset field": { ...good, presets: [{ ...good.presets[0], html: "<b>" }, good.presets[1]] },
    "bad vendors": { ...good, presets: [{ ...good.presets[0], vendors: { __proto__x: "all" } }, good.presets[1]] },
    "reserved vendor": { ...good, presets: [{ ...good.presets[0], vendors: JSON.parse('{"__proto__":[]}') }, good.presets[1]] },
    "control char in name": { ...good, presets: [{ ...good.presets[0], name: "My\u0000stack" }, good.presets[1]], active: "Customer A" },
    "bad lastSeen date": { ...good, lastSeen: { through: "2026-13-45", ids: [] } },
    "bad lastSeen ids": { ...good, lastSeen: { through: "2026-11-06", ids: ["not-a-cve"] } },
    "lastSeen as text": { ...good, lastSeen: "2026-11-06" },
  };
  for (const [label, value] of Object.entries(variants)) {
    assert.equal(parseRecord(typeof value === "string" ? value : JSON.stringify(value)), null, label);
  }
  assert.equal(parseRecord(null), null);
  assert.equal(parseRecord("x".repeat(300001)), null, "oversized");
});

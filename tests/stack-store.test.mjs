// Tests for site/stack-store.js: where presets are kept (spec 004 FR-4, FR-7, FR-9).
// Run from the repo root:  node --test tests/stack-store.test.mjs
//
// Real browsers aren't needed: we hand the store fake storages, including ones
// that throw, like a browser with storage blocked.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../site/stack-store.js";
import { emptyRecord, setVendors, touchLastSeen, STORAGE_KEY } from "../site/presets.js";

class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  keys() { return [...this.map.keys()]; }
}
class BlockedStorage {
  getItem() { throw new Error("SecurityError"); }
  setItem() { throw new Error("SecurityError"); }
  removeItem() { throw new Error("SecurityError"); }
}
class FullStorage extends FakeStorage {
  setItem(k, v) { if (k === STORAGE_KEY) throw new Error("QuotaExceededError"); super.setItem(k, v); }
}

const withStack = () => touchLastSeen(setVendors(emptyRecord(), { Cisco: [] }).record, { through: "2026-11-06", ids: [] }).record;

test("a fresh visit stores nothing at all (Remember is off by default)", () => {
  const local = new FakeStorage(), session = new FakeStorage();
  const store = createStore({ local, session });
  const { record, remembered } = store.load();
  assert.deepEqual(record, emptyRecord());
  assert.equal(remembered, false);
  assert.deepEqual(local.keys(), [], "the availability probe cleans up after itself");
  assert.deepEqual(session.keys(), []);
});

test("Remember on: kept in localStorage only, and loads back as remembered (AC-4)", () => {
  const local = new FakeStorage(), session = new FakeStorage();
  const store = createStore({ local, session });
  assert.equal(store.save(withStack(), true).remembered, true);
  assert.deepEqual(local.keys(), [STORAGE_KEY]);
  assert.deepEqual(session.keys(), []);
  const again = createStore({ local, session: new FakeStorage() }).load(); // a new tab: fresh sessionStorage
  assert.equal(again.remembered, true);
  assert.deepEqual(again.record, withStack());
});

test("Remember off: sessionStorage only, no last-visit mark, and unticking deletes the stored copy (AC-4)", () => {
  const local = new FakeStorage(), session = new FakeStorage();
  const store = createStore({ local, session });
  store.save(withStack(), true);
  assert.equal(store.save(withStack(), false).remembered, false);
  assert.deepEqual(local.keys(), [], "unticking removes it from localStorage at once");
  assert.deepEqual(session.keys(), [STORAGE_KEY]);
  assert.equal(JSON.parse(session.getItem(STORAGE_KEY)).lastSeen, null, "visits aren't tracked unless remembered");
  assert.equal(createStore({ local, session: new FakeStorage() }).load().record.presets[0].vendors.Cisco, undefined,
    "a new tab starts empty");
});

test("Forget everything removes it from both storages (AC-6)", () => {
  const local = new FakeStorage(), session = new FakeStorage();
  const store = createStore({ local, session });
  store.save(withStack(), true);
  session.setItem(STORAGE_KEY, "leftover");
  store.forget();
  assert.deepEqual(local.keys(), []);
  assert.deepEqual(session.keys(), []);
  assert.deepEqual(store.load().record, emptyRecord());
});

test("a corrupted stored record is ignored and cleaned up", () => {
  const local = new FakeStorage(), session = new FakeStorage();
  local.setItem(STORAGE_KEY, '{"v":1,"presets":"<script>"}');
  const { record, remembered } = createStore({ local, session }).load();
  assert.deepEqual(record, emptyRecord());
  assert.equal(remembered, false);
  assert.deepEqual(local.keys(), []);
});

test("storage completely blocked: works in memory, never throws (AC-7)", () => {
  const store = createStore({ local: new BlockedStorage(), session: new BlockedStorage() });
  assert.deepEqual(store.available, { local: false, session: false });
  assert.equal(store.save(withStack(), true).remembered, false);
  assert.equal(store.load().record.presets[0].vendors.Cisco.length, 0, "kept in memory for this visit");
  assert.doesNotThrow(() => store.forget());
  assert.deepEqual(store.load().record, emptyRecord());
});

test("no storage objects at all (very old or locked-down browser)", () => {
  const store = createStore({ local: null, session: null });
  assert.deepEqual(store.available, { local: false, session: false });
  assert.doesNotThrow(() => store.save(withStack(), false));
});

test("localStorage blocked but sessionStorage works: Remember falls back honestly", () => {
  const session = new FakeStorage();
  const store = createStore({ local: new BlockedStorage(), session });
  const result = store.save(withStack(), true);
  assert.equal(result.remembered, false);
  assert.equal(result.reason, "unavailable");
  assert.deepEqual(session.keys(), [STORAGE_KEY]);
});

// A "visit" lasts as long as the tab: the last-visit mark is read once per tab, so
// moving Radar → Sitrep → Radar doesn't reset "new since last visit" to zero.
const MARK = { through: "2026-11-04", ids: ["CVE-2024-27834"] };

test("visit start: none yet, then kept for this tab only", () => {
  const local = new FakeStorage(), session = new FakeStorage();
  const store = createStore({ local, session });
  assert.equal(store.visitStart(), undefined, "no visit started in this tab yet");
  store.startVisit(MARK);
  assert.deepEqual(createStore({ local, session }).visitStart(), MARK, "same tab, next page: same starting point");
  store.startVisit(null);
  assert.equal(createStore({ local, session }).visitStart(), null, "a visit with no previous mark");
  assert.equal(createStore({ local, session: new FakeStorage() }).visitStart(), undefined, "a new tab is a new visit");
});

test("Forget and Remember off also remove the visit mark", () => {
  const local = new FakeStorage(), session = new FakeStorage();
  const store = createStore({ local, session });
  store.save(withStack(), true);
  store.startVisit(MARK);
  store.save(withStack(), false);
  assert.equal(store.visitStart(), undefined, "no visit tracking unless remembered");
  store.save(withStack(), true);
  store.startVisit(MARK);
  store.forget();
  assert.deepEqual(local.keys(), []);
  assert.deepEqual(session.keys(), []);
});

test("a tampered visit mark is ignored and removed; blocked storage falls back to memory", () => {
  const session = new FakeStorage();
  for (const bad of ["{oops", '{"previous":"2026-11-04"}', '{"previous":null,"x":1}', '{"previous":{"through":"2026-11-04","ids":["<b>"]}}']) {
    session.setItem("threat-radar.visit.v1", bad);
    assert.equal(createStore({ local: new FakeStorage(), session }).visitStart(), undefined, bad);
    assert.deepEqual(session.keys(), [], "cleaned up");
  }
  const blocked = createStore({ local: new BlockedStorage(), session: new BlockedStorage() });
  assert.equal(blocked.visitStart(), undefined);
  blocked.startVisit(MARK);
  assert.deepEqual(blocked.visitStart(), MARK, "kept in memory for this page");
});

test("a full localStorage falls back to sessionStorage instead of failing", () => {
  const session = new FakeStorage();
  const result = createStore({ local: new FullStorage(), session }).save(withStack(), true);
  assert.equal(result.remembered, false);
  assert.equal(result.reason, "failed");
  assert.deepEqual(session.keys(), [STORAGE_KEY]);
});

// stack-store.js: the ONLY file that touches browser storage (spec 004 FR-4, FR-7, FR-9).
//
//   Remember ticked   → localStorage   (kept until the visitor clears it)
//   Remember unticked → sessionStorage (gone when the tab closes)  ← the default
//
// Neither is ever sent to a server, unlike cookies. Every access is wrapped in
// try/catch because browsers can block storage (some private modes, strict
// settings), and the feature must still work for the visit, in memory.
// Storages are passed in, so tests can use fakes (tests/stack-store.test.mjs).

import { STORAGE_KEY, emptyRecord, parseRecord, serializeRecord, validMark } from "./presets.js";

const PROBE_KEY = "threat-radar.probe";
// Where the catalog stood when this tab's visit began (sessionStorage only), so
// Radar → Sitrep → Radar doesn't reset "new since last visit". Only used when remembered.
export const VISIT_KEY = "threat-radar.visit.v1";

/** {"previous": null | {through, ids}} → the mark (or null). Anything else → undefined. */
function parseVisit(text) {
  let data;
  try { data = JSON.parse(text); } catch { return undefined; }
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length !== 1 || !Object.hasOwn(data, "previous")) return undefined;
  if (data.previous === null) return null;
  return validMark(data.previous) || undefined;
}

/** Can we actually write to this storage? (Some browsers expose it but throw on use.) */
function works(storage) {
  if (!storage) return false;
  try {
    storage.setItem(PROBE_KEY, "1");
    storage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

function attempt(fn) {
  try { return fn(); } catch { return undefined; }
}

/** In a browser, find the real storages. Even reading window.localStorage can throw. */
export function browserStorages() {
  return {
    local: attempt(() => window.localStorage) || null,
    session: attempt(() => window.sessionStorage) || null,
  };
}

export function createStore({ local, session } = browserStorages()) {
  const available = { local: works(local), session: works(session) };
  let memory = null; // last resort when no storage works
  let memoryVisit;   // same, for the visit mark (undefined = no visit started)

  const dropVisit = () => {
    memoryVisit = undefined;
    if (available.session) attempt(() => session.removeItem(VISIT_KEY));
  };

  /** The mark this tab's visit started from: undefined = not started, null = started with no earlier visit. */
  function visitStart() {
    if (!available.session) return memoryVisit;
    const text = attempt(() => session.getItem(VISIT_KEY));
    if (text == null) return undefined;
    const mark = parseVisit(text);
    if (mark === undefined) attempt(() => session.removeItem(VISIT_KEY));
    return mark;
  }

  function startVisit(previous) {
    const mark = previous === null ? null : validMark(previous);
    const ok = available.session && attempt(() => { session.setItem(VISIT_KEY, JSON.stringify({ previous: mark })); return true; });
    memoryVisit = ok ? undefined : mark;
  }

  function read(storage) {
    const text = attempt(() => storage.getItem(STORAGE_KEY));
    if (text == null) return null;
    const record = parseRecord(text);
    if (!record) attempt(() => storage.removeItem(STORAGE_KEY)); // corrupted or tampered: clean it up
    return record;
  }

  function load() {
    const remembered = available.local ? read(local) : null;
    if (remembered) return { record: remembered, remembered: true };
    const fromSession = available.session ? read(session) : null;
    if (fromSession) return { record: fromSession, remembered: false };
    const fromMemory = memory ? parseRecord(memory) : null;
    return { record: fromMemory || emptyRecord(), remembered: false };
  }

  /** Save the record. Remember on → localStorage; off → sessionStorage, and the other copy is deleted. */
  function save(record, remember) {
    if (remember && available.local) {
      const ok = attempt(() => { local.setItem(STORAGE_KEY, serializeRecord(record)); return true; });
      if (ok) {
        if (available.session) attempt(() => session.removeItem(STORAGE_KEY));
        memory = null;
        return { remembered: true };
      }
    }
    const reason = remember ? (available.local ? "failed" : "unavailable") : undefined;
    // Not remembering: no last-visit tracking either.
    const text = serializeRecord({ ...record, lastSeen: null });
    if (available.local) attempt(() => local.removeItem(STORAGE_KEY));
    dropVisit();
    const stored = available.session && attempt(() => { session.setItem(STORAGE_KEY, text); return true; });
    memory = stored ? null : text;
    return reason ? { remembered: false, reason } : { remembered: false };
  }

  /** "Forget everything on this device." */
  function forget() {
    if (available.local) attempt(() => local.removeItem(STORAGE_KEY));
    if (available.session) attempt(() => session.removeItem(STORAGE_KEY));
    memory = null;
    dropVisit();
  }

  return { available, load, save, forget, visitStart, startVisit };
}

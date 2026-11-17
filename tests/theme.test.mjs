// Spec 007 AC-7: the light/dark choice.
// Run from the repo root:  node --test tests/theme.test.mjs
//
// site/theme.js is a classic script (it must run before the page is drawn), so
// instead of importing it we run its real source inside a small fake browser:
// a pretend <html> element, a pretend localStorage and a pretend device setting.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../site/theme.js", import.meta.url), "utf8");
const KEY = "threat-radar.theme.v1";

function fakeElement() {
  const attrs = new Map();
  const listeners = {};
  return {
    attrs,
    getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
    setAttribute: (n, v) => attrs.set(n, String(v)),
    removeAttribute: (n) => attrs.delete(n),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    click() { listeners.click?.(); },
  };
}

/** Load theme.js in a fresh fake browser. storage: object, or "blocked" to make every access throw. */
function browser({ stored = null, deviceDark = false, storage = "ok", buttons = 2 } = {}) {
  const data = new Map(stored ? [[KEY, stored]] : []);
  const localStorage = storage === "blocked"
    ? { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); } }
    : { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
  const html = fakeElement();
  const toggles = Array.from({ length: buttons }, fakeElement);
  const docListeners = {};
  const winListeners = {};
  let mediaListener = null;
  const media = { matches: deviceDark, addEventListener: (_t, fn) => { mediaListener = fn; } };
  const window = {
    matchMedia: () => media,
    addEventListener: (type, fn) => { winListeners[type] = fn; },
    get localStorage() { return localStorage; },
  };
  const document = {
    documentElement: html,
    readyState: "loading",
    addEventListener: (type, fn) => { docListeners[type] = fn; },
    querySelectorAll: (sel) => (sel === "[data-theme-toggle]" ? toggles : []),
  };
  vm.runInNewContext(SOURCE, { window, document, localStorage });
  return {
    html, toggles, data, media,
    ready() { docListeners.DOMContentLoaded?.(); },
    deviceChanges(dark) { media.matches = dark; mediaListener?.({ matches: dark }); },
    otherTab(value) { data.set(KEY, value); winListeners.storage?.({ key: KEY, newValue: value }); },
  };
}

test("no stored choice: the page follows the device (no data-theme set)", () => {
  const b = browser({ deviceDark: true });
  assert.equal(b.html.getAttribute("data-theme"), null);
  b.ready();
  assert.equal(b.toggles[0].getAttribute("aria-pressed"), "true", "the toggle shows dark is on");
});

test("a stored choice is applied before the page is drawn", () => {
  assert.equal(browser({ stored: "dark" }).html.getAttribute("data-theme"), "dark");
  assert.equal(browser({ stored: "light", deviceDark: true }).html.getAttribute("data-theme"), "light");
});

test("clicking the toggle flips the theme, remembers it and updates every toggle", () => {
  const b = browser({ deviceDark: false });
  b.ready();
  b.toggles[0].click();
  assert.equal(b.html.getAttribute("data-theme"), "dark");
  assert.equal(b.data.get(KEY), "dark");
  assert.equal(b.toggles[1].getAttribute("aria-pressed"), "true");
  assert.equal(b.toggles[1].getAttribute("title"), "Switch to light mode");
  b.toggles[1].click();
  assert.equal(b.html.getAttribute("data-theme"), "light");
  assert.equal(b.data.get(KEY), "light");
  assert.equal(b.toggles[0].getAttribute("aria-pressed"), "false");
});

test("blocked storage: the toggle still works for this page view", () => {
  const b = browser({ storage: "blocked", deviceDark: true });
  assert.equal(b.html.getAttribute("data-theme"), null);
  b.ready();
  b.toggles[0].click();
  assert.equal(b.html.getAttribute("data-theme"), "light");
});

test("junk in storage is ignored", () => {
  assert.equal(browser({ stored: "purple" }).html.getAttribute("data-theme"), null);
  assert.equal(browser({ stored: '"><script>' }).html.getAttribute("data-theme"), null);
});

test("the device switching to dark updates the toggle when no choice is stored", () => {
  const b = browser({ deviceDark: false });
  b.ready();
  assert.equal(b.toggles[0].getAttribute("aria-pressed"), "false");
  b.deviceChanges(true);
  assert.equal(b.toggles[0].getAttribute("aria-pressed"), "true");
});

test("a choice made in another tab is followed", () => {
  const b = browser();
  b.ready();
  b.otherTab("dark");
  assert.equal(b.html.getAttribute("data-theme"), "dark");
  assert.equal(b.toggles[0].getAttribute("aria-pressed"), "true");
});

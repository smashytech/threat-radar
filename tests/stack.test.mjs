// Tests for site/stack-logic.js, the pure logic behind "My stack" (spec 004).
// Run from the repo root:  node --test tests/stack.test.mjs
//
// Expected numbers are hand-counted from tests/fixtures/kev_valid.json, with "today" pinned to 2026-11-06.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  vendorIndex, searchIndex, cleanVendors, inStack, stackSummary, staleNames,
  mentionedVendors, encodeShare, decodeShare, catalogMark, describeStack,
} from "../site/stack-logic.js";

const TODAY = "2026-11-06";
const kev = JSON.parse(readFileSync(new URL("./fixtures/kev_valid.json", import.meta.url), "utf8")).vulnerabilities
  .sort((a, b) => (a.dateAdded < b.dateAdded ? 1 : -1));
const index = vendorIndex(kev);
const STACK = { Microsoft: ["Windows"], Ivanti: [], Broadcom: [] };

test("vendor index: every vendor with counts, biggest first, ties alphabetical (AC-1)", () => {
  assert.equal(index.length, 9);
  assert.deepEqual(index.map((v) => [v.vendor, v.count]).slice(0, 4),
    [["Microsoft", 3], ["Ivanti", 2], ["Apache", 1], ["Apple", 1]]);
  assert.deepEqual(index[0].products, [{ product: "Windows", count: 2 }, { product: "SharePoint", count: 1 }]);
});

test("search matches vendor AND product names, so vmware finds Broadcom (AC-2)", () => {
  assert.deepEqual(searchIndex(index, "vmware").map((v) => v.vendor), ["Broadcom"]);
  assert.equal(searchIndex(index, "vmware")[0].productMatch, true);
  assert.deepEqual(searchIndex(index, "windows").map((v) => v.vendor), ["Microsoft"]);
  assert.deepEqual(searchIndex(index, "  WORDpress ").map((v) => v.vendor), ["WordPress"]);
  assert.equal(searchIndex(index, "WordPress")[0].productMatch, false); // matched by vendor name
  assert.equal(searchIndex(index, "").length, 9);
  assert.equal(searchIndex(index, "(.*").length, 0); // plain text, never a pattern
});

test("matching: whole vendor, product subset, unknown names (AC-3)", () => {
  const byId = Object.fromEntries(kev.map((e) => [e.cveID, e]));
  assert.equal(inStack(byId["CVE-2026-96951"], STACK), true);   // Microsoft Windows
  assert.equal(inStack(byId["CVE-2026-65660"], STACK), false);  // Microsoft SharePoint: not ticked
  assert.equal(inStack(byId["CVE-2026-111357"], STACK), true);  // Ivanti, all products
  assert.equal(inStack(byId["CVE-2026-59310"], STACK), true);   // Broadcom VMware vCenter
  assert.equal(inStack(byId["CVE-2021-44228"], STACK), false);  // Apache: not ticked
  assert.equal(kev.filter((e) => inStack(e, STACK)).length, 5);
});

test("matching never trips over JavaScript's built-in object names", () => {
  assert.equal(inStack({ vendorProject: "constructor", product: "x" }, {}), false);
  assert.equal(inStack({ vendorProject: "toString", product: "x" }, { Microsoft: [] }), false);
  assert.equal(inStack({ vendorProject: "Microsoft", product: "Windows" }, null), false);
});

test("summary: in catalog, last 30 days, ransomware, new since last visit (AC-9)", () => {
  const prev = { through: "2026-10-29", ids: ["CVE-2026-97229"] };
  assert.deepEqual(stackSummary(kev, STACK, TODAY, prev), { inCatalog: 5, last30: 3, ransomware: 1, newSinceLastVisit: 2 });
  // Same-day additions count too: only one of the two 2026-10-30 entries had been seen.
  assert.equal(stackSummary(kev, STACK, TODAY, { through: "2026-10-30", ids: ["CVE-2026-111357"] }).newSinceLastVisit, 1);
  assert.equal(stackSummary(kev, STACK, TODAY, null).newSinceLastVisit, null); // first visit: no claim
  assert.deepEqual(stackSummary(kev, {}, TODAY, null), { inCatalog: 0, last30: 0, ransomware: 0, newSinceLastVisit: null });
});

test("catalog mark remembers the newest date AND the IDs on that date", () => {
  assert.deepEqual(catalogMark(kev), { through: "2026-11-04", ids: ["CVE-2024-27834"] });
  assert.equal(catalogMark([]), null);
});

test("stale names are kept and reported, never silently dropped (FR-15)", () => {
  assert.deepEqual(staleNames({ Microsoft: ["Windows", "Exchange Server"], Zoho: [], Ivanti: [] }, index), [
    { vendor: "Microsoft", product: "Exchange Server" },
    { vendor: "Zoho", product: null },
  ]);
});

test("vendor mentions are whole words: Apple is not in pineapple (AC-10)", () => {
  const vendors = { Cisco: [], Ivanti: [], Apple: [], "Palo Alto Networks": [] };
  assert.deepEqual(mentionedVendors("Cisco's FMC and IVANTI Connect Secure; pineapple juice", vendors), ["Cisco", "Ivanti"]);
  assert.deepEqual(mentionedVendors("Palo Alto Networks patched PAN-OS.", vendors), ["Palo Alto Networks"]);
  assert.deepEqual(mentionedVendors("Nothing relevant (.*) here", vendors), []);
  assert.deepEqual(mentionedVendors("Cisco", {}), []);
});

test("describeStack summarises a stack in plain words", () => {
  assert.equal(describeStack({}), "Nothing ticked yet");
  assert.equal(describeStack({ Cisco: [] }), "Cisco");
  assert.equal(describeStack({ Microsoft: ["Windows", "Exchange Server"], Cisco: [], Fortinet: [] }),
    "Microsoft (2 products), Cisco, Fortinet");
  assert.equal(describeStack({ A: [], B: [], C: [], D: [], E: [] }), "A, B, C and 2 more");
});

test("share link round trip (AC-11)", () => {
  const hash = "#" + encodeShare(STACK);
  assert.match(hash, /^#stack=/);
  assert.deepEqual(decodeShare(hash), { Microsoft: ["Windows"], Ivanti: [], Broadcom: [] });
  assert.deepEqual(decodeShare(hash.slice(1)), decodeShare(hash)); // with or without the leading #
});

test("hostile or malformed share links are ignored safely (AC-12)", () => {
  const bad = [
    "", "#", "#CVE-2021-44228", "#stack=", "#stack=%E0%A4%A", "#stack=not-json", "#stack=%5B%5D",
    "#stack=" + encodeURIComponent('{"Cisco":"all"}'),
    "#stack=" + encodeURIComponent('{"Cisco":[1,2]}'),
    "#stack=" + encodeURIComponent('{"__proto__":[]}'),
    "#stack=" + encodeURIComponent('{"constructor":[]}'),
    "#stack=" + encodeURIComponent(JSON.stringify({ ["x".repeat(121)]: [] })),
    "#stack=" + encodeURIComponent(JSON.stringify({ "Bad\u0000name": [] })),
    "#stack=" + encodeURIComponent(JSON.stringify(Object.fromEntries(Array.from({ length: 301 }, (_, i) => [`V${i}`, []])))),
    "#stack=" + encodeURIComponent(JSON.stringify({ Microsoft: Array.from({ length: 51 }, (_, i) => `P${i}`) })),
    "#stack=" + encodeURIComponent("{}"), // empty: nothing worth offering
    "#stack=" + "x".repeat(30000),
  ];
  for (const hash of bad) assert.equal(decodeShare(hash), null, hash.slice(0, 60));
});

test("markup in names is kept as plain text, never interpreted", () => {
  const hash = "#" + encodeShare({ "<img src=x onerror=alert(1)>": ["<script>alert(1)</script>"] });
  assert.deepEqual(decodeShare(hash), { "<img src=x onerror=alert(1)>": ["<script>alert(1)</script>"] });
});

test("cleanVendors normalises: trims, de-duplicates and sorts products", () => {
  assert.deepEqual(cleanVendors({ " Microsoft ": ["Windows", "Exchange Server", "Windows"] }),
    { Microsoft: ["Exchange Server", "Windows"] });
  assert.equal(cleanVendors(null), null);
  assert.equal(cleanVendors(["Cisco"]), null);
  assert.equal(cleanVendors({ Cisco: [], " Cisco": [] }), null); // duplicate after trimming
});

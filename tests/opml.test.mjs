// Tests for site/opml.js: "Subscribe in a feed reader" for My stack (spec 005 FR-9, AC-8).
// Run from the repo root:  node --test tests/opml.test.mjs
//
// OPML is the standard "list of feeds" file that feed readers import. It's built
// in the browser from the visitor's stack, so the stack never leaves the browser.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOpml, opmlFilename } from "../site/opml.js";

const BASE = "https://zelin.se/";
const FEEDS = {
  Microsoft: "feeds/vendors/microsoft.xml",
  Fortinet: "feeds/vendors/fortinet.xml",
  "Evil & Co <b>": "feeds/vendors/evil-co-b.xml",
};

/** Attribute values may only contain escaped &, < and quotes. */
function assertWellEscaped(text) {
  for (const [, value] of text.matchAll(/="([^"]*)"/g)) {
    assert.doesNotMatch(value, /<|&(?!(amp|lt|gt|quot|apos);)/, `badly escaped attribute: ${value}`);
  }
  for (const [, body] of text.matchAll(/>([^<]+)</g)) {
    assert.doesNotMatch(body, /&(?!(amp|lt|gt|quot|apos);)/, `badly escaped text: ${body}`);
  }
}

test("one outline per ticked vendor, with full addresses (AC-8)", () => {
  const { text, count, missing } = buildOpml({
    presetName: "Work", vendors: { Microsoft: ["Windows"], Fortinet: [] }, vendorFeeds: FEEDS, baseUrl: BASE,
  });
  assert.equal(count, 2);
  assert.deepEqual(missing, []);
  assert.ok(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">'));
  assert.match(text, /<title>Threat Radar: Work<\/title>/);
  const outlines = [...text.matchAll(/<outline [^>]*\/>/g)].map((m) => m[0]);
  assert.equal(outlines.length, 2);
  assert.equal(outlines[0], '<outline type="rss" text="Fortinet" title="Fortinet" xmlUrl="https://zelin.se/feeds/vendors/fortinet.xml" htmlUrl="https://zelin.se/"/>',
    "sorted by name; type=rss is what readers expect for any feed");
  assert.match(outlines[1], /xmlUrl="https:\/\/zelin\.se\/feeds\/vendors\/microsoft\.xml"/);
  assertWellEscaped(text);
});

test("markup in the preset or vendor name is escaped", () => {
  const { text } = buildOpml({
    presetName: '<img src=x onerror=alert(1)> & "quotes"', vendors: { "Evil & Co <b>": [] }, vendorFeeds: FEEDS, baseUrl: BASE,
  });
  assert.match(text, /<title>Threat Radar: &lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;quotes&quot;<\/title>/);
  assert.match(text, /text="Evil &amp; Co &lt;b&gt;"/);
  assert.doesNotMatch(text, /<img|<b>/);
  assertWellEscaped(text);
});

test("vendors without a feed (renamed by CISA) are reported, not included", () => {
  const result = buildOpml({ presetName: "Old", vendors: { VMware: [], Microsoft: [] }, vendorFeeds: FEEDS, baseUrl: BASE });
  assert.equal(result.count, 1);
  assert.deepEqual(result.missing, ["VMware"]);
  const none = buildOpml({ presetName: "Old", vendors: { VMware: [] }, vendorFeeds: FEEDS, baseUrl: BASE });
  assert.equal(none.count, 0);
  assert.equal(none.text, null, "nothing to subscribe to");
});

test("a tampered feed list can't point the reader anywhere else", () => {
  const hostile = {
    Microsoft: "javascript:alert(1)", Fortinet: "https://evil.example/feed.xml", Cisco: "feeds/vendors/../../x.xml",
    Zyxel: "feeds/vendors/zyxel.xml",
  };
  const { count, missing, text } = buildOpml({
    presetName: "P", vendors: { Microsoft: [], Fortinet: [], Cisco: [], Zyxel: [] }, vendorFeeds: hostile, baseUrl: BASE,
  });
  assert.equal(count, 1);
  assert.deepEqual(missing.sort(), ["Cisco", "Fortinet", "Microsoft"]);
  assert.doesNotMatch(text, /evil|javascript|\.\./);
  assert.equal(buildOpml({ presetName: "P", vendors: { Zyxel: [] }, vendorFeeds: hostile, baseUrl: "javascript:x" }), null,
    "and the site address must be a web address");
});

test("an empty stack gives nothing", () => {
  assert.equal(buildOpml({ presetName: "P", vendors: {}, vendorFeeds: FEEDS, baseUrl: BASE }), null);
  assert.equal(buildOpml({ presetName: "P", vendors: null, vendorFeeds: FEEDS, baseUrl: BASE }), null);
});

test("control characters are dropped so the file stays valid XML", () => {
  const { text } = buildOpml({ presetName: "A\u0000B\u001bC", vendors: { Microsoft: [] }, vendorFeeds: FEEDS, baseUrl: BASE });
  assert.match(text, /<title>Threat Radar: ABC<\/title>/);
});

test("file names are tidy", () => {
  assert.equal(opmlFilename("Customer A"), "threat-radar-customer-a.opml");
  assert.equal(opmlFilename("Åsa's stack"), "threat-radar-asa-s-stack.opml");
  assert.equal(opmlFilename("!!!"), "threat-radar-stack.opml");
  assert.equal(opmlFilename("x".repeat(200)).length <= 80, true);
});

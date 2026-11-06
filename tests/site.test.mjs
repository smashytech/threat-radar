// Static safety checks on the website files.
// Run from the repo root:  node --test tests/site.test.mjs
//
// These read the source code as text and look for things that must never be
// there. Cheap, fast and surprisingly effective.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Drop full-line comments so explanations that *mention* risky APIs don't trip the check. */
const codeOnly = (source) =>
  source.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");

for (const file of ["site/app.js", "site/stats.js"]) {
  test(`${file} never turns text into HTML (AC-6)`, () => {
    const code = codeOnly(read(file));
    for (const banned of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "setAttribute(\"style\"", "srcdoc"]) {
      assert.ok(!code.includes(banned), `${file} contains ${banned}`);
    }
  });
}

test("index.html declares a strict Content-Security-Policy (AC-7)", () => {
  const html = read("site/index.html");
  const match = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  assert.ok(match, "CSP meta tag missing");
  const csp = match[1];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*|https?:/, "CSP must not allow inline code, wildcards or other domains");
});

test("index.html loads nothing from other domains and has no inline code (NFR-1)", () => {
  const html = read("site/index.html").replace(/<!--[\s\S]*?-->/g, ""); // ignore HTML comments
  const loads = [...html.matchAll(/<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(loads.length >= 3, "expected local script, stylesheet and icon");
  for (const url of loads) assert.doesNotMatch(url, /^(https?:)?\/\//, `external resource: ${url}`);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, "inline <script> found");
  assert.doesNotMatch(html, /\sstyle="/, "inline style attribute found");
  assert.doesNotMatch(html, /\son[a-z]+="/, "inline event handler found");
});

test("links that open new tabs can't control this page", () => {
  const html = read("site/index.html");
  for (const tag of html.match(/<a\b[^>]*target="_blank"[^>]*>/g) || []) {
    assert.match(tag, /rel="[^"]*noopener[^"]*"/, tag);
  }
});

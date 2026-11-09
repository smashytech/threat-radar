// Static safety checks on every page and script in site/.
// Run from the repo root:  node --test tests/site.test.mjs
//
// These read the source code as text and look for things that must never be
// there. Cheap, fast and surprisingly effective. New files are picked up
// automatically, so a new page can't skip the checks.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("../site/", import.meta.url));

function filesUnder(dir, ext) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "data" ? [] : filesUnder(path, ext);
    return path.endsWith(ext) ? [path] : [];
  });
}

const jsFiles = filesUnder(SITE, ".js");
const htmlFiles = filesUnder(SITE, ".html");
const label = (path) => `site/${relative(SITE, path)}`;

/** Drop full-line comments so explanations that *mention* risky APIs don't trip the check. */
const codeOnly = (source) =>
  source.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
const withoutHtmlComments = (html) => html.replace(/<!--[\s\S]*?-->/g, "");

test("found the expected pages and scripts", () => {
  const names = [...jsFiles, ...htmlFiles].map(label).sort();
  for (const expected of ["site/app.js", "site/index.html", "site/sitrep/index.html", "site/sitrep/sitrep.js", "site/ui.js"]) {
    assert.ok(names.includes(expected), `missing ${expected}`);
  }
});

for (const file of jsFiles) {
  test(`${label(file)} never turns text into HTML (AC-6 / 002 AC-7)`, () => {
    const code = codeOnly(readFileSync(file, "utf8"));
    for (const banned of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function",
      "setAttribute(\"style\"", "srcdoc", "createContextualFragment", "DOMParser"]) {
      assert.ok(!code.includes(banned), `${label(file)} contains ${banned}`);
    }
  });
}

for (const file of htmlFiles) {
  const html = withoutHtmlComments(readFileSync(file, "utf8"));

  test(`${label(file)} declares a strict Content-Security-Policy (AC-7 / 002 AC-11)`, () => {
    const match = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
    assert.ok(match, "CSP meta tag missing");
    const csp = match[1];
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*|https?:/, "CSP must not allow inline code, wildcards or other domains");
  });

  test(`${label(file)} loads nothing from other domains and has no inline code (NFR-1)`, () => {
    const loads = [...html.matchAll(/<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(loads.length >= 3, "expected local script, stylesheet and icon");
    for (const url of loads) assert.doesNotMatch(url, /^(https?:)?\/\//, `external resource: ${url}`);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, "inline <script> found");
    assert.doesNotMatch(html, /\sstyle="/, "inline style attribute found");
    assert.doesNotMatch(html, /\son[a-z]+="/, "inline event handler found");
  });

  test(`${label(file)}: links that open new tabs can't control this page`, () => {
    for (const tag of html.match(/<a\b[^>]*target="_blank"[^>]*>/g) || []) {
      assert.match(tag, /rel="[^"]*noopener[^"]*"/, tag);
    }
  });
}

test("JS that opens new tabs always adds rel=noopener", () => {
  for (const file of jsFiles) {
    const code = codeOnly(readFileSync(file, "utf8"));
    for (const line of code.split("\n").filter((l) => l.includes('target: "_blank"'))) {
      assert.match(line, /rel: "noopener noreferrer"/, `${label(file)}: ${line.trim()}`);
    }
  }
});

test("dates and numbers always use the site's language, never the browser's", () => {
  for (const file of jsFiles) {
    const code = codeOnly(readFileSync(file, "utf8"));
    for (const match of code.matchAll(/new Intl\.\w+\(([^,)]*)/g)) {
      assert.equal(match[1].trim(), "SITE_LOCALE", `${label(file)}: ${match[0]} must use SITE_LOCALE`);
    }
    assert.doesNotMatch(code, /\.toLocale(Date|Time)?String\(/, `${label(file)}: toLocale…String() follows the browser's language`);
  }
});

// Spec 007 AC-8: every text colour in both themes is readable on every
// background it can sit on (WCAG AA: 4.5:1 for text, 3:1 for control borders).
// Run from the repo root:  node --test tests/contrast.test.mjs
//
// How contrast works: each colour has a "relative luminance" between 0 (black)
// and 1 (white). The contrast ratio is (lighter + 0.05) / (darker + 0.05), so
// black on white is 21:1 and grey on slightly lighter grey can be close to 1:1.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../site/styles.css", import.meta.url), "utf8");

/** The custom properties inside the first block that starts with `selector {`. */
function tokens(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `no "${selector} {" block in styles.css`);
  const body = css.slice(start + selector.length + 2, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

/** "#0f6e5c" or "rgba(15, 110, 92, 0.12)" → [r, g, b, a] with r,g,b 0–255. */
function parse(colour) {
  const hex = colour.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const rgba = colour.match(/^rgba?\(([^)]+)\)$/);
  assert.ok(rgba, `can't read colour ${colour}`);
  const parts = rgba[1].split(",").map((p) => Number(p.trim()));
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

/** A see-through colour as it actually appears on top of a solid one. */
function over(top, bottom) {
  const [r, g, b, a] = parse(top);
  const base = parse(bottom);
  return [r, g, b].map((c, i) => c * a + base[i] * (1 - a));
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const solid = (c) => parse(c).slice(0, 3);

const THEMES = {
  light: tokens(":root"),
  dark: tokens(':root[data-theme="dark"]'),
};

test("the dark theme is defined once for the toggle and once for the device setting, identically", () => {
  assert.deepEqual(tokens(':root:not([data-theme="light"])'), THEMES.dark);
});

const TEXT = ["text", "text-2", "muted", "accent", "hot", "alert", "mine"];
const BACKGROUNDS = ["bg", "surface", "surface-2"];

for (const [name, t] of Object.entries(THEMES)) {
  test(`${name}: text colours on every background reach 4.5:1`, () => {
    for (const fg of TEXT) for (const bg of BACKGROUNDS) {
      const r = ratio(solid(t[fg]), solid(t[bg]));
      assert.ok(r >= 4.5, `${name} --${fg} on --${bg}: ${r.toFixed(2)}:1`);
    }
  });

  test(`${name}: coloured labels on their tinted chips reach 4.5:1`, () => {
    for (const fg of ["accent", "hot", "alert", "mine"]) for (const bg of ["surface", "bg"]) {
      const r = ratio(solid(t[fg]), over(t[`${fg}-soft`], t[bg]));
      assert.ok(r >= 4.5, `${name} --${fg} on --${fg}-soft over --${bg}: ${r.toFixed(2)}:1`);
    }
  });

  test(`${name}: button text on the accent colour reaches 4.5:1`, () => {
    const r = ratio(solid(t["on-accent"]), solid(t.accent));
    assert.ok(r >= 4.5, `${name} --on-accent on --accent: ${r.toFixed(2)}:1`);
  });

  test(`${name}: control borders stand out 3:1 (WCAG 1.4.11)`, () => {
    for (const bg of ["bg", "surface"]) {
      const r = ratio(solid(t["border-strong"]), solid(t[bg]));
      assert.ok(r >= 3, `${name} --border-strong on --${bg}: ${r.toFixed(2)}:1`);
    }
  });
}

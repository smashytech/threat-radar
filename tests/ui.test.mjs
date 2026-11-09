// Tests for the date and number formatting in site/ui.js.
// Run from the repo root:  node --test tests/ui.test.mjs
//
// The site is written in English, so dates, numbers and "time ago" must be in
// English too, whatever language the visitor's browser uses. (A Swedish browser
// used to show "söndag 8 november 2026" and "i går" in the middle of English text.)
// CI also runs this file with a Swedish system language to prove it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SITE_LOCALE, numberFmt, formatDate, formatLongDate, formatShortDay, monthFmt, monthYearFmt, timeAgo, isoToDate } from "../site/ui.js";

test("the site language is British English, like its spelling", () => {
  assert.equal(SITE_LOCALE, "en-GB");
});

test("dates are written in English", () => {
  assert.equal(formatDate("2026-11-06"), "6 Nov 2026");
  assert.match(formatLongDate("2026-11-08"), /^Sunday,? 8 November 2026$/, "newer browsers add the comma; both are English");
  assert.equal(formatShortDay("2026-11-07"), "Sat 7 Nov");
  assert.equal(monthFmt.format(isoToDate("2026-11-01")), "Nov");
  assert.equal(monthYearFmt.format(isoToDate("2026-11-01")), "November 2026");
});

test("numbers use English separators", () => {
  assert.equal(numberFmt.format(1769), "1,769");
  assert.equal(numberFmt.format(1234567), "1,234,567");
});

test("'time ago' is English", () => {
  const ago = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();
  assert.equal(timeAgo(ago(86400)), "yesterday");
  assert.equal(timeAgo(ago(3 * 86400)), "3 days ago");
  assert.equal(timeAgo(ago(60)), "1 minute ago");
  assert.equal(timeAgo(ago(5)), "just now");
});

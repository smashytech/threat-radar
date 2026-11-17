// theme.js: light or dark (spec 007).
//
// Loaded as a plain <script> in every page's <head>, NOT as a module and NOT
// deferred, so it runs before the page is drawn. That's what prevents a white
// flash for someone who chose dark mode.
//
// How the theme is decided:
//   1. The visitor tapped the toggle before → their choice, stored in this
//      browser under KEY, sets <html data-theme="light|dark">.
//   2. No choice stored → no data-theme at all; styles.css then follows the
//      device's own light/dark setting (prefers-color-scheme).
// Nothing leaves the browser; if storage is blocked the toggle still works
// for the current page view.
(function () {
  "use strict";
  var KEY = "threat-radar.theme.v1";
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function valid(value) { return value === "light" || value === "dark" ? value : null; }

  function stored() {
    try { return valid(localStorage.getItem(KEY)); } catch (e) { return null; }
  }

  function store(value) {
    try { localStorage.setItem(KEY, value); } catch (e) { /* blocked storage: choice lasts for this page view */ }
  }

  /** The theme actually showing right now. */
  function current() {
    return valid(root.getAttribute("data-theme")) || (media && media.matches ? "dark" : "light");
  }

  function apply(value) {
    if (value) root.setAttribute("data-theme", value);
    sync();
  }

  /** Every toggle says whether dark mode is on, and what a click will do. */
  function sync() {
    var dark = current() === "dark";
    var toggles = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].setAttribute("aria-pressed", dark ? "true" : "false");
      toggles[i].setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
    }
  }

  function toggle() {
    var next = current() === "dark" ? "light" : "dark";
    store(next);
    apply(next);
  }

  // 1. Before drawing: apply a stored choice.
  apply(stored());

  // 2. Once the page exists: wire up the buttons.
  function wire() {
    var toggles = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < toggles.length; i++) toggles[i].addEventListener("click", toggle);
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();

  // The device switched light/dark (e.g. at sunset): only the buttons need updating.
  if (media && media.addEventListener) media.addEventListener("change", sync);

  // A choice made in another tab of this site.
  window.addEventListener("storage", function (event) {
    if (event.key === KEY) apply(valid(event.newValue));
  });
})();

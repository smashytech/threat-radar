// stack-picker.js: the "My stack" dialog on the Radar (spec 004 FR-1 to FR-7, FR-9, FR-15).
//
// The picker owns NO data. It asks app.js for the current state and hands every
// change back through `commit`, so there is exactly one source of truth:
//
//   tick a box → new vendors object → setVendors() → commit(record) → saved + page redrawn
//
// Rows are updated in place rather than redrawn, so keyboard focus never jumps
// away from the checkbox you just pressed. Names from the catalog or from storage
// only ever reach the page through el() / textContent.

import { el, numberFmt, debounce } from "./ui.js";
import { searchIndex, staleNames, describeStack } from "./stack-logic.js";
import { activePreset, saveAs, rename, remove, switchTo, setVendors, MAX_PRESETS } from "./presets.js";

const $ = (id) => document.getElementById(id);
const ARM_MS = 5000; // how long a "click again to confirm" button stays armed

/**
 * @param {object} deps
 * @param {Array}    deps.index         vendorIndex(kev)
 * @param {object}   deps.available     store.available: { local, session }
 * @param {Function} deps.getState      () => ({ record, remembered })
 * @param {Function} deps.commit        (record) => void: save it and redraw the page
 * @param {Function} deps.setRemember   (on) => ({ remembered, reason? })
 * @param {Function} deps.forget        () => void
 * @param {Function} deps.countEntries  (vendors) => how many catalog entries that stack covers
 * @param {Function} deps.shareUrl      (vendors) => the full share link
 */
export function createPicker(deps) {
  const { index, available, getState, commit, setRemember, forget, countEntries, shareUrl } = deps;
  const dialog = $("picker");
  const rows = new Map();     // vendor → { li, box, expand, products, item, productBoxes, note, rendered }
  const expanded = new Set(); // vendors whose product list is open
  let query = "";
  let formMode = null;        // "new" | "rename" | null
  let rowId = 0;

  const record = () => getState().record;
  const vendors = () => activePreset(record()).vendors;

  function status(text, isError = false) {
    $("picker-status").textContent = text;
    $("picker-status").classList.toggle("picker__status--error", isError);
  }

  /** Validate and store a new stack for the active preset. */
  function changeVendors(next) {
    const result = setVendors(record(), next);
    if (result.error) {
      status(result.error, true);
      return;
    }
    commit(result.record);
    renderSelected();
  }

  // ---------- Ticking ----------

  function setVendorTicked(vendor, on) {
    const next = { ...vendors() };
    if (on) next[vendor] = []; // [] means "all products, including future ones"
    else delete next[vendor];
    changeVendors(next);
    updateRow(vendor);
  }

  function setProductTicked(item, product, on) {
    const next = { ...vendors() };
    const all = item.products.map((p) => p.product);
    const current = Object.hasOwn(next, item.vendor) ? next[item.vendor] : null;
    // "All" is stored as [], so unticking one product starts from the full list.
    let list = current === null ? [] : current.length === 0 ? [...all] : [...current];
    list = on ? (list.includes(product) ? list : [...list, product]) : list.filter((p) => p !== product);
    if (!list.length) delete next[item.vendor];
    else next[item.vendor] = all.every((p) => list.includes(p)) ? [] : list; // every product ticked = all
    changeVendors(next);
    updateRow(item.vendor);
  }

  // ---------- The vendor list ----------

  function renderList() {
    rows.clear();
    expanded.clear();
    const items = searchIndex(index, query);
    if (query) for (const item of items) if (item.productMatch) expanded.add(item.vendor); // show why it matched
    const q = query.trim();
    $("picker-count").textContent = q
      ? items.length ? `${items.length} of ${index.length} vendors match "${q}"` : ""
      : `${index.length} vendors in the catalog, most-exploited first`;
    $("picker-list").replaceChildren(...(items.length
      ? items.map(buildRow)
      : [el("li", { className: "pick-list__empty", text: `No vendor or product matches "${q}".` })]));
  }

  function buildRow(item) {
    const id = `pick-${++rowId}`;
    const box = el("input", { attrs: { type: "checkbox" } });
    box.addEventListener("change", () => setVendorTicked(item.vendor, box.checked));
    const label = el("label", { className: "pick__vendor" }, [
      box,
      el("span", { className: "pick__name", text: item.vendor }),
      el("span", { className: "pick__count" }, [numberFmt.format(item.count), el("span", { className: "visually-hidden", text: " entries" })]),
    ]);
    const expand = el("button", { className: "pick__expand", attrs: { type: "button", "aria-controls": `${id}-products` } });
    expand.addEventListener("click", () => {
      if (expanded.has(item.vendor)) expanded.delete(item.vendor);
      else expanded.add(item.vendor);
      updateRow(item.vendor);
    });
    const products = el("div", { className: "pick__products", attrs: { id: `${id}-products` } });
    const li = el("li", { className: "pick" }, [el("div", { className: "pick__row" }, [label, expand]), products]);
    rows.set(item.vendor, { li, box, expand, products, item, productBoxes: new Map(), note: null, rendered: false });
    updateRow(item.vendor);
    return li;
  }

  function renderProducts(row) {
    const { item } = row;
    const filtered = item.productMatch && query;
    const list = filtered ? item.products.filter((p) => item.matchedProducts.includes(p.product)) : item.products;
    row.productBoxes.clear();
    row.note = el("p", { className: "pick__note" });
    const items = list.map(({ product, count }) => {
      const pbox = el("input", { attrs: { type: "checkbox" } });
      pbox.addEventListener("change", () => setProductTicked(item, product, pbox.checked));
      row.productBoxes.set(product, pbox);
      return el("li", {}, [el("label", { className: "pick__product" }, [
        pbox,
        el("span", { className: "pick__name", text: product }),
        el("span", { className: "pick__count" }, [numberFmt.format(count), el("span", { className: "visually-hidden", text: " entries" })]),
      ])]);
    });
    const parts = [row.note, el("ul", { className: "pick__plist" }, items)];
    if (filtered) parts.push(el("p", { className: "pick__note", text: `Showing the ${list.length} of ${item.products.length} products that match "${query.trim()}".` }));
    row.products.replaceChildren(...parts);
    row.rendered = true;
  }

  /** Bring one row in line with the current stack, without rebuilding it (keeps focus). */
  function updateRow(vendor) {
    const row = rows.get(vendor);
    if (!row) return;
    const { item, box, expand, products, li } = row;
    const stack = vendors();
    const on = Object.hasOwn(stack, vendor);
    const chosen = on ? stack[vendor] : [];
    const narrowed = on && chosen.length > 0;
    box.checked = on;
    box.indeterminate = narrowed; // the "–" look, read out as "mixed"
    li.classList.toggle("pick--on", on);

    const total = item.products.length;
    const known = narrowed ? chosen.filter((p) => item.products.some((x) => x.product === p)).length : 0;
    const count = narrowed ? `${known} of ${total}` : on ? `All ${total}` : `${total}`;
    const open = expanded.has(vendor);
    expand.replaceChildren(
      el("span", { text: open ? "▾ " : "▸ ", attrs: { "aria-hidden": "true" } }),
      count,
      // Hidden on narrow screens to leave room for the vendor name; screen readers always hear it.
      el("span", { className: "pick__expand-noun", text: ` ${total === 1 ? "product" : "products"}` }),
      el("span", { className: "visually-hidden", text: ` for ${vendor}` }),
    );
    expand.setAttribute("aria-expanded", String(open));

    products.hidden = !open;
    if (open && !row.rendered) renderProducts(row);
    if (!open && row.rendered) {
      products.replaceChildren();
      row.productBoxes.clear();
      row.rendered = false;
    }
    for (const [product, pbox] of row.productBoxes) pbox.checked = on && (chosen.length === 0 || chosen.includes(product));
    if (row.note) {
      row.note.textContent = !on ? "Tick products to add only those, or tick the vendor for all of them."
        : narrowed ? "Only the ticked products are in your stack."
        : "All products are in your stack, including any CISA adds later.";
    }
  }

  // ---------- What's ticked, and names CISA no longer uses ----------

  function renderSelected() {
    const stack = vendors();
    const n = Object.keys(stack).length;
    const entries = n ? countEntries(stack) : 0;
    $("picker-selected").textContent = n
      ? `Ticked: ${describeStack(stack)} · ${numberFmt.format(entries)} ${entries === 1 ? "entry" : "entries"} in the catalog`
      : "Nothing ticked yet.";

    const stale = staleNames(stack, index);
    $("picker-stale").hidden = stale.length === 0;
    $("stale-list").replaceChildren(...stale.map(({ vendor, product }) => {
      const name = product ? `${vendor} · ${product}` : vendor;
      const button = el("button", { className: "link-button", text: "Remove", attrs: { type: "button", "aria-label": `Remove ${name}` } });
      button.addEventListener("click", () => {
        const next = { ...vendors() };
        if (product === null) delete next[vendor];
        else {
          const list = next[vendor].filter((p) => p !== product);
          if (list.length) next[vendor] = list;
          else delete next[vendor];
        }
        changeVendors(next);
        updateRow(vendor);
        status(`Removed ${name}.`);
        $("picker-q").focus();
      });
      return el("li", {}, [el("span", { text: name }), button]);
    }));
    $("share-copy").disabled = n === 0;
  }

  // ---------- Presets ----------

  function renderPresets() {
    const r = record();
    $("preset-select").replaceChildren(...r.presets.map((p) => el("option", { text: p.name, attrs: { value: p.name } })));
    $("preset-select").value = r.active;
    const last = r.presets.length === 1;
    const full = r.presets.length >= MAX_PRESETS;
    $("preset-delete").disabled = last;
    $("preset-delete").title = last ? "Keep at least one preset. Clear its ticks instead." : "";
    $("preset-new").disabled = full;
    $("preset-new").title = full ? `You can keep up to ${MAX_PRESETS} presets.` : "";
  }

  function showError(text) {
    $("preset-error").textContent = text;
    $("preset-error").hidden = !text;
    $("preset-name").setAttribute("aria-invalid", String(Boolean(text)));
  }

  function openForm(mode) {
    formMode = mode;
    const current = activePreset(record()).name;
    $("preset-form-label").textContent = mode === "new" ? "Name for the new preset" : `New name for "${current}"`;
    $("preset-submit").textContent = mode === "new" ? "Save preset" : "Rename";
    $("preset-name").value = mode === "new" ? "" : current;
    showError("");
    $("preset-form").hidden = false;
    $("preset-name").focus();
    $("preset-name").select();
  }

  function closeForm(returnFocus = true) {
    if (!formMode) return;
    const opener = formMode === "new" ? "preset-new" : "preset-rename";
    formMode = null;
    $("preset-form").hidden = true;
    showError("");
    if (returnFocus) $(opener).focus();
  }

  const rememberNudge = () => (getState().remembered ? "" : " Tick Remember below to keep it for next time.");

  $("preset-new").addEventListener("click", () => openForm("new"));
  $("preset-rename").addEventListener("click", () => openForm("rename"));
  $("preset-cancel").addEventListener("click", () => closeForm());
  $("preset-name").addEventListener("input", () => showError(""));
  $("preset-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const r = record();
    const result = formMode === "new" ? saveAs(r, $("preset-name").value) : rename(r, r.active, $("preset-name").value);
    if (result.error) {
      showError(result.error);
      $("preset-name").focus();
      return;
    }
    const verb = formMode === "new" ? "Saved as" : "Renamed to";
    commit(result.record);
    closeForm(false);
    renderPresets();
    renderSelected();
    $("preset-select").focus();
    status(`${verb} "${activePreset(result.record).name}".${rememberNudge()}`);
  });

  $("preset-select").addEventListener("change", (event) => {
    const result = switchTo(record(), event.target.value);
    if (result.error) {
      status(result.error, true);
      return;
    }
    commit(result.record);
    closeForm(false);
    renderAll();
    status(`Switched to "${result.record.active}".`);
  });

  /** A button that needs a second click within a few seconds: no blocking confirm() pop-ups. */
  function armable(button, armedText, action) {
    const idle = button.textContent;
    let timer = null;
    const disarm = () => {
      clearTimeout(timer);
      timer = null;
      button.textContent = idle;
      button.classList.remove("button--armed");
    };
    button.addEventListener("click", () => {
      if (!timer) {
        button.textContent = armedText();
        button.classList.add("button--armed");
        status(`${armedText()} to confirm.`);
        timer = setTimeout(disarm, ARM_MS);
        return;
      }
      disarm();
      action();
    });
    button.addEventListener("blur", disarm);
    return disarm;
  }

  const disarmDelete = armable($("preset-delete"), () => `Click again to delete "${activePreset(record()).name}"`, () => {
    const name = activePreset(record()).name;
    const result = remove(record(), name);
    if (result.error) {
      status(result.error, true);
      return;
    }
    commit(result.record);
    renderAll();
    $("preset-select").focus();
    status(`Deleted "${name}". Now using "${result.record.active}".`);
  });

  // ---------- On this device ----------

  function renderHint() {
    const { remembered, record: r } = getState();
    const hasSomething = Object.keys(activePreset(r).vendors).length > 0 || r.presets.length > 1;
    let text;
    let warn = false;
    if (!available.local) {
      warn = true;
      text = available.session
        ? "This browser isn't letting sites store data, so remembering isn't available. Your stack lasts while this tab is open."
        : "This browser is blocking storage, so remembering isn't available. Your stack lasts until you leave or reload this page.";
    } else if (remembered) {
      text = "Kept in this browser until you untick this. Untick it on shared or work computers.";
    } else if (hasSomething) {
      warn = true;
      text = "Not remembered: this is gone when you close the tab. Tick to keep it for next time.";
    } else {
      text = "Off by default, so nothing is kept after you close the tab. Leave it off on shared computers.";
    }
    $("remember").checked = remembered;
    $("remember").disabled = !available.local;
    $("remember-hint").textContent = text;
    $("remember-hint").classList.toggle("picker__hint--warn", warn);
  }

  $("remember").addEventListener("change", (event) => {
    const on = event.target.checked;
    const result = setRemember(on);
    if (on && !result.remembered) {
      status(result.reason === "failed"
        ? "Couldn't save in this browser (its storage may be full). Your stack lasts while this tab is open."
        : "This browser isn't letting the site remember things.", true);
    } else {
      status(on
        ? "Remembered. Your presets will be here next time you open Threat Radar in this browser."
        : "No longer remembered. Removed from this browser's storage; gone when you close this tab.");
    }
    renderHint();
  });

  $("share-copy").addEventListener("click", async () => {
    const stack = vendors();
    if (!Object.keys(stack).length) return;
    const url = shareUrl(stack);
    $("share-field").hidden = true;
    try {
      await navigator.clipboard.writeText(url); // throws if the clipboard isn't available or allowed
      status("Link copied. It carries only this preset's ticks, and opening it offers to add them as a new preset.");
    } catch {
      $("share-url").value = url;
      $("share-field").hidden = false;
      $("share-url").focus();
      $("share-url").select();
      status("Couldn't copy automatically. Copy the link below.");
    }
  });

  const disarmForget = armable($("forget"), () => "Click again to forget everything", () => {
    forget();
    closeForm(false);
    query = "";
    $("picker-q").value = "";
    $("share-field").hidden = true;
    renderAll();
    status("Done. Threat Radar has nothing stored in this browser now.");
  });

  // ---------- Opening and closing ----------

  $("picker-q").addEventListener("input", debounce((event) => { query = event.target.value; renderList(); }, 120));

  function renderAll() {
    renderPresets();
    renderSelected();
    renderHint();
    renderList();
  }

  dialog.addEventListener("cancel", (event) => {
    if (formMode) { // Escape closes the name form first, not the whole picker
      event.preventDefault();
      closeForm();
    }
  });
  dialog.addEventListener("close", () => {
    closeForm(false);
    disarmDelete();
    disarmForget();
    status("");
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect(); // only a click outside the box, on the dimmed backdrop
    const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) dialog.close();
  });
  $("picker-done").addEventListener("click", () => dialog.close());

  return {
    /** Open the picker, optionally with a message in the status line. */
    open(message = "") {
      query = "";
      $("picker-q").value = "";
      $("share-field").hidden = true;
      renderAll();
      status(message);
      if (!dialog.open) dialog.showModal();
    },
    /** Redraw if open, e.g. after another tab changed the presets. */
    refresh() {
      if (!dialog.open) return;
      closeForm(false);
      renderAll();
      status("Updated with changes made in another tab.");
    },
  };
}

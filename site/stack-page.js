// stack-page.js: "My stack" on the Sitrep and Ransomware pages (spec 004 FR-11, FR-12).
//
// These pages only READ the active preset. Changing it happens in the picker on
// the Radar, which the "Edit" link opens via ../#mystack.

import { createStore } from "./stack-store.js";
import { activePreset } from "./presets.js";
import { describeStack } from "./stack-logic.js";
import { el } from "./ui.js";

/** The visitor's active preset: { name, vendors, has }. Empty if storage is blocked or nothing is ticked. */
export function readStack() {
  const { record } = createStore().load();
  const preset = activePreset(record);
  return { name: preset.name, vendors: preset.vendors, has: Object.keys(preset.vendors).length > 0 };
}

/** "Your stack: Work · Microsoft (2 products), Cisco · Edit", or a small prompt to tick one. */
export function renderStackLine(host, stack, editHref) {
  const edit = el("a", { text: stack.has ? "Edit" : "Tick your stack", attrs: { href: editHref } });
  host.replaceChildren(...(stack.has
    ? ["Your stack: ", el("strong", { text: stack.name }), ` · ${describeStack(stack.vendors)} · `, edit]
    : [edit, " on the Radar to highlight what affects the software you run."]));
  host.hidden = false;
}

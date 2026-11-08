# Verification report: My stack

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · [plan.md](./plan.md) (§8 lists changes made during the build) |
| **Verified** | 2026-11-08 · **All 13 acceptance criteria pass** |
| **Test suite** | 91 Python tests + 90 JavaScript tests, all passing. 39 of the JavaScript tests are new: 13 stack logic, 14 presets, 12 storage |
| **Browser** | [`browser-check.cjs`](./browser-check.cjs) runs 24 checks in headless Chromium (1280 px and 360 px, light and dark), all passing ([results](./browser-results.json)). Live check in the desktop browser pane on the deployed site |

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| **AC-1** All vendors with counts; vendors expand to products | ✅ Pass | Picker lists **291 vendors**, most-exploited first ("Microsoft 390"). Microsoft expands to **72 products** with counts ("Windows 173") ([screenshot](./evidence/picker-desktop.png)) |
| **AC-2** "vmware" finds Broadcom; a product finds its vendor | ✅ Pass | "vmware" → VMware, **Broadcom**, VMware Tanzu, with Broadcom opened on its 5 VMware products. "Exchange Server" → Microsoft. Unit test covers the same |
| **AC-3** Matching: vendor-all, product subsets, unknown names | ✅ Pass | `stack.test.mjs`: vendor-all, product subsets, unknown vendors and products, reserved names (`__proto__`, `constructor`) |
| **AC-4** Remember on/off, across tabs; unticking deletes at once | ✅ Pass | Default: `localStorage` empty, stack only in `sessionStorage`. From the first tick, the picker says "Not remembered: this is gone when you close the tab". **Ticked**, then tab closed and reopened: preset, stack and "My stack only" all back. **Unticked**: `localStorage` empty at once; a new tab starts empty. `stack-store.test.mjs` covers the same with fake storages |
| **AC-5** Presets: create, switch, rename, delete; rules | ✅ Pass | Save as "Work"; "work" refused ("There's already a preset called…"); blank refused; each preset restored its own stack **and** view on switch; renamed to "Customer A"; deleted with click-again; Delete disabled on the last preset. **Two open tabs** stay in step (a change in one shows up in the other), so neither overwrites the other |
| **AC-6** Forget everything leaves no keys | ✅ Pass | After Forget: `localStorage` `[]`, `sessionStorage` `[]`, "Threat Radar has nothing stored in this browser now." |
| **AC-7** Storage blocked: no errors, honest tickbox | ✅ Pass | Both storages throwing: page works in memory, 0 errors, tickbox disabled, "This browser is blocking storage, so remembering isn't available…" ([screenshot](./evidence/storage-blocked.png)). Storage full: Remember unticks itself with "Couldn't save in this browser…" |
| **AC-8** No stack data in requests or cookies | ✅ Pass | After ticking, remembering and reloading: 64 requests checked, **0** contain stack data, **0** cookies. Live: 16 requests, all to the site itself |
| **AC-9** Radar: filter, badges, summary, new since last visit, blips | ✅ Pass | "My stack only": 25 of 25 rows badged "Your stack", all in the stack; 3 ringed blips, others faded ([screenshot](./evidence/radar-my-stack-only.png)). With a remembered mark from 3 Nov: "**2** new since your last visit" (expected 2); still 2 after Radar → Sitrep → Radar; a new visit starts at 0 ([screenshot](./evidence/radar-new-since-last-visit.png)) |
| **AC-10** Sitrep and Ransomware highlights | ✅ Pass | Sitrep 6 Nov: Zyxel's CVE-2026-7273 chip tagged "Your stack", Apple's not; "Mentions Zyxel" and "Mentions Cisco" tags; stack line with Edit opens the picker ([screenshot](./evidence/sitrep-stack-tags.png)). Ransomware: "126 of them affect your stack", 8 newest listed and highlighted ([screenshot](./evidence/ransomware-stack.png)). Without a stack: only the "Tick your stack" prompt, 0 tags |
| **AC-11** Share link offers; never overwrites | ✅ Pass | Fresh browser: offer shown and focused; **nothing stored** before the click; Ignore clears the address. "Add as preset" creates "Shared stack" ([screenshot](./evidence/share-offer.png)). With an existing "Work" preset: Work untouched; the same link again says it matches "Shared stack" and adds "Shared stack 2" |
| **AC-12** Hostile data ignored safely | ✅ Pass | Preset named `<img src=x onerror=alert(1)>` shows as text, 0 `<img>` elements, 0 alerts. Share links (bad `%`, `__proto__`, 30,000 characters, an array, empty) show "couldn't be read", store nothing, 0 errors. Stored records (bad JSON, 500 presets, 301 vendors, extra field, wrong types) are dropped and the page starts fresh. Plus 14 unit tests |
| **AC-13** 360 px, keyboard, CSP, 0 external requests | ✅ Pass | `scrollWidth` 360 on Radar, picker, Sitrep and Ransomware ([picker](./evidence/mobile-360-picker.png), [strip](./evidence/mobile-360-strip.png)). Keyboard only: open, search, Tab to the tick, Space, save a preset, Escape closes the name form first and then the picker, with focus back on the button. CSP lines unchanged (`git diff`: 0); **733 requests, 0 external**; dark theme checked ([screenshot](./evidence/dark-theme-picker.png)) |

## Live check (8 Nov, after deploy run 42458848623 went green)

GitHub Pages now redirects to the owner's custom domain, **zelin.se**, so the live
check ran there in the desktop browser pane: all 291 vendors in the picker; "vmware"
finds Broadcom; ticking Fortinet gives the summary (32 in the catalog, 14 ransomware),
1 badge and 1 ringed blip; `sessionStorage` only, no cookies; the Sitrep and
Ransomware pages show the stack line, and Ransomware lists Fortinet's 14
ransomware-linked entries first; 0 console errors; every request to zelin.se itself.
The footer's "How this site works" link points to GitHub correctly from the custom
domain. The test stack was removed from the pane afterwards.

The live check also found one bug, now fixed and covered by the browser check: the
Remember hint only updated when the picker opened, so the "Not remembered" nudge
didn't appear on the first tick.

## Noted, not blocking

The custom domain is served over **http** for now: `https://zelin.se` doesn't load
yet, which fits a certificate GitHub hasn't issued. Until "Enforce HTTPS" is on,
browsers don't allow the clipboard on the page, so "Copy link to this preset" shows
the link in a box to copy by hand. That fallback was built for exactly this.

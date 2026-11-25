# Verification: Group info in Trends

| | |
|---|---|
| **Spec** | [spec.md](./spec.md) · [plan.md](./plan.md) · [tasks.md](./tasks.md) |
| **Date** | 2026-11-25 |
| **Result** | All acceptance criteria met |

| AC | How it was checked | Result |
|---|---|---|
| **AC-1** | `test_build_breach_stats.py` (6 new tests): newest non-empty profile wins; spellings merge; an empty profile falls back to an older one; a gang never profiled has no entry; names match Trends; same input, same bytes. Real data: 105 gangs profiled, 22 KB | ✅ |
| **AC-2** | Test: text planted in `countries`, `sectors` never reaches the file; each entry has exactly `name`, `profile`, `date`, `issue` | ✅ |
| **AC-3** | [`browser-check.cjs`](./browser-check.cjs): each top group with a profile has an (i) (10/10); hover shows the right profile and issue; Enter opens, Tab reaches "Open issue", Escape closes; "Open issue" lands on that day's issue | ✅ |
| **AC-4** | Profiles fetched only when Trends opens (0 → 1 request); 360 px dark: tap opens inside the screen, tap elsewhere closes; without the file Trends works with no (i); no console errors; CSP unchanged | ✅ |

Browser check: 8/8. Screenshots: [desktop](evidence/tip-desktop.png) · [phone, dark](evidence/tip-phone-dark.png)

## Changes during build

1. **The (i) became a shared component.** The "Overdue" (i) from spec 007 A1 moved from `today.js` to `ui.js` (`infoTip`, `enableInfoTips`) so both pages use one implementation. A click inside an open bubble (its link) no longer closes it. Spec 007's browser check still passes 15/15, including AC-11 (the Overdue (i)).
2. **Owner confirmed "most recent profile"** after seeing that for N0n it is a day-specific leftover sentence; "fullest of the last 30 days" and "skip fragments" were offered and declined.
3. Spec 010's browser check reads a gang's name from the name's own text, since the name cell now also holds the (i) (19/19).
4. **Fix after release (2026-11-25, owner: "it's not centered horizontally"):** on phones the bubble sat 13 px from the list's left edge and 5 px from its right. Up to 600 px wide it now spans the list with equal margins (13 px / 13 px at 320, 360, 390 and 600 px); on wider screens it stays anchored next to the gang's name. Browser check still 8/8; [phone screenshot](evidence/tip-phone-dark.png) updated.
5. **Second fix (2026-11-25, owner's screenshot):** the real issue was vertical: each (i) sat 4.5 px below the middle of the gang's name (a `vertical-align: -6px` nudge), and on a 360 px phone the (i) after a long name wrapped to its own line. The name and (i) are now laid out side by side and centred on each other (flexbox): offset 0.8 px (the font's own spacing) at 360 and 1280 px, no wrapping. Fix 4 (equal popup margins on phones) stays. Browser checks: 013 8/8, 010 19/19. [Screenshot](evidence/names-aligned.png)

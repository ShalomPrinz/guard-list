# Errors Log

A record of mistakes Claude Code made that required a follow-up migration to fix. Read this before starting any migration. If your planned implementation resembles any pattern described here, stop and reconsider.

---

## E001 — Date Format Regression (fixed in Migration 008.1)

**What happened:** Migration 007 introduced `formatDate()` returning DD/MM/YYYY and applied it to display sites. Despite this, dates rendered in MM/DD/YYYY format in Step2_Time and other screens because native `<input type="date">` elements display in the browser's locale format, which bypasses `formatDate()` entirely.

**Rule:** Never render a date to the user via a native `<input type="date">` value attribute or `.toLocaleDateString()`. Always render date text through `formatDate()` from `src/logic/formatting.ts` as a visible label. The input element is only for the picker interaction.

---

## E002 — Read-Only Mode Survived Multiple Migrations (fixed in Migration 008)

**What happened:** Migration 004 explicitly removed read-only mode from ResultScreen. It re-appeared in later navigation paths — specifically when opening a past schedule from HomeScreen history — because the history navigation code path set a `viewOnly` or `isReadOnly` flag that was never cleaned up.

**Rule:** There is no read-only mode anywhere in this app. ResultScreen is always editable. Never introduce an `isReadOnly`, `viewOnly`, `readOnly`, or equivalent boolean prop or state for ResultScreen. If you find yourself writing one, stop — it contradicts a core requirement.

---

## E003 — `window.scrollTo` Not Implemented in Test Environment (fixed in Migration 009.1)

**What happened:** Migration 004 added `window.scrollTo({ top: 0, behavior: 'instant' })` to all screen mounts. The jsdom test environment does not implement `window.scrollTo`, producing "Not implemented: window.scrollTo" errors across the entire CI log for every test file that mounts a screen.

**Rule:** `window.scrollTo` must be mocked globally in the test setup file (`src/test/setup.ts`):
```ts
window.scrollTo = vi.fn();
```
Never mock it per-file. Never remove this mock from the setup file.

---

## E004 — Unused Variable Broke Vercel Build (fixed in Migration 009.1)

**What happened:** A variable `user` was declared but never read in `tests/e2e/flowMigration008.test.tsx`. TypeScript (`tsc --noEmit`) flagged it as error TS6133. Because Vercel runs `npm run build` which includes type checking, the deployment failed with exit code 2.

**Rule:** Run `tsc --noEmit` across the full project including `tests/` before declaring any migration done. Prefix intentionally unused variables with `_`. The CI workflow now runs `tsc --noEmit` as a dedicated step before `vitest` — do not remove it.

---

## E005 — End Date Did Not Update Reactively (fixed in Migration 008.1)

**What happened:** Migration 007 added an auto-calculated end date field to Step2_Time that computed on mount only. Changing the start time or end time after mount did not update the end date. The calculation was not inside a `useEffect` with the correct dependencies.

**Rule:** Any derived value that depends on form fields must be computed inside a `useEffect` whose dependency array includes all relevant fields. For end date: depends on both start time and end time. For per-station duration preview: depends on start time, end time, participant count, and rounding mode.

---

## E006 — Quote/Author Lost on Back Navigation (fixed in Migration 008)

**What happened:** Step4_Review has quote and author input fields. These were not included in the wizard session context, so navigating Back from ResultScreen to Step4_Review rendered the fields empty even if the user had filled them in.

**Rule:** Every user-entered field in every wizard step must be part of wizard session state in context. Nothing that the user typed should be lost on Back navigation. When adding a new input field to any wizard step, always add the corresponding field to the wizard context type and persist it on every change.

---

## E007 — Headcount Station Type Partially Removed (fixed in Migration 007)

**What happened:** The headcount station type was removed from the UI in Migration 007 but remnants remained in `src/storage/types.ts` (`headcountRequired`, `headcountParticipants`) and in conditional branches in logic files checking `stationType === "headcount"`. These caused type inconsistencies and dead code paths.

**Rule:** When removing a feature, search the entire codebase for all references — types, logic, components, tests — and remove every one. Use `grep -r "headcount"` to verify zero occurrences remain before declaring the migration done.

---

## E008 — Drag Triggered by Scroll (fixed in Migration 011)

**What happened:** The default `@dnd-kit` sensor configuration activates drag immediately on touch, with no delay. On mobile, normal downward scrolling through a list triggered accidental participant reorders constantly.

**Rule:** All `@dnd-kit` sensor configurations in this app must use the 1000ms/5px activation constraint (see CONVENTIONS.md). Never instantiate a sensor without this constraint. This applies to every `useSensor` call in every component — Step3_Order, Step4_Review, and any future drag-and-drop surface.

---

## E009 — Continue Round Ignored Station Structure (fixed in Migration 012)

**What happened:** The "Continue Round" feature re-entered the wizard after Step1_Stations, skipping station configuration entirely. This meant station changes were not possible between rounds and the station structure was silently assumed to be identical to the previous round.

**Rule:** Continue Round always enters the wizard at Step1_Stations with pre-filled values from the previous round. The user must always be able to adjust station configuration before proceeding. Never skip Step1_Stations in any wizard entry path.

---

## E010 — Time Input Shown in Wrong Order on Desktop (fixed in Migration 008.2)

**What happened:** The custom desktop `TimePicker` component rendered MM to the left of HH — reversed from the expected HH:MM format. This was a rendering order bug in the two-spinner layout.

**Rule:** Time always displays and is entered as HH (left) : MM (right). When building or modifying `TimePicker`, verify the rendered order visually. HH input must have a lower DOM position / flex order than MM input.

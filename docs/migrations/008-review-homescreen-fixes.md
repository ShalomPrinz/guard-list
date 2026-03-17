## Migration 008 — Review Screen Fixes, HomeScreen Interactions, Text Corrections

**Type:** Bugfix / UX  
**Depends on:** Migration 007 complete

**Context:**

> Several UX issues exist across the review screen and HomeScreen:
>
> 1. Returning from ResultScreen to Step4_Review loses the quote and author fields — they are not restored from wizard state.
> 2. ResultScreen still has remnants of read-only mode that block editing in certain navigation paths, contradicting Migration 004's intent.
> 3. In HomeScreen, only the "עריכה" button is clickable on a group card — the rest of the card area is inert. Same issue on guard list history cards where only "צפייה" is clickable.
> 4. HomeScreen uses the term "תחנות" which is incorrect — the correct term throughout the app is "עמדה" / "עמדות".
> 5. The default name for a new guard list in Step4_Review is not set to "רשימת שמירה".

**Goal:** Restore quote/author on back-navigation, enforce no read-only mode, make group and history cards fully clickable, and fix text errors.

**Tell Claude Code:**

> **Quote/author persistence on back-navigation:** Ensure the quote text and author fields in Step4_Review are part of the wizard session state stored in context. When the user navigates Back from ResultScreen to Step4_Review, the quote and author values must be re-populated from context and visible in their input fields. This is a state restoration bug — do not change the quote data model, only ensure it is written to and read from wizard context at the correct points.
>
> **No read-only mode:** Audit ResultScreen and all navigation paths that lead to it. Remove any remaining `isReadOnly`, `viewOnly`, or equivalent flag that conditionally hides the Back button or disables editing. ResultScreen must always show the Back button and always allow returning to Step4_Review with full wizard state. This applies to schedules opened from past history on HomeScreen as well — opening a past schedule must also allow editing and re-saving it (overwriting the existing entry by id, not creating a duplicate).
>
> **Fully clickable group cards:** In HomeScreen, wrap each saved group card in a single clickable container that triggers the same navigation as the "עריכה" button. The entire card surface (excluding the "מחיקה" button) should be the click target. Apply a hover/active style to the whole card to signal interactivity. The "מחיקה" button must use `e.stopPropagation()` to prevent the card click from firing when delete is tapped.
>
> **Fully clickable history cards:** Apply the same pattern to guard list history cards. The entire card surface (excluding "מחיקה") navigates to the schedule view/edit screen. "מחיקה" uses `e.stopPropagation()`.
>
> **Default guard list name:** In Step4_Review, set the default value of the round name input to "רשימת שמירה" (no date appended) when the field is empty and no name has been set by the user yet. Do not overwrite a name the user has already typed.
>
> **Text fix:** Search the entire codebase for every occurrence of "תחנות" and replace with "עמדות". Search for "תחנה" and replace with "עמדה". This includes component text, placeholder strings, labels, and any Hebrew string in test files.
>
> Add E2E tests in `tests/e2e/` covering:
>
> - Navigating Back from ResultScreen to Step4_Review restores a previously entered quote and author
> - Opening a past schedule from HomeScreen history shows the Back button and allows re-saving
> - Clicking the body of a group card (not the button) navigates to GroupEditScreen
> - Clicking the body of a history card (not "מחיקה") navigates to the schedule screen
> - Clicking "מחיקה" on a card does not trigger the card navigation
>
> Run `vitest run --coverage` when done and confirm coverage is ≥90% for `src/logic/` and `src/storage/`.

**Deliverables:** Quote and author are restored correctly when navigating back to Step4_Review. No read-only mode exists anywhere. Full group and history cards are clickable. Default round name is "רשימת שמירה". No occurrence of "תחנות" or "תחנה" remains in the codebase. Tests pass with ≥90% coverage.

---

### Migration 008.1 — End Date Auto-Update & Date Format Fix

**Type:** Bugfix

**Context:**

> Two regressions exist in Step2_Time following Migrations 007 and 007.1. First, the end date field does not reactively update when the user changes the start time or end time — it only reflects the auto-calculated value at the moment the page mounts. Second, start and end dates are rendered in MM/DD/YYYY format despite the `formatDate` utility introduced in Migration 007 specifying DD/MM/YYYY. This is caused by native `<input type="date">` elements whose display format is browser-controlled, bypassing `formatDate` entirely.

**Goal:** End date recalculates on every time change. All date displays across the app use DD/MM/YYYY.

**Tell Claude Code:**

> **End date reactive update:** In Step2_Time, ensure the end date auto-calculation runs inside a `useEffect` that depends on both the start time and end time values. Every time either changes, re-run the midnight crossover detection logic from `src/logic/formatting.ts` and update the end date field — unless `userOverrodeEndDate` is true (as established in Migration 007.1). The effect must fire on every keystroke or picker change, not only on blur.
>
> **Date format fix:** Keep `<input type="date">` as the input mechanism — do not replace it. The fix is display-only: never render a date value directly from a native date input or via `.toLocaleDateString()`. Instead, wherever a date is shown as text to the user, always pass it through `formatDate` from `src/logic/formatting.ts` which returns DD/MM/YYYY. For date inputs specifically, show the formatted date as a readable label directly above or beside the input field so the user always sees DD/MM/YYYY, while the hidden input handles the native picker interaction. Apply this pattern everywhere a date appears: Step2_Time start and end date, ResultScreen, HomeScreen history cards, StatisticsScreen, and ParticipantHistoryScreen. Remove any direct use of `.toLocaleDateString()` or unformatted date strings from all display sites.
>
> Add unit tests covering:
>
> - End date updates correctly when start time changes from a non-midnight-crossing to a midnight-crossing range
> - End date does not update when `userOverrodeEndDate` is true and times change
> - `formatDate` output is always DD/MM/YYYY regardless of the input Date object's locale
>
> Run `vitest run --coverage` when done and confirm coverage is ≥90% for `src/logic/` and `src/storage/`.

**Deliverables:** End date in Step2_Time updates reactively on every start/end time change. No date anywhere in the app renders in MM/DD/YYYY. All displayed dates use DD/MM/YYYY via `formatDate`. Tests pass with ≥90% coverage.

---

### Migration 008.2 — Time Input UX & End Time vs. Fixed Duration Toggle

**Type:** Bugfix / UX

**Context:**

> Two issues exist in Step2_Time. First, the choice between "end time" and "fixed duration per participant" is presented ambiguously and becomes locked after the user makes a selection — switching between the two modes is not possible without resetting the form. Second, the desktop time picker implemented in Migration 001 renders the HH and MM spinners in an unintuitive order and the overall layout feels awkward compared to a standard time input.

**Goal:** Make the end-time vs. fixed-duration choice a clear, always-switchable toggle. Fix the desktop time picker to be simple, intuitive, and correctly ordered in HH:MM format.

**Tell Claude Code:**

> **End time vs. fixed duration toggle:** In Step2_Time, replace the current ambiguous layout with an explicit two-option toggle (e.g. a segmented control or two radio buttons) at the top of the time configuration section:
>
> - Option 1: "שעת סיום" — reveals the end time picker and the auto-calculated end date. Hides the fixed duration input.
> - Option 2: "זמן קבוע לכל לוחם" — reveals a single duration input (in minutes). Hides the end time picker and end date fields.
>
> The toggle must always be visible and switchable — selecting one option and then switching to the other must work at any point without resetting other fields (start time, start date). Store the selected mode in wizard session state so Back navigation restores it correctly. When switching modes, clear only the fields belonging to the mode being left (e.g. switching from "שעת סיום" to "זמן קבוע" clears the end time value but not the start time).
>
> **Desktop time picker fix:** The `TimePicker` component (`src/components/TimePicker.tsx`) renders on desktop as two separate HH and MM spinners. Fix the following:
>
> - Ensure HH renders to the left of MM with a ":" separator between them — not reversed
> - HH input: accepts 0–23, zero-padded to two digits on blur (e.g. "9" → "09")
> - MM input: accepts 0–59, zero-padded to two digits on blur (e.g. "5" → "05")
> - Clicking into HH or MM selects the full field content so the user can type directly without backspacing
> - Tab from HH moves focus to MM automatically
> - The overall component width is compact and consistent with the surrounding form layout — it should not stretch across the full width of the screen
> - Do not change the mobile path of `TimePicker` (native `<input type="time">`) — only fix the desktop branch
>
> Add unit tests covering:
>
> - Switching from "שעת סיום" to "זמן קבוע לכל לוחם" clears end time but preserves start time in wizard state
> - Switching back to "שעת סיום" does not restore the previously cleared end time (field starts empty)
> - `TimePicker` zero-pads HH and MM correctly on blur for single-digit inputs
>
> Run `vitest run --coverage` when done and confirm coverage is ≥90% for `src/logic/` and `src/storage/`.

**Deliverables:** Step2_Time shows a clear always-switchable toggle between end time and fixed duration modes. Desktop time picker renders HH to the left of MM, is compact, and supports direct keyboard input with zero-padding. Tests pass with ≥90% coverage.

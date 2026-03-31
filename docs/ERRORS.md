# Errors Log

Every mistake that happened in this project. Read before starting any given task. If your implementation resembles any pattern here, stop and reconsider.

---

## E001 — Date Format Regression

**What went wrong:** `formatDate()` returning DD/MM/YYYY was introduced, but dates still rendered in MM/DD/YYYY because native `<input type="date">` displays in the browser's locale format, bypassing `formatDate()` entirely. The fix applied `formatDate()` to display sites but left the input's value attribute as the date source in some places.

**Root cause:** Assuming that setting a date input's value controls its display format. It does not — the browser renders it in locale format regardless.

**Rule:** Never render a date to the user via a native input value or `.toLocaleDateString()`. Always render date text through `formatDate()` as a visible label. The `<input type="date">` is only for the picker interaction.

---

## E002 — Read-Only Mode Survived Multiple Sessions

**What went wrong:** Read-only mode was removed from ResultScreen long ago and must not return. It re-appeared in the history navigation path because that code path set a `viewOnly` flag that was never cleaned up. Required a second fix in a later session.

**Root cause:** Read-only mode was removed from one entry path but not all entry paths. The flag existed in multiple places.

**Rule:** There is no read-only mode anywhere in this app. Never introduce `isReadOnly`, `viewOnly`, `readOnly`, or any equivalent boolean for ResultScreen. If you find yourself writing one, stop.

---

## E003 — window.scrollTo Not Implemented in Tests

**What went wrong:** `window.scrollTo()` added to all screen mounts as an early core requirement. jsdom does not implement it, producing "Not implemented: window.scrollTo" noise across the entire CI log for every test that mounts a screen.

**Root cause:** jsdom missing implementation, no global mock in place.

**Rule:** Mock `window.scrollTo` globally in the test setup file:
```ts
window.scrollTo = vi.fn();
```
Never mock it per-file. Never remove this from the setup file.

---

## E004 — Unused Variable Broke Vercel Build

**What went wrong:** A variable `user` was declared but never read in `tests/flows/flowReviewHomeScreen.test.tsx`. TypeScript flagged it as TS6133. Vercel runs `npm run build` which includes type checking, causing deployment to fail with exit code 2.

**Root cause:** Tests were not type-checked before pushing. `tsc --noEmit` was not run across `tests/`.

**Rule:** Run `tsc --noEmit` across the full project including `tests/` before every prompt run is declared done. Prefix intentionally unused variables with `_`. CI workflow now runs `tsc --noEmit` as a dedicated step — never remove it.

---

## E005 — End Date Not Reactive

**What went wrong:** Auto-calculated end date in Step2_Time computed only on mount. Changing start or end time after mount did not update it. The calculation was not inside a `useEffect` with correct dependencies.

**Root cause:** Derived values computed once at mount instead of reactively.

**Rule:** Any value derived from form fields must live in a `useEffect` whose dependency array includes all relevant fields. For end date: depends on both start time and end time. For duration preview: depends on start time, end time, participant count, and rounding mode. Apply the `userOverrodeX` flag pattern to avoid overwriting user-entered values.

---

## E006 — Quote/Author Lost on Back Navigation

**What went wrong:** Quote and author fields in Step4_Review were not included in wizard session context. Navigating Back from ResultScreen then forward again rendered the fields empty.

**Root cause:** New input fields added to a wizard step without adding them to wizard context.

**Rule:** Every user-entered field in every wizard step must be part of wizard session state in context. When adding any new input to a wizard step, always add the corresponding field to the wizard context type and persist it on every change.

---

## E007 — Headcount Feature Partially Removed

**What went wrong:** Headcount station type was removed from the UI but `headcountRequired` and `headcountParticipants` remained in `src/types/index.ts` and conditional branches remained in logic files.

**Root cause:** Incomplete removal — UI was cleaned but types and logic were not.

**Rule:** When removing a feature, grep the entire codebase for every reference — types, logic, components, tests. Use `grep -r "headcount"` and verify zero occurrences before declaring done. Same rule applies to any future feature removal.

---

## E008 — Drag Triggered by Normal Scrolling

**What went wrong:** Default `@dnd-kit` sensor activates drag immediately on touch. Normal scrolling through Step3_Order triggered accidental reorders constantly on mobile.

**Root cause:** No activation delay on touch sensor.

**Rule:** All `@dnd-kit` sensor configs must use `{ delay: 300, tolerance: 5 }`. Never instantiate a sensor without this constraint. Apply to every `useSensor` call in the entire app.

---

## E009 — Continue Round Skipped Step1_Stations

**What went wrong:** "Continue Round" re-entered the wizard after Step1_Stations, skipping station configuration. Station changes were impossible between rounds.

**Root cause:** Continuation wizard entered at the wrong step.

**Rule:** Continue Round always enters at Step1_Stations with pre-filled values. Never skip Step1_Stations in any wizard entry path.

---

## E010 — Desktop TimePicker Rendered MM Before HH

**What went wrong:** The custom desktop TimePicker rendered MM to the left of HH — reversed from the expected HH:MM format.

**Root cause:** Rendering order bug in the two-spinner layout.

**Rule:** Time always displays as HH (left) : MM (right). When building or modifying TimePicker, verify rendered order visually. HH input must have lower DOM position or flex order than MM input.

---

## E011 — DragOverlay Invisible During Cross-Container Drag on Mobile

**What went wrong:** DragOverlay was mounted inside a station card with `overflow: hidden`, clipping it on mobile when dragged outside the card boundary. Desktop was unaffected because overflow clipping behaves differently.

**Root cause:** DragOverlay mounted inside a scrollable or overflow-clipped container.

**Rule:** DragOverlay is always mounted at the root layout level in `Layout.tsx`. Never inside any station card, list, scrollable container, or any element that could clip its children.

---

## E012 — Dragged Item Jumped on Activation

**What went wrong:** When drag activated after the 300ms hold, the dragged item visually jumped far from its original position before following the finger. Caused by stale droppable measurements.

**Root cause:** `@dnd-kit` measured droppable positions only on mount, not continuously. After page scroll, measurements were stale and the overlay rendered with incorrect offset.

**Rule:** All `DndContext` instances must include `measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}`. Never omit this prop.

---

## E013 — Scroll Stuck in Step3_Order

**What went wrong:** Normal downward page scrolling in Step3_Order got stuck because `touch-action: none` was applied too broadly — on list containers rather than only on drag handles — causing the browser to suppress scroll events during the 300ms hold window.

**Root cause:** `touch-none` applied to the wrong element.

**Rule:** `touch-action: none` (`touch-none`) applies exclusively to the `DragHandle` component. Never to list containers, station cards, or the page. The scrollable page container must have `touch-action: pan-y` to always allow vertical scroll.

---

## E014 — Multi-Station Recalculation Lost Previous Station State

**What went wrong:** RecalculateScreen held recalculation state only for the currently selected station. Switching stations discarded the previous station's custom end time. "שמירת השינויים" applied only the last station's configuration.

**Root cause:** Transient per-session state in a separate screen is fragile for multi-entity editing.

**Rule:** When multiple entities (stations) need independent editable state, that state belongs inline in the parent screen (Step4_Review), not in a separate screen's local state. End time editing now lives directly in Step4_Review as an editable field per station header.

---

## E015 — Continue Round Start Time Ignored User Input

**What went wrong:** In continue round mode, Step2_Time pre-fills start time from the previous round's end time. If the user manually changed it, Step4_Review still used the pre-filled value when generating participant times, ignoring the user's input.

**Root cause:** No override flag to distinguish user-entered values from programmatically pre-filled defaults.

**Rule:** Any field pre-filled programmatically must have a `userOverrodeX` boolean flag in wizard session state. Set to true when the user manually edits the field. Schedule generation always prefers the user's value when the flag is true. This is a project-wide convention — user input always wins over pre-filled defaults.

---

## E016 — Time Sorting Broke on Midnight-Crossing Schedules

**What went wrong:** UniteScreen sorted participants by HH:MM string. A participant starting at 23:00 on day 1 sorted after one starting at 00:20 on day 2 because "00" < "23" lexicographically.

**Root cause:** Sorting by time string without considering the date component.

**Rule:** Always sort by full datetime — combine `date` (YYYY-MM-DD) and `startTime` (HH:MM) into a comparable value before sorting. Never sort by time string alone anywhere in the app.

---

## E017 — Continue Round Auto-Shuffled Without User Action

**What went wrong:** Participants appeared in a different order in continued rounds without the user pressing the shuffle button. The ordering algorithm used randomization as a tiebreaker, producing non-deterministic results across runs.

**Root cause:** Randomization in a function that should be deterministic.

**Rule:** The continue round ordering algorithm must be fully deterministic. Use alphabetical by name as the tiebreaker — never `Math.random()` in any ordering function. Shuffling happens only when the user explicitly presses the shuffle button. Run the ordering function 10 times with the same input in tests and assert identical output every time.

---

## E018 — Duplicate Schedule Preview on ResultScreen / UniteScreen

**What went wrong:** When adding a WhatsApp `<pre>` preview block to `ResultScreen`, the existing per-station cards section (`{/* Schedule per station */}`) was left in place. This created two full schedule previews side by side — a structured card view and a plain-text WhatsApp preview — both showing the same data. The same mistake was later caught in `UniteScreen`.

**Root cause:** The prompt asked to add a preview without explicitly saying to remove the existing one. The existing station cards were not considered redundant by default.

**Rule:** Both `ResultScreen` and `UniteScreen` must show schedule data in exactly one place — the `<pre>` WhatsApp preview block (via `whatsappText`). Never add a second rendering of station/participant data alongside it. When adding a preview block, always check whether an existing equivalent display needs to be removed.

**Testing implication:** Because participant names and station names are embedded inside the `<pre>` text block (not as isolated DOM nodes), `getByText('Alice')` will fail (no exact match) and `getByText(/Alice/)` will find multiple ancestor elements. Always query `<pre>` content directly: `document.querySelector('pre')?.textContent`. For the schedule title (which appears in both `<h1>` and `<pre>`), use `getByRole('heading', { name: /.../ })` to target only the heading.

---

## E019 — navigate() Called During Render Silently Fails in Tests

**What went wrong:** Wizard step guards in `Step2_Time`, `Step3_Order`, and `Step4_Review` called `navigate('/fallback')` directly in the component render body (not inside a `useEffect`). React Router emits a warning about this and in the jsdom test environment the navigation does not flush — the component returns `null`, the route never changes, and `findByText` on the destination screen times out.

**Root cause:** `navigate()` is a side effect and must not be called during the render phase.

**Rule:** Any navigation triggered by a guard condition must go inside a `useEffect`. Pattern:
```tsx
useEffect(() => { if (!session) navigate('/fallback') }, [session, navigate])
if (!session) return null
```
The synchronous `return null` prevents rendering the guarded content; the `useEffect` handles the actual route transition after commit.

---

## E020 — Citation Share Request Always Showed "שגיאה בשליחה"

**What went wrong:** The old 1-to-1 share request flow silently failed in production due to three simultaneous bugs: single-origin check missed the stable Vercel alias URL; stale component state caused pre-check failures to surface as generic errors; `kvCrossSet` discarded HTTP status on failure.

**Root cause:** Silent error swallowing at multiple layers masked the real failure.

**Rule:** The origin check in `api/kv.ts` must use a `Set` covering `ALLOWED_ORIGIN`, `VERCEL_URL`, and `VERCEL_PROJECT_PRODUCTION_URL` — still applies to all KV actions. `kvCrossSet` must log `console.error('[kv] crossSet failed: HTTP', status, body)` before returning `'error'` — still applies. Sharing state is now loaded on-demand in `SharingCenterScreen` via `loadSharingCenterUpdates()` — do not add `storage` event listeners to sync share state; that approach was replaced.

---

## E021 — SharingCenterScreen Stuck on "טוען..." Forever

**What went wrong:** The mount `useEffect` used `void Promise.all([...]).then(...)`. If any promise in the array hung (slow network, KV timeout), `.then()` was never reached and `setLoading(false)` never fired. The screen remained stuck on "טוען..." indefinitely.

**Root cause:** `void` discards the returned promise entirely — errors and hangs are silently swallowed. Additionally, `kvListGuestCitations` was called eagerly on mount, and its slow KV response was the likely cause of the hang in production.

**Rule:** Never use `void promise.then(setState)` in a `useEffect` for loading state. Always use a named async function with `try/finally`:
```ts
useEffect(() => {
  async function load() {
    try {
      // ... await calls and setState
    } finally {
      setLoading(false) // always fires
    }
  }
  void load()
}, [])
```
This guarantees `setLoading(false)` fires even if a network call rejects or hangs (after component unmounts, React will ignore the state update).

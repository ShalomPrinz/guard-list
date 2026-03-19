## Migration 011 — Show All Warriors in Order Screen & Drag Hold Threshold

**Type:** Feature / Bugfix  
**Depends on:** Migration 010 complete

**Context:**

> Two issues exist in Step3_Order ("סדר שומרים"). First, members marked "בית" are completely absent from the screen — the user has no way to add them to a station if plans change mid-flow. Additionally, members who were excluded from station distribution for any other reason also silently disappear. The user has no visibility of the full group roster on this screen. Second, the drag-and-drop interaction triggers too easily during normal page scrolling, causing accidental reorders on mobile touch screens.

**Goal:** Show all group members on the order screen regardless of availability or assignment status. Require a deliberate hold gesture before a drag becomes active.

**Tell Claude Code:**

> **Show all warriors:** In Step3_Order, add a clearly separated section below the station lists titled "לא משובצים" (unassigned). This section contains two sub-groups displayed together:
>
> - Members marked "בית" — shown with a visual indicator (e.g. grayed out name + "בית" badge)
> - Members who are "בסיס" but were not distributed to any station (e.g. excluded during lottery)
>
> Any member in the "לא משובצים" section can be dragged into any station list to add them to that station. Once dropped into a station they are removed from "לא משובצים" and treated as a full participant in that station — their shift time is calculated and displayed in Step4_Review like any other participant. Dragging a member back out of a station and into "לא משובצים" removes them from that station and restores them to the unassigned section.
>
> Members in "לא משובצים" who are "בית" should have a visual distinction from unassigned "בסיס" members so the user understands why they are there. Do not hide or disable them — the user may deliberately add a "בית" member to a station from this screen if needed.
>
> If all members are assigned to stations and none are "בית", the "לא משובצים" section is hidden entirely.
>
> **Drag hold threshold:** In the `@dnd-kit` sensor configuration used across Step3_Order and Step4_Review, replace or augment the default pointer/touch sensor with one that requires the user to hold their finger on the drag handle for at least 1000ms before the drag activates. Use `@dnd-kit`'s `useSensor` with a custom activation constraint:
>
> ```ts
> useSensor(TouchSensor, {
>   activationConstraint: { delay: 1000, tolerance: 5 },
> });
> useSensor(PointerSensor, {
>   activationConstraint: { delay: 1000, tolerance: 5 },
> });
> ```
>
> The `tolerance: 5` (pixels) means the finger may move up to 5px during the hold without cancelling — this allows natural finger settling without triggering accidental drags. Normal scrolling (movement greater than 5px before 1000ms) cancels the drag intent and lets the scroll proceed as expected. Apply this sensor config to all drag-and-drop instances in the app — Step3_Order station lists, the "לא משובצים" section, and Step4_Review.
>
> Add E2E tests in `tests/e2e/` covering:
>
> - All "בית" members appear in the "לא משובצים" section on Step3_Order mount
> - Dragging a "בית" member into a station adds them to that station and removes them from "לא משובצים"
> - Dragging a member out of a station back to "לא משובצים" removes them from the station
> - "לא משובצים" section is not rendered when all members are assigned and none are "בית"
> - A member added from "לא משובצים" appears with correct calculated shift times in Step4_Review
>
> Run `vitest run --coverage` when done and confirm coverage is ≥90% for `src/logic/` and `src/storage/`.

**Deliverables:** All group members are visible in Step3_Order — assigned members in their station lists, unassigned and "בית" members in the "לא משובצים" section. Dragging any member from "לא משובצים" into a station works correctly and triggers recalculation. Drag activation requires a 1000ms hold with 5px tolerance on all drag-and-drop instances. Tests pass with ≥90% coverage.

---

### Migration 011.1 — Drag & Drop Text Selection & Position Jump Fix

**Type:** Bugfix  
**Depends on:** Migration 011 complete

**Context:**

> Two UX issues exist with drag and drop across the app following the 1000ms hold threshold introduced in Migration 011. First, holding a finger on a drag handle triggers the browser's native text selection behavior, selecting the handle icon as text and showing the system selection menu — this interferes with the drag activation. Second, once the 1000ms threshold is met and drag mode activates, the dragged item visually jumps far from its original position before following the finger — likely caused by a mismatch between the drag overlay's initial transform offset and the pointer's position relative to the element.

**Goal:** Prevent text selection on drag handles across the app. Keep the dragged item visually anchored to its original position when drag activates.

**Tell Claude Code:**

> **Prevent text selection on drag handles:** Apply `user-select: none` (and its vendor prefixes) to every drag handle element in the app. Do this via a Tailwind utility class — add `select-none` to the drag handle element's className in every component that renders one. Additionally apply `touch-action: none` via Tailwind's `touch-none` class to the same elements — this prevents the browser from intercepting the touch for scrolling or selection during the hold period. Do not apply these classes to the entire list item, only to the drag handle icon element itself so that text elsewhere in the row remains selectable normally.
>
> To make this consistent and impossible to forget in future components, add a shared `DragHandle` component (`src/components/DragHandle.tsx`) that renders the drag handle icon and always applies `select-none touch-none cursor-grab active:cursor-grabbing` by default. Replace all existing inline drag handle elements across Step3_Order, Step4_Review, and the "לא משובצים" section with this component. Any future drag surface must use `DragHandle` — never an ad-hoc icon with manual classes.
>
> **Fix position jump on drag activation:** The jump is caused by `@dnd-kit`'s default drag overlay picking up the element's position relative to the viewport at the moment of activation, without accounting for the scroll offset or the pointer's position within the element. Fix this by using `@dnd-kit`'s `DragOverlay` with a `dropAnimation={null}` and ensuring the overlay renders the item at its natural size. Additionally, pass `measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}` to the `DndContext` so element positions are measured continuously rather than only on mount — this prevents stale position data after the page has scrolled. If the jump persists, add a `modifiers={[restrictToWindowEdges]}` from `@dnd-kit/modifiers` to constrain the overlay to the viewport without repositioning it. The dragged item should appear to lift in place — not teleport.
>
> Apply both fixes to every `DndContext` instance in the app: Step3_Order station lists, the "לא משובצים" section, and Step4_Review.
>
> Add the following to `docs/CONVENTIONS.md` under the Drag & Drop section:
>
> - Drag handles always use the shared `DragHandle` component — never an inline icon
> - `DragHandle` always carries `select-none touch-none cursor-grab active:cursor-grabbing`
> - All `DndContext` instances use `measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}`
>
> Add E2E tests in `tests/e2e/dragdrop.test.tsx` covering:
>
> - The drag handle element has `user-select: none` and `touch-action: none` styles applied
> - Dragging a participant within a station list renders the drag overlay at the correct initial position (no jump)
>
> Run `vitest run --coverage` when done and confirm coverage is ≥90% for `src/logic/` and `src/storage/`.

**Deliverables:** Holding a finger on any drag handle never triggers text selection or the system selection menu. Dragged items stay visually in place when drag activates — no position jump. All drag handles across the app use the shared `DragHandle` component. `CONVENTIONS.md` updated with the new drag handle rules. Tests pass with ≥90% coverage.

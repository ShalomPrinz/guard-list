## Migration 012 — Drag Handle Hit Area, Free Dragging, Empty Station Persistence, Recalculate Times

**Type:** Feature / Bugfix  
**Depends on:** Migration 011.1 complete

**Context:**

> Three remaining drag and drop issues exist after Migration 011.1. The drag handle's tappable area is too small for reliable finger targeting on mobile. Dragging is constrained within the bounds of the station card, preventing cross-station moves that require dragging across a large vertical distance. Dragging the last warrior out of "לא משובצים" removes the section entirely, making it impossible to drag warriors back into it. Additionally, Step4_Review has no way to recalculate shift times after a warrior is removed — the remaining warriors keep their original times leaving a gap, with no option to redistribute the freed time.

**Goal:** Expand drag handle hit area. Allow free-range dragging across the full page. Keep "לא משובצים" visible when empty. Add a dedicated recalculate times flow in Step4_Review.

**Tell Claude Code:**

> **Expand drag handle hit area:** In the `DragHandle` component (`src/components/DragHandle.tsx`), increase the tappable area without increasing the visual icon size. Apply `p-3` padding to the component's root element so the touch target is at least 44x44px while the icon itself remains its current size. This padding must be part of the `DragHandle` component definition so it applies everywhere automatically — do not adjust it per usage site.
>
> **Free-range dragging across the full page:** Remove any `restrictToWindowEdges` or `restrictToParentElement` modifiers from all `DndContext` instances. Dragged items must be allowed to travel freely across the entire page viewport during a drag — including across station card boundaries and over the "לא משובצים" section. Ensure the `DragOverlay` is mounted at the root layout level (outside any scrollable container) so it is never clipped by a parent's `overflow: hidden`. If it is currently mounted inside a station card or a scrollable div, move it to `Layout.tsx` or the nearest full-page ancestor.
>
> **Persist empty "לא משובצים" section:** In Step3_Order, the "לא משובצים" section must always remain rendered as long as the wizard is on Step3_Order — even when it contains zero items. When empty, show the section header ("לא משובצים") and an empty drop zone with a dashed border and a short Hebrew placeholder text such as "גרור לוחם לכאן להוצאה מהרשימה". The drop zone must remain a valid `@dnd-kit` droppable target at all times regardless of whether it has children. Never conditionally unmount this section based on item count.
>
> **Recalculate times flow:** In Step4_Review, add a button titled "חישוב זמנים מחדש" positioned at the left edge of the "סקירה ועריכה" title row (title on right, button on left). This button is always visible — not only after a removal.
>
> Clicking it navigates to a new `RecalculateScreen` (`src/screens/RecalculateScreen.tsx`). This screen:
>
> - Shows a station selector at the top if multiple stations exist, so the user chooses which station to recalculate. If only one station exists, skip the selector.
> - Shows the current end time of the selected station (last warrior's end time) as a read-only reference labeled "שעת סיום נוכחית"
> - Offers two recalculation modes via a clearly labeled toggle:
>   - **"הארכה לשעת סיום מקורית"** — redistributes time so all warriors in the station finish at the station's original planned end time (the end time from Step2_Time). Shows the rounding selector (same three options as Step2_Time, same default of 10 min up) so the user can choose how to round the new per-warrior duration.
>   - **"שעת סיום מותאמת אישית"** — reveals a time input for a custom end time. Redistributes time so all warriors finish at this custom end time. Also shows the rounding selector.
> - Shows a live preview of the recalculated schedule for the selected station — updated reactively as the user changes mode, rounding, or custom end time. Preview format: `HH:MM  Name` rows, same as Step4_Review.
> - Two buttons at the bottom:
>   - **"ביטול"** — navigates back to Step4_Review with no changes
>   - **"שמירת השינויים"** — applies the recalculated times to the selected station in wizard session state, then navigates back to Step4_Review where the updated times are immediately visible
>
> Implement the recalculation as a pure function `recalculateStation(participants, endTime, roundingMode): ScheduledParticipant[]` in `src/logic/scheduling.ts`. It must reuse the existing rounding logic already in that file — no duplicated math.
>
> Add the following to `docs/CONVENTIONS.md` under Drag & Drop:
>
> - `DragOverlay` is always mounted at the root layout level (`Layout.tsx`) — never inside a scrollable container or station card
> - "לא משובצים" section is never conditionally unmounted — always rendered with an empty drop zone when item count is zero
>
> Add E2E tests in `tests/e2e/dragdrop.test.tsx` covering:
>
> - "לא משובצים" section remains rendered and is a valid drop target after its last item is dragged out
> - Dragging a warrior from a station into the empty "לא משובצים" drop zone moves them there correctly
>
> Add E2E tests in `tests/e2e/recalculate.test.tsx` covering:
>
> - RecalculateScreen shows the correct current end time for the selected station
> - "הארכה לשעת סיום מקורית" mode produces correct redistributed times with each rounding option
> - "שעת סיום מותאמת אישית" mode produces correct times for a given custom end time
> - "שמירת השינויים" updates the station times in Step4_Review correctly
> - "ביטול" returns to Step4_Review with no changes applied
> - `recalculateStation` pure function handles edge cases: single warrior, zero warriors, custom end time earlier than start time (show error, block save)
>
> Run `vitest run --coverage` when done and confirm coverage is ≥90% for `src/logic/` and `src/storage/`.

**Deliverables:** Drag handle has a 44px minimum touch target. Dragged items move freely across the full page with no clipping. "לא משובצים" persists as a visible empty drop zone when all items are moved out. RecalculateScreen allows redistributing times for any station with two end-time modes and a rounding selector, with a live preview and save/cancel. `CONVENTIONS.md` updated. Tests pass with ≥90% coverage.

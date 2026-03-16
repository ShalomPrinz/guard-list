## Migration 004 — Scroll to Top, Post-Create Editing, Swap Recalculation

**Type:** Bugfix  
**Depends on:** Migration 003 complete

**Context:**
> Three independent UX and logic issues exist in the current wizard and result flow:
>
> 1. Navigating to a new wizard step via "Next" does not scroll to the top of the page, so the user lands mid-screen and misses the step title.
> 2. After "Create Schedule" the Back button disappears and ResultScreen enters a read-only mode. The user has no way to return to the wizard to fix mistakes without starting over.
> 3. In Step4_Review ("סקירה ועריכה"), moving a participant between stations does not trigger recalculation of shift times. Start times are either stale or not re-rendered, leaving the schedule in an inconsistent state.

**Goal:** Scroll to top on every step transition. Keep the wizard fully editable after creation. Recalculate all shift times when participants are moved between stations in Step4_Review.

**Tell Claude Code:**
> **Scroll to top:** Add a `useEffect` that calls `window.scrollTo({ top: 0, behavior: 'instant' })` on every wizard step mount. This must cover Step1_Stations, Step2_Time, Step3_Order, Step4_Review, and ResultScreen. Do not use smooth scroll — instant is required so the title is visible immediately after the tap.
>
> **Post-create editing:** Remove read-only mode from ResultScreen entirely. The Back button must always be visible and functional on ResultScreen regardless of how the user arrived (fresh creation or returning from history). Pressing Back from ResultScreen returns to Step4_Review with the full wizard state intact — station config, time config, participant order, and any inline renames. Re-clicking "Create Schedule" from Step4_Review overwrites the existing Schedule entry in localStorage (matched by id) rather than creating a duplicate. Past Schedules history on HomeScreen must reflect the updated schedule after re-saving.
>
> **Station swap recalculation in Step4_Review:** When a participant is moved between stations (via drag or manual reassignment), immediately recalculate the full schedule for both affected stations using the same rounding algorithm and uneven-distribution strategy (Option A or Option B) that was selected in Step2_Time. Update all start times and end times for every participant in both stations and re-render the schedule table. The recalculation must use the logic in `src/logic/scheduling.ts` — do not inline duplicate math in the component. If moving the participant causes one station to have zero participants, show an inline error and block the move.
>
> Add E2E tests in `tests/e2e/` covering:
> - After "Create Schedule", Back is visible on ResultScreen and returns to Step4_Review with state intact
> - Re-saving after editing via Back overwrites the correct Schedule in localStorage (no duplicate created)
> - Moving a participant between stations in Step4_Review produces correct recalculated start times for all participants in both stations, for both Option A and Option B strategies

**Deliverables:** Every wizard step and ResultScreen mount at the top of the page. Back is always present on ResultScreen and restores full wizard state. Moving participants between stations in Step4_Review immediately recalculates and displays correct times for all affected participants. Tests pass with ≥90% coverage.
## Migration 013 — Continue Round Order Logic & Unite Lists Feature

**Type:** Feature  
**Depends on:** Migration 011 complete

**Context:**

> The "Continue Round" feature currently skips the stations setup step and uses a fixed participant order. Two improvements are needed: the continuation should start from Step1_Stations (to allow station reconfiguration), use a smart participant ordering algorithm based on the previous round, and attempt to rotate stations so warriors don't repeat the same position. Additionally, when a continued round exists, the user should be able to merge it with its parent into a single unified list for sharing — without persisting the merged result.

**Goal:** Continue Round starts from Step1_Stations with smart ordering and station rotation. A "Unite Lists" button merges a continued round with its parent into a single shareable view.

**Tell Claude Code:**

> **Continue Round starts from Step1_Stations:** When the user clicks "המשך סבב" from ResultScreen, enter the wizard at Step1_Stations instead of the current entry point. Pre-fill all station configs from the previous round so the user can adjust them or proceed immediately. Carry forward the `parentScheduleId` reference and the previous round's participant data into wizard session state for use in the ordering algorithm below.
>
> **Smart participant ordering for continuation:** In Step3_Order, when the wizard is in continuation mode, auto-populate station lists using the following algorithm implemented as a pure function in `src/logic/continueRound.ts`:
>
> 1. Collect all warriors from the previous round across all stations, sorted by their start time ascending. Break ties randomly.
> 2. Prepend any warriors from the saved group who are marked "בסיס" and did not appear in the previous round at all — these go first.
> 3. The resulting ordered list represents the queue for the new round: assign warriors to stations sequentially from the top of the queue, filling each station one slot at a time in round-robin fashion across stations.
> 4. Station rotation: where possible, assign a warrior to a different station than the one they were in during the previous round. Specifically, after building the initial sequential assignment, check each warrior's assigned station against their previous station. If swapping two warriors between stations resolves a repeat without creating a new repeat elsewhere, perform the swap. Apply this as a best-effort pass — do not guarantee zero repeats if the station count or warrior count makes it impossible.
> 5. Warriors marked "בית" are excluded from auto-assignment but appear in "לא משובצים" as per Migration 011.
>
> The user may still manually reorder or move warriors between stations in Step3_Order after the auto-population runs.
>
> **Unite Lists button:** On ResultScreen, when the current schedule has a `parentScheduleId` (i.e. it is a continued round), show a button labeled "איחוד רשימות". This button must also be visible when viewing a continued round from HomeScreen history.
>
> Clicking "איחוד רשימות" navigates to a new read-only `UniteScreen (`src/screens/UniteScreen.tsx`)`. This screen:
>
> - Fetches the parent schedule and the current (child) schedule from localStorage by id
> - Merges them per station: for each station name, concatenate the parent's participant list followed by the child's participant list, sorted by start time ascending
> - If a station name exists in one round but not the other, include it as-is
> - Uses the parent schedule's round name as the title of the unified list
> - Uses the parent schedule's quote and author (ignores the child's quote entirely)
> - Displays the unified list in the same visual format as ResultScreen — station name, then `HH:MM  Name` rows — but with no edit controls, no Back-to-wizard button, and no "המשך סבב" button
> - Shows only two action buttons: "העתק לווטסאפ" and "שלח בווטסאפ", using the standard WhatsApp text format from `docs/business-logic.md` §8
> - Does not save the unified schedule to localStorage under any key
> - Back button returns to the ResultScreen of the child schedule
>
> Add pure function `uniteSchedules(parent: Schedule, child: Schedule): UnifiedSchedule` in `src/logic/continueRound.ts`. `UnifiedSchedule` is a local type (not persisted) containing the merged station lists, parent's name, and parent's quote.
>
> Add E2E tests in `tests/e2e/continueRoundOrder.test.tsx` covering:
>
> - The ordering algorithm places warriors absent from the previous round first
> - Warriors are sorted by previous start time after the new-warrior prepend
> - Station rotation swaps warriors when a non-repeat assignment is possible
> - Warriors marked "בית" are absent from station lists and present in "לא משובצים"
>
> Add E2E tests in `tests/e2e/uniteLists.test.tsx` covering:
>
> - "איחוד רשימות" button appears on ResultScreen only when `parentScheduleId` is set
> - UniteScreen merges stations correctly — parent entries precede child entries, sorted by start time
> - UniteScreen uses the parent's round name and quote, not the child's
> - The unified list is not written to localStorage after visiting UniteScreen
> - WhatsApp text output from UniteScreen matches the expected merged format
> - Back from UniteScreen returns to the child's ResultScreen
>
> Run `vitest run --coverage` when done and confirm coverage is ≥90% for `src/logic/` and `src/storage/`.

**Deliverables:** Continue Round enters at Step1_Stations with pre-filled config. Participant order follows the defined algorithm with best-effort station rotation. "איחוד רשימות" button appears on continued-round ResultScreen and history view. UniteScreen displays the correctly merged list using parent metadata, allows WhatsApp sharing, and saves nothing to localStorage. Tests pass with ≥90% coverage.

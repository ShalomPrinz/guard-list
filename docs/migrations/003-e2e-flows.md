## Migration 003 — Expanded E2E Test Coverage

**Type:** Tests  
**Depends on:** Migration 002 complete

**Context:**
> `tests/e2e/` currently contains one file (`groupManagement.test.tsx`) covering only granular group CRUD operations. There are no tests covering the wizard steps or any complete end-to-end flow. All new test files live flat inside `tests/e2e/` alongside the existing file — no subfolders.

**Goal:** Add E2E tests covering all major wizard steps and complete app flows.

**Tell Claude Code:**
> Add the following test files to `tests/e2e/`. All files use the shared `localStorageMock` utility from Step 3. Each test starts with a clean localStorage state.
>
> ---
>
> **`wizardStations.test.tsx`** — Step 1 of the wizard:
> - Selecting number of stations renders the correct number of station config rows
> - Station names are pre-filled from last `stations_config` in localStorage when present
> - Switching a station type to Headcount shows the participant count input; switching back hides it
> - Clicking Next without a station name blocks progression and shows an error
> - Station config is persisted to localStorage on Next
>
> **`wizardTime.test.tsx`** — Step 2 of the wizard:
> - Entering start + end time computes and displays the correct raw duration per station
> - Each of the three rounding algorithms produces the correct rounded duration (test all three)
> - Providing end time earlier than start time is treated as midnight crossover and computes correctly
> - Setting duration to 0 or leaving it empty blocks Next and shows an error
> - Uneven participant distribution shows the Option A / Option B radio; selecting each updates the duration preview correctly
>
> **`wizardOrder.test.tsx`** — Step 3 of the wizard:
> - Only members marked "Base" appear in the station lists; "Home" members are absent
> - Shuffle button changes participant order while keeping locked participants in place
> - Marking a participant as skipped removes them from the schedule without removing them from the list
> - With two stations, dragging a participant across stations moves them to the correct station
>
> **`wizardReview.test.tsx`** — Step 4 of the wizard:
> - Computed start times are correct and sequential for all participants in a station
> - Editing one participant's duration recalculates all subsequent start times in that station only
> - Renaming a participant inline does not update the saved group in localStorage
> - Clicking "Create Schedule" saves a valid `Schedule` object to localStorage and navigates to ResultScreen
> - Statistics in localStorage are updated correctly after "Create Schedule" (shifts and minutes per name)
>
> **`flowCreateSchedule.test.tsx`** — Full creation flow, single station:
> - Start from HomeScreen with a pre-seeded group of 4 Base members
> - Progress through all four wizard steps with valid inputs
> - Assert the final Schedule in localStorage has correct participant count, start times, and durations
> - Assert ResultScreen renders each participant with the correct start time
>
> **`flowCreateScheduleMultiStation.test.tsx`** — Full creation flow, two stations:
> - Start from HomeScreen with a pre-seeded group of 6 Base members (3 per station)
> - Complete the wizard with two time-based stations and Option A (equal duration)
> - Assert each station in the saved Schedule has 3 participants with non-overlapping sequential times
> - Repeat with Option B (equal end time) and assert station durations differ but end times match
>
> **`flowContinueRound.test.tsx`** — Continue Round flow:
> - Pre-seed localStorage with a completed Schedule (two stations, 3 participants each)
> - Navigate to ResultScreen for that schedule and click "Continue Round"
> - Verify the continuation wizard pre-fills the same station structure and participant roster
> - Toggle one participant to unavailable; assert they are absent from the continuation schedule
> - Move one participant between stations; assert they appear in the correct station in the saved continuation Schedule
> - Complete the flow and assert the continuation Schedule has `parentScheduleId` pointing to the original
> - Assert the continuation's start times equal the original's actual end times
>
> **`flowStatistics.test.tsx`** — Statistics accumulation across multiple schedules:
> - Create two schedules sequentially for the same group, with overlapping participant names
> - Navigate to StatisticsScreen and assert each participant's total shifts and total minutes are the sum across both schedules
> - Headcount station participants must not appear in the statistics table
> - Click "Reset All Statistics", confirm the dialog, and assert the statistics key in localStorage is cleared
>
> **`flowBackNavigation.test.tsx`** — Back navigation integrity:
> - In the standard creation flow, verify Back from each step restores the previous step's form state exactly (no data loss)
> - In the continuation flow, verify Back from ResultScreen lands on Step4_Review with wizard state intact (regression guard for Migration 002)
>
> ---
>
> Run `vitest run --coverage` when done. Coverage must be ≥90% for `src/logic/` and `src/storage/`. Fix any logic gaps uncovered by the new tests before marking this migration complete.

**Deliverables:** 9 new test files in `tests/e2e/`, all passing. No regressions in existing tests. Coverage ≥90% maintained.
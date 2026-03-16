## Migration 007 — Stations Page Cleanup, Date/Time Formats, Date Field Relocation

**Type:** Feature / Refactor  
**Depends on:** Migration 006 complete

**Context:**

> Step1_Stations currently shows a 1–6 numeric selector for station count and a per-station type toggle between "מבוסס-זמן" and "כוח אדם". Step2_Time does not have a date field — it lives in Step1_Stations. Time and date values across the app are displayed inconsistently. The "כוח אדם" station type was scoped out of the app but its UI and logic were never removed.

**Goal:** Clean up the stations page, remove headcount logic entirely, standardize all date/time display formats, and move the date field to Step2_Time.

**Tell Claude Code:**

> **Station count selector:** Replace the current 1–6 radio/select in Step1_Stations with five boxes displayed in a row: "1", "2", "3", "4", and "אחר..". Selecting "אחר.." reveals a numeric input field where the user can type any number in the range 4-10. Selecting any of the fixed boxes hides that input. The selected count must still be persisted to localStorage as before.
>
> **Remove headcount station type:** Remove the "כוח אדם" type toggle from every station row in Step1_Stations. Remove all headcount-related UI, props, and conditional rendering. Remove all headcount logic from `src/logic/`, `src/storage/`, and `src/context/` — including the `headcountRequired` field from `StationConfig`, the `headcountParticipants` field from `ScheduleStation`, and any type guards or branches that check `stationType === "headcount"`. All stations are now time-based by definition. Update the `StationConfig` and `ScheduleStation` interfaces in `src/storage/types.ts` accordingly. Ensure no test references headcount logic — update or remove those test cases.
>
> **Date/time display format:** Standardize all time rendering across the entire app to `HH:MM` using 24-hour format where HH ranges 00–23. Standardize all date rendering to `DD/MM/YYYY`. Create two small utility functions in `src/logic/formatting.ts`: `formatTime(date: Date | string): string` and `formatDate(date: Date | string): string`. Replace every inline time and date display string in all components and screens with calls to these utilities. Add unit tests for both functions in `src/logic/formatting.test.ts`.
>
> **Move date field to Step2_Time:** Remove the date input from Step1_Stations. Add it to Step2_Time as "תאריך התחלה" — make it clear this is the start date of the guard list. Below it, show a read-only "תאריך סיום" field that is auto-calculated: same day as start date unless the time range crosses midnight, in which case it is start date + 1 day. The end date must update reactively when start time or end time changes. Persist the start date as part of the wizard session state.
>
> Add unit tests in `src/logic/formatting.test.ts` for midnight crossover date detection: same-day and next-day cases.
>
> Run `vitest run --coverage` when done and confirm coverage is ≥90% for `src/logic/` and `src/storage/`.

**Deliverables:** Station count shows 1–4 plus "אחר.." with custom input. No trace of headcount type anywhere in UI, logic, or types. All times render as HH:MM and dates as DD/MM/YYYY throughout the app. Date field lives in Step2_Time with auto-detected end date. Tests pass with ≥90% coverage.

---

### Migration 007.1 — Station Count Hard Limits & Editable End Date

**Type:** Bugfix

**Context:**

> Migration 007 added a custom number input for station counts above 4 ("אחר..") and an auto-calculated read-only end date field in Step2_Time. Two follow-up issues exist: the custom station count input has no enforced bounds, allowing nonsensical values. The end date field is read-only but the user may need to override it — for example when the auto-detection is wrong or the guard list intentionally spans a non-standard range.

**Goal:** Clamp the custom station count input to 1–10. Make the end date field editable.

**Tell Claude Code:**

> **Station count clamping:** On the custom station count input ("אחר..") in Step1_Stations, enforce a hard limit of 1–10. Apply the clamp on both the `onChange` event and the `onBlur` event: if the entered value is greater than 10, set the input value to 10; if it is less than 1 or empty, set it to 1. The clamping must be visible in the input box itself — the displayed number must update to the clamped value, not just be silently ignored downstream. Do not use `min`/`max` HTML attributes alone as they are bypassable — enforce the clamp explicitly in the handler.
>
> **Editable end date:** In Step2_Time, change the "תאריך סיום" field from read-only to an editable date input. Its default value remains auto-calculated as defined in Migration 007 (same day as start date, or start date + 1 if midnight is crossed). The user may override it freely. If the user edits the start date or the start/end times after having manually set the end date, recalculate the auto-detected end date and replace the field value only if the user has not manually changed it — track this with a `userOverrodeEndDate` boolean in wizard session state. If the user has overridden it, leave their value untouched on subsequent time changes.
>
> Add unit tests covering:
>
> - Clamping: values of 0, -1, 11, 100, and empty string all resolve to the correct clamped value (1 or 10)
> - End date auto-detection is not overwritten when `userOverrodeEndDate` is true
> - End date auto-detection is updated when `userOverrodeEndDate` is false and times change
>
> Run `vitest run --coverage` when done and confirm coverage is ≥90% for `src/logic/` and `src/storage/`.

**Deliverables:** Custom station count input always displays a value between 1 and 10 inclusive. End date in Step2_Time is editable, defaults to auto-detected value, and respects manual overrides. Tests pass with ≥90% coverage.

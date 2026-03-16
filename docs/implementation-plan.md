# Implementation Plan

Each step is a self-contained Claude Code prompt. Complete them in order — each step builds on the previous.

---

## Step 1 — Project Scaffold & Data Layer

**Goal:** Establish the project structure, routing skeleton, and all persistence logic before any UI.

**Tell Claude Code:**
> Set up a React + TypeScript app (Vite). Use Tailwind CSS and support dark mode via `class` strategy. Install `react-router-dom` for routing.
>
> Create the full localStorage persistence layer based on `docs/data-model.md`. Implement typed read/write helpers for: `groups`, `stations_config`, `schedules`, and `statistics`. Include all TypeScript interfaces from the data model.
>
> Set up React Router with placeholder pages for all screens listed in `docs/screens.md`: HomeScreen, GroupEditScreen, Step1–Step4, ResultScreen, StatisticsScreen, ParticipantHistoryScreen. Each page just renders its name for now.
>
> Add a global state context (or Zustand store) that holds the current wizard session state (active group, station configs, draft schedule) and resets on new schedule creation.

**Deliverables:** Working app shell with routing, typed data layer, no business logic yet.

---

## Step 2 — Group Management & Home Screen

**Goal:** Users can create, edit, and delete saved groups from the Home Screen.

**Tell Claude Code:**
> Implement the HomeScreen per `docs/screens.md`. Show three sections: primary "New Schedule" button, "Statistics" button, Saved Groups list, and Past Schedules list (last two can be empty placeholders for now).
>
> Implement GroupEditScreen: add/remove/rename members, toggle each member's availability between "Base" and "Home". Save to localStorage on every change (autosave).
>
> Implement the group creation flow reachable from HomeScreen. Support textarea input (comma or newline separated), CSV import via file input, and automatic deduplication.
>
> Wire up Edit and Delete (with confirmation dialog) buttons on each group card.

**Deliverables:** Full group CRUD, member availability toggle, autosave.

---

## Step 3 — Tests & Hebrew UI Migration

**Goal:** Implement all tests per `docs/TESTING.md` against the existing code, and migrate all visible UI strings to Hebrew.

**Tell Claude Code:**
> Read `docs/TESTING.md` in full before starting. Implement everything it specifies for the current codebase (Steps 1–2 are complete).
>
> **Unit tests** — create test files in `src/logic/*.test.ts` and `src/storage/*.test.ts`. At this stage, cover the storage helpers: verify typed read/write round-trips correctly, deduplication of member names, and that an empty localStorage returns the correct defaults. Add a `localStorageMock` utility (in-memory Map implementing the Storage interface) to be reused across all future tests.
>
> **E2E tests** — create `/tests/e2e/groupManagement.test.tsx`. Mount HomeScreen and GroupEditScreen with a clean `localStorageMock`. Test: create a group, add members, toggle availability between Base/Home, rename a member, delete a member, delete the group. Assert localStorage state after each operation.
>
> **Hebrew UI** — go through every rendered string in the existing components (HomeScreen, GroupEditScreen, all buttons, labels, placeholders, confirmation dialogs, error messages) and replace with Hebrew. Hardcode Hebrew directly in the component. Do not introduce any i18n library or translation file. The app must be fully in Hebrew from this point forward; all future steps must also use Hebrew strings only. English remains the language of code, comments, variable names, and all `.md` files.
>
> Examples of required Hebrew strings (use these exactly):
> - קבוצות שמורות (Saved Groups)
> - צור לוח שמירה (New Schedule)
> - סטטיסטיקות (Statistics)
> - עריכה / מחיקה (Edit / Delete)
> - בסיס / בית (Base / Home availability toggle)
> - האם אתה בטוח? (confirmation dialog)
> - שמור / ביטול (Save / Cancel)

**Deliverables:** Full test suite passing for Steps 1–2 scope. All existing UI is in Hebrew. `localStorageMock` utility ready for reuse in all future test steps.

---

## Step 4 — Schedule Wizard: Stations & Time (Steps 1 & 2)

**Goal:** Implement the first two wizard steps with all scheduling math.

**Tell Claude Code:**
> Implement Step1_Stations per `docs/screens.md`. Allow selecting number of stations (1–6). For each station: name input (pre-filled from last `stations_config` in localStorage), type toggle (Time-based / Headcount). If Headcount, show a number input for required participant count. Persist station config to localStorage on Next.
>
> Implement Step2_Time per `docs/screens.md`. Inputs: start time, optional end time, optional fixed duration. Rounding selector (3 options, default = round up to 10 min, labeled "recommended"). If uneven distribution across time-based stations, show Option A / Option B radio (see `docs/business-logic.md` §3). Show a live preview of computed shift duration per station.
>
> Implement all duration calculation and rounding logic from `docs/business-logic.md` §1–3. Handle midnight crossover. Validate: block Next if duration ≤ 0 or no available members.
>
> Show a step indicator (Step 1 of 4, Step 2 of 4…). Back navigation must restore previous form state.

**Deliverables:** Steps 1–2 fully functional with correct math.

---

## Step 5 — Schedule Wizard: Ordering & Review (Steps 3 & 4)

**Goal:** Participant distribution, drag-and-drop ordering, and final review.

**Tell Claude Code:**
> Implement Step3_Order per `docs/screens.md`. Distribute "Base" members from the selected group across time-based stations by random lottery. Show each station as a drag-and-drop list (use `@dnd-kit/core` — ensure mobile touch support). Per participant: lock toggle (pin position during reshuffle), skip toggle, mark-unavailable toggle. Add a Shuffle button that respects locks. Support cross-station drag to move participants between stations.
>
> Implement Step4_Review. Show the fully computed schedule per station (start time, end time, participant name). Allow: inline rename (one-time, does not save to group), drag-and-drop reorder within station, add participant to end of station list, remove participant, move between stations, edit individual duration (recalculate subsequent times). Add optional quote text field and author field. Add Back and "Create Schedule" buttons.
>
> On "Create Schedule": save the Schedule to localStorage, update statistics per `docs/business-logic.md` §7, then navigate to ResultScreen.

**Deliverables:** Steps 3–4 fully functional, schedule saved, statistics updated.

---

## Step 6 — Result Screen & Publishing

**Goal:** Display the final schedule and implement all export/share features.

**Tell Claude Code:**
> Implement ResultScreen per `docs/screens.md`. Display round name (editable inline), and per station: station name + list of `HH:MM  Name` entries. No live countdown or status indicators.
>
> Implement "Copy for WhatsApp" button: format schedule as the WhatsApp text template from `docs/business-logic.md` §8 and copy to clipboard.
>
> Implement "Send via WhatsApp" button: open `https://wa.me/?text=<encoded>` with the same formatted text.
>
> Implement "Continue Round" button: opens a pre-filled continuation wizard. Mirror the exact participant roster from the original round. Allow toggling individual availability and moving participants between stations before confirming. Implement the start-time logic and the uneven-end-time options from `docs/business-logic.md` §4. Each continuation round has its own editable name. Allow selecting same order or reshuffle.

**Deliverables:** Full publish, WhatsApp share, and continue-round flow.

---

## Step 7 — Statistics Screen

**Goal:** Full statistics and history drill-down.

**Tell Claude Code:**
> Implement StatisticsScreen: show a table of all participants (name, total shifts, total hours guarded), sorted by total time descending. Add a "View History" button per row.
>
> Implement ParticipantHistoryScreen: show all ShiftRecords for that participant — date, station, time range, duration. Back button returns to StatisticsScreen.
>
> Add "Reset All Statistics" button with a confirmation dialog; clears the `statistics` key from localStorage.
>
> Statistics button on HomeScreen navigates here.
>
> Add a statistics icon to the statistics button in HomeScreen.

**Deliverables:** Complete statistics feature.

---

## Step 8 — Polish, UX & Edge Cases

**Goal:** Production-quality feel, mobile polish, and all edge case handling.

**Tell Claude Code:**
> Apply consistent UI polish across all screens per `docs/screens.md` UX Rules: step indicator on all wizard screens, smooth transitions between steps, dark mode (Tailwind `dark:` classes), mobile-first touch targets (min 44px), autosave indicator.
>
> Fix and verify drag-and-drop works correctly on mobile (touch events) across Step3, Step4, and cross-station moves.
>
> Add all edge-case guards: empty group, all members "Home", zero/negative duration, duplicate names, midnight crossover display.
>
>
> Verify "Continue Round" correctly handles: uneven station end times (both options), same-structure stations, participant edits before confirming.
>
> Run through the full flow end-to-end: create group → full wizard → share via WhatsApp → continue round → view history → statistics.

**Deliverables:** Shippable, polished app.

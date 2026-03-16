# Features Specification

## 1. Group Management

### 1.1 Saved Groups
- The app maintains a list of **saved groups** (e.g. "Platoon A")
- Each group stores: name, list of members, saved station names/types
- Groups are displayed on the Home Screen with Edit and Delete buttons
- Editing a group allows renaming members and toggling availability (see §1.2)
- Group names and station configurations persist across sessions

### 1.2 Member Availability
- Each member in a saved group has a status: **Base** (available for duty) or **Home** (unavailable)
- This status is editable from the group edit screen
- Only members marked "Base" are included when generating a new schedule

### 1.3 Member List Input
- Members entered via textarea (comma or newline separated)
- CSV import supported
- Automatic deduplication
- Inline edit and delete per member after entry

---

## 2. Stations Setup (Step 1)

### 2.1 Number of Stations
- User selects how many stations (positions) exist (e.g. 1, 2, 3...)
- Station names are saved and pre-filled from last session

### 2.2 Station Types
Each station is configured as one of two types:

**Type A — Time-based station:**
- Participants rotate by time slot
- Standard scheduling with start/end times per participant

**Type B — Headcount station:**
- Requires a fixed number of participants simultaneously (not time-based)
- User defines how many participants are needed
- These participants are assigned from the group but are not scheduled by time

### 2.3 Participant Distribution
- Participants are automatically distributed across stations by random lottery
- Manual reassignment: drag a participant from one station to another
- Uneven distribution (e.g. 7 people, 2 stations): user chooses one of:
  - **Option A — Equal shift duration:** all participants guard the same duration; one station finishes earlier
  - **Option B — Equal end time:** both stations finish at the same time; one station's participants guard longer (shift duration differs between stations)
- This choice is also available in "Continue Round" (see §5)

---

## 3. Time Configuration (Step 2)

> Time is configured **after** station setup, so shift duration is calculated per station.

### 3.1 Input Options
- **Start time** (required)
- **End time** (optional) — if provided, per-participant duration is auto-calculated
- **Fixed duration per participant** (alternative to end time)
- **Custom duration per participant** (override per person)

### 3.2 Auto Duration from Time Range
- If start + end time are given: `duration = (end - start) / participantsPerStation`
- Schedules that cross midnight automatically advance the date (e.g. 23:00 on Mar 15 → 07:00 on Mar 16)

### 3.3 Rounding Algorithm (user chooses one)
| Option | Description | Default |
|--------|-------------|---------|
| Round up to 10 min | Always ceil to next 10-minute mark | ✅ Recommended |
| Round up to 5 min | Always ceil to next 5-minute mark | |
| Round to nearest minute | Round up or down to nearest minute | |

- Rounding is applied per-participant duration before computing the full schedule
- If rounding causes the schedule to exceed the stated end time, that is acceptable

### 3.4 Per-Station Duration
- When multiple stations exist, duration is calculated independently per station
- Setting times is done **after** station setup so each station's participant count is known

---

## 4. Participant Ordering (Step 3)

- **Full random shuffle** — randomize all participants
- **Custom order** — drag & drop reordering (must work reliably on mobile)
- **Re-lottery button** — reshuffles while respecting locked positions
- **Lock position** — pin specific participants so they are skipped during reshuffling
- **Skip participant** — exclude one participant from the current round without removing them
- **Swap two participants** — manual swap via UI or drag between positions
- **Mark unavailable** — temporarily exclude from scheduling

---

## 5. Round Continuity — "Continue Round"

### 5.1 Behavior
- Starts a new round beginning where the previous one ended
- Start time of the new round = exact end time of the previous round (per station)
- Mirrors the exact participant roster and station assignments from the original round
- Each round can have its own **name** (e.g. "Night Watch", "Day Watch") — shown in the WhatsApp share

### 5.2 Participant Editing in Continue Round
Before confirming the continuation, the user can:
- Toggle individual participant availability (Base / Home) — removes them from the continued round only, does not affect the saved group
- Move a participant from one station to another
- These edits apply to the new round only; the original round is not modified

### 5.2 Uneven End Times (multi-station)
If stations have different actual end times (due to uneven participant distribution), user selects:
1. **Use planned end time** — new round starts at the originally scheduled end time for all stations
2. **Use actual end time per station** — each station starts at its own actual end time (stations may be offset)

### 5.3 Round Management
- History of all past rounds stored per group
- Each round is individually deletable without affecting other rounds
- Round history is shown on the Home Screen below saved groups
- Rounds can be deleted from the Home Screen via a clear Delete button

### 5.4 New Round Options
- Same order as previous round
- New random order
- Different time configuration

---

## 6. Review & Edit Screen (Step 4)

After generating the list:
- Reorder participants within a station (drag & drop)
- Add a participant to the end of a station's list
- Remove a participant
- Rename a participant (change does **not** update the saved group — one-time override)
- Move a participant from one station to another
- Edit individual shift duration (auto-recalculates subsequent start times)
- Navigate back to previous steps to change any configuration

---

## 7. Publishing — Share (Step 5)

### 7.1 WhatsApp Sharing
- **Copy as text** — formats schedule as a clean WhatsApp-readable message:
  ```
  🔒 [Round Name]
  📍 [Station Name]
  14:00 Soldier A
  15:30 Soldier B
  ...
  ```
- **Share to WhatsApp** — opens WhatsApp with the formatted text pre-filled; user selects the group

---

## 8. Statistics

### 8.1 Access
- Accessible from Home Screen via a dedicated **Statistics** button only

### 8.2 Tracking
- Tracks per participant (identified by **name as unique key**):
  - Total number of shifts
  - Total guard time (hours + minutes)
- Aggregated across all rounds and all groups

### 8.3 History View
- Accessible from within the Statistics screen
- Drill down by participant name → list of all their shifts with date, time, station, duration

### 8.4 Reset
- A **Reset All Statistics** button clears all accumulated statistics

---

## 9. Past Schedules History

- All generated schedules are saved with date and time of creation
- Accessible from the Home Screen below the saved groups section
- Each past schedule can be:
  - Viewed (same final screen as after creation)
  - Deleted via a clear Delete button
- Past schedules do **not** include "run live" functionality — view only

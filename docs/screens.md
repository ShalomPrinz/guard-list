# Screens & Navigation

## Screen Map

```
HomeScreen
├── [Button] New Schedule → Step1_Stations
├── [Button] Statistics → StatisticsScreen
├── Section: Saved Groups
│   └── GroupCard [Edit] [Delete] → GroupEditScreen
└── Section: Past Schedules
    └── ScheduleHistoryCard [View] [Delete] → ResultScreen

Step1_Stations → Step2_Time → Step3_Order → Step4_Review → ResultScreen

ResultScreen
└── [Continue Round] → Step1_Stations (pre-filled, continue mode)
```

---

## Screen Details

### HomeScreen
- Header with app name
- **"New Schedule"** primary CTA button
- **"Statistics"** button (secondary)
- **Saved Groups** section:
  - Each group shows name + member count
  - Edit button → GroupEditScreen
  - Delete button (with confirmation)
- **Past Schedules** section:
  - Each entry shows: round name, date/time created, station count
  - View button → ResultScreen (read-only)
  - Delete button (with confirmation)

---

### GroupEditScreen
- Edit group name
- List of members with:
  - Toggle: **Base** / **Home** (availability)
  - Rename inline
  - Delete member
- Add new member (text input)
- Save button

---

### Step1_Stations — Station Setup
- Input: number of stations
- For each station:
  - Name field (pre-filled from last session)
  - Type selector: **Time-based** | **Headcount**
  - If Headcount: input for number of simultaneous participants needed
- "Next" button → Step2_Time
- "Back" button → HomeScreen

---

### Step2_Time — Time Configuration
- Start time picker (required)
- End time picker (optional)
  - If set: shows calculated raw duration per participant per station
- OR: fixed duration input (minutes)
- Rounding algorithm selector:
  - ● Round up to 10 min *(recommended)*
  - ○ Round up to 5 min
  - ○ Round to nearest minute
- If uneven distribution across stations:
  - Radio: **Equal shift duration** | **Equal end time**
- Preview: shows computed shift duration per station
- "Next" button → Step3_Order
- "Back" button → Step1_Stations

---

### Step3_Order — Participant Distribution & Ordering
- For each time-based station:
  - Drag-and-drop list of assigned participants
  - "Shuffle" button (respects locks)
  - Per participant:
    - Lock icon (pin position)
    - Skip toggle (exclude from this round)
    - Mark unavailable
- Cross-station drag: move participant to a different station
- "Next" button → Step4_Review
- "Back" button → Step2_Time

---

### Step4_Review — Final Review & Edit
- Full schedule preview per station
- Editable:
  - Participant name (one-time, does not update saved group)
  - Individual shift duration (recalculates subsequent times)
  - Reorder via drag & drop
  - Add participant to station
  - Remove participant
  - Move participant between stations
- Quote/motto input field (optional, with author field)
- "Back" button → Step3_Order
- **"Create Schedule"** button → ResultScreen

---

### ResultScreen — Schedule View & Publish
- Displays full schedule:
  - Round name (editable inline)
  - Per station: station name + sorted list of `HH:MM  Name`
- Action buttons:
  - **"Copy for WhatsApp"** — copies formatted text to clipboard
  - **"Send via WhatsApp"** — opens WhatsApp with text pre-filled
  - **"Continue Round"** — launches new round setup in continue mode
- No live countdown or real-time status display

---

### StatisticsScreen
- Per-participant summary table:
  - Name | Total shifts | Total hours guarded
- "View History" per participant → ParticipantHistoryScreen
- **"Reset All Statistics"** button (with confirmation)
- "Back" button → HomeScreen

---

### ParticipantHistoryScreen
- Participant name as title
- List of all shifts:
  - Date, time range, station, duration
- "Back" button → StatisticsScreen

---

## UX Rules

- **Wizard navigation**: always show step indicator (Step 1/4, 2/4, etc.)
- Back navigation never loses entered data (state preserved)
- Autosave on every step transition
- Mobile-first layout, touch-friendly tap targets
- Dark mode supported
- Subtle transition animations between steps
- Edge case handling:
  - Empty participant list → show error, block Next
  - Negative or zero duration → show error
  - Overlapping shifts → prevent and warn

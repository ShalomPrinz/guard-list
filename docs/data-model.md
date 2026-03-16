# Data Model

All data is persisted in `localStorage`. The app uses the following top-level keys:

| Key | Type | Description |
|-----|------|-------------|
| `groups` | `Group[]` | Saved participant groups |
| `stations_config` | `StationConfig[]` | Last-used station configuration |
| `schedules` | `Schedule[]` | All past generated schedules |
| `statistics` | `Statistics` | Cumulative guard statistics per participant |

---

## Types

### Group
```ts
interface Group {
  id: string;
  name: string;
  members: Member[];
  createdAt: string; // ISO date
}

interface Member {
  id: string;
  name: string;
  availability: "base" | "home"; // base = available, home = unavailable
}
```

---

### StationConfig
Saved separately so it persists between schedule creations.

```ts
interface StationConfig {
  id: string;
  name: string;
  type: "time-based" | "headcount";
  headcountRequired?: number; // only for headcount type
}
```

---

### Schedule
A schedule is a named round with one or more stations, linked to a group.

```ts
interface Schedule {
  id: string;
  name: string;           // e.g. "Night Watch"
  groupId: string;
  createdAt: string;      // ISO datetime
  date: string;           // date of the guard duty (YYYY-MM-DD)
  parentScheduleId?: string; // set if this is a "continue round"
  stations: ScheduleStation[];
  unevenDistributionMode: "equal-duration" | "equal-endtime";
}

interface ScheduleStation {
  stationConfigId: string;
  stationName: string;
  stationType: "time-based" | "headcount";
  participants: ScheduledParticipant[];
  // only for headcount stations:
  headcountParticipants?: string[]; // participant names
}

interface ScheduledParticipant {
  name: string;           // may differ from group member name (one-time override)
  startTime: string;      // "HH:MM"
  endTime: string;        // "HH:MM"
  date: string;           // YYYY-MM-DD (handles midnight crossover)
  durationMinutes: number;
  locked: boolean;
  skipped: boolean;
}

```

---

### Statistics
```ts
interface Statistics {
  participants: {
    [name: string]: ParticipantStats; // name is unique key
  };
}

interface ParticipantStats {
  totalShifts: number;
  totalMinutes: number;
  history: ShiftRecord[];
}

interface ShiftRecord {
  scheduleId: string;
  scheduleName: string;
  stationName: string;
  date: string;           // YYYY-MM-DD
  startTime: string;      // "HH:MM"
  endTime: string;        // "HH:MM"
  durationMinutes: number;
}
```

---

## Notes

- **Name as unique key for statistics**: participant identity across rounds is determined by exact name match. Renaming a participant in Step 4 (one-time override) does not update statistics linkage.
- **Midnight crossover**: if `endTime < startTime`, the end date is `startDate + 1 day`.
- **Headcount stations** are excluded from time-based statistics tracking.
- **Deleting a round** does not retroactively remove statistics already recorded.
- **Resetting statistics** clears the entire `statistics` key from localStorage.

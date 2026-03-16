# Business Logic & Scheduling Algorithms

## 1. Duration Calculation

### From End Time
```
rawDuration = (endTime - startTime) / participantsInStation
```
If `endTime < startTime`, add 24 hours (midnight crossover).

### Rounding
Apply rounding to `rawDuration` based on user-selected algorithm:

| Algorithm | Formula |
|-----------|---------|
| Round up to 10 min *(default, recommended)* | `ceil(rawDuration / 10) * 10` |
| Round up to 5 min | `ceil(rawDuration / 5) * 5` |
| Round to nearest minute | `round(rawDuration)` |

**Example:** 7 hours / 5 participants = 84 min → rounded up to 90 min (next 10-min mark).

The rounded duration is applied uniformly per participant in that station.
Rounding may cause the actual end time to exceed the stated end time — this is expected and acceptable.

---

## 2. Schedule Generation

For each time-based station:
```
participant[0].startTime = roundStartTime
participant[i].startTime = participant[i-1].startTime + roundedDuration
participant[i].endTime   = participant[i].startTime + roundedDuration
```

Date increments when `startTime` crosses 00:00.

Schedule generation is **deterministic**: given the same inputs, always produces the same output.

---

## 3. Uneven Distribution Between Stations

When `totalParticipants % numberOfStations !== 0`:

**Option A — Equal shift duration:**
- All participants across all stations guard the same duration
- Station with fewer participants finishes earlier
- Duration based on the station with more participants (or user-set)

**Option B — Equal end time:**
- All stations finish at the same time
- Station with fewer participants has a longer per-participant duration
- Each station's duration calculated independently: `duration_i = totalTime / participants_i`
- Rounding applied per station separately

The user selects this option in Step 2 (Time Configuration). The same choice is offered when using "Continue Round."

---

## 4. Continue Round

```
newRound.startTime[station_i] = previousRound.actualEndTime[station_i]
```

Where `actualEndTime` = startTime of last participant in station + their duration.

If user selects "Use planned end time":
```
newRound.startTime[station_i] = previousRound.plannedEndTime
```

The same station structure, station names, station types, and **exact participant roster** from the original round are carried over.

### Participant Editing Before Confirming
- Toggle a participant's availability for this round only (does not affect saved group or original round)
- Move a participant between stations for this round only
- Participant order within a station is preserved by default; user may reshuffle

---

## 5. Mid-Round Duration Changes

- Changing a participant's duration in Step 4 (Review) recalculates all subsequent participants' start times in that station
- History is immutable once a schedule is saved

---

## 6. Constraints & Edge Cases

| Case | Behavior |
|------|----------|
| Empty participant list | Block schedule creation, show error |
| Duration = 0 or negative | Show error, block creation |
| All participants marked "Home" | Block creation, prompt user |
| Headcount station needs more participants than available | Warn but allow |
| Midnight crossover | Advance date by 1 day for affected participants |
| Duplicate names in input | Auto-deduplicate on entry |

---

## 7. Statistics Update

After "Create Schedule" is confirmed:
- For each `ScheduledParticipant` in each **time-based** station:
  - Increment `totalShifts` for that participant name
  - Add `durationMinutes` to `totalMinutes`
  - Append a `ShiftRecord` to their history
- Headcount station participants are **not** counted in statistics

---

## 8. WhatsApp Text Format

```
🔒 [Round Name]

📍 [Station 1 Name]
14:00 Participant A
15:30 Participant B

📍 [Station 2 Name]
14:00 Participant C
```

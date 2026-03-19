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

---

## 5. WhatsApp Text Format

```
🔒 [Round Name]

📍 [Station 1 Name]
14:00 Participant A
15:30 Participant B

📍 [Station 2 Name]
14:00 Participant C
```

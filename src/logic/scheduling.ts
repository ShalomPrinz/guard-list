import type { RoundingAlgorithm, UnevenMode } from '../types'

// ─── Time helpers ─────────────────────────────────────────────────────────────

/** Parse "HH:MM" to total minutes from midnight (0–1439). */
export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Convert minutes from midnight to "HH:MM". Wraps correctly past midnight. */
export function minutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Add `minutesToAdd` to a "HH:MM" time.
 * Returns the new time string and how many calendar days were crossed.
 */
export function addMinutesToTime(
  time: string,
  minutesToAdd: number,
): { time: string; dateOffset: number } {
  const base = parseTimeToMinutes(time)
  const total = base + minutesToAdd
  const dateOffset = Math.floor(total / 1440)
  return { time: minutesToTime(total), dateOffset }
}

// ─── Rounding ─────────────────────────────────────────────────────────────────

export function applyRounding(rawMinutes: number, algorithm: RoundingAlgorithm): number {
  switch (algorithm) {
    case 'round-up-10':
      return Math.ceil(rawMinutes / 10) * 10
    case 'round-up-5':
      return Math.ceil(rawMinutes / 5) * 5
    case 'round-nearest':
      return Math.round(rawMinutes)
  }
}

// ─── Duration calculation ─────────────────────────────────────────────────────

export interface StationDurationResult {
  participantCount: number
  rawDurationMinutes: number
  roundedDurationMinutes: number
}

/**
 * Calculate per-participant duration for each time-based station.
 *
 * Handles:
 * - Fixed duration mode (fixedDurationMinutes set): rounding applied directly
 * - End-time mode (endTime set): split total span by participant counts
 *   - equal-duration: all stations use the duration of the largest station
 *   - equal-endtime:  each station calculates independently
 * - Midnight crossover: if endTime ≤ startTime, add 24 h
 */
export function calcStationDurations(params: {
  startTime: string
  endTime?: string
  fixedDurationMinutes?: number
  roundingAlgorithm: RoundingAlgorithm
  unevenMode: UnevenMode
  stationParticipantCounts: number[]
}): StationDurationResult[] {
  const {
    startTime,
    endTime,
    fixedDurationMinutes,
    roundingAlgorithm,
    unevenMode,
    stationParticipantCounts,
  } = params

  // ── Fixed duration mode ──
  if (fixedDurationMinutes !== undefined && fixedDurationMinutes > 0) {
    const rounded = applyRounding(fixedDurationMinutes, roundingAlgorithm)
    return stationParticipantCounts.map(count => ({
      participantCount: count,
      rawDurationMinutes: fixedDurationMinutes,
      roundedDurationMinutes: rounded,
    }))
  }

  // ── End-time mode ──
  if (!endTime) {
    return stationParticipantCounts.map(count => ({
      participantCount: count,
      rawDurationMinutes: 0,
      roundedDurationMinutes: 0,
    }))
  }

  const startMins = parseTimeToMinutes(startTime)
  let endMins = parseTimeToMinutes(endTime)
  if (endMins <= startMins) endMins += 1440 // midnight crossover
  const totalMinutes = endMins - startMins

  if (unevenMode === 'equal-duration') {
    // Use the station with the most participants to derive the common per-person duration
    const maxCount = Math.max(...stationParticipantCounts)
    const rawDuration = totalMinutes / maxCount
    const rounded = applyRounding(rawDuration, roundingAlgorithm)
    return stationParticipantCounts.map(count => ({
      participantCount: count,
      rawDurationMinutes: rawDuration,
      roundedDurationMinutes: rounded,
    }))
  } else {
    // equal-endtime: each station calculates duration independently
    return stationParticipantCounts.map(count => {
      const raw = count > 0 ? totalMinutes / count : 0
      return {
        participantCount: count,
        rawDurationMinutes: raw,
        roundedDurationMinutes: applyRounding(raw, roundingAlgorithm),
      }
    })
  }
}

// ─── Participant distribution ─────────────────────────────────────────────────

/**
 * Distribute `total` participants as evenly as possible across `stationCount`
 * stations. Extra participants go to the first stations.
 * Example: 7 across 2 → [4, 3]
 */
export function distributeParticipants(total: number, stationCount: number): number[] {
  if (stationCount === 0) return []
  const base = Math.floor(total / stationCount)
  const extra = total % stationCount
  return Array.from({ length: stationCount }, (_, i) => base + (i < extra ? 1 : 0))
}

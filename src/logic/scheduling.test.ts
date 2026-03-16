import { describe, it, expect } from 'vitest'
import {
  parseTimeToMinutes,
  minutesToTime,
  addMinutesToTime,
  applyRounding,
  calcStationDurations,
  distributeParticipants,
} from './scheduling'

// ─── parseTimeToMinutes ───────────────────────────────────────────────────────

describe('parseTimeToMinutes', () => {
  it('parses midnight', () => expect(parseTimeToMinutes('00:00')).toBe(0))
  it('parses 01:30', () => expect(parseTimeToMinutes('01:30')).toBe(90))
  it('parses 23:59', () => expect(parseTimeToMinutes('23:59')).toBe(1439))
  it('parses 12:00', () => expect(parseTimeToMinutes('12:00')).toBe(720))
})

// ─── minutesToTime ────────────────────────────────────────────────────────────

describe('minutesToTime', () => {
  it('converts 0 to 00:00', () => expect(minutesToTime(0)).toBe('00:00'))
  it('converts 90 to 01:30', () => expect(minutesToTime(90)).toBe('01:30'))
  it('converts 1439 to 23:59', () => expect(minutesToTime(1439)).toBe('23:59'))
  it('wraps 1440 back to 00:00', () => expect(minutesToTime(1440)).toBe('00:00'))
  it('wraps 1500 to 01:00', () => expect(minutesToTime(1500)).toBe('01:00'))
})

// ─── addMinutesToTime ─────────────────────────────────────────────────────────

describe('addMinutesToTime', () => {
  it('adds minutes within the same day', () => {
    expect(addMinutesToTime('14:00', 90)).toEqual({ time: '15:30', dateOffset: 0 })
  })

  it('crosses midnight and increments dateOffset', () => {
    expect(addMinutesToTime('23:00', 90)).toEqual({ time: '00:30', dateOffset: 1 })
  })

  it('exactly midnight cross yields offset 1', () => {
    expect(addMinutesToTime('23:30', 30)).toEqual({ time: '00:00', dateOffset: 1 })
  })

  it('crossing midnight twice yields offset 2', () => {
    expect(addMinutesToTime('22:00', 180)).toEqual({ time: '01:00', dateOffset: 1 })
  })
})

// ─── applyRounding ────────────────────────────────────────────────────────────

describe('applyRounding', () => {
  it('round-up-10: already multiple of 10 → unchanged', () => {
    expect(applyRounding(90, 'round-up-10')).toBe(90)
  })

  it('round-up-10: 84 → 90', () => {
    expect(applyRounding(84, 'round-up-10')).toBe(90)
  })

  it('round-up-10: 81 → 90', () => {
    expect(applyRounding(81, 'round-up-10')).toBe(90)
  })

  it('round-up-5: already multiple of 5 → unchanged', () => {
    expect(applyRounding(85, 'round-up-5')).toBe(85)
  })

  it('round-up-5: 83 → 85', () => {
    expect(applyRounding(83, 'round-up-5')).toBe(85)
  })

  it('round-nearest: 84.4 → 84', () => {
    expect(applyRounding(84.4, 'round-nearest')).toBe(84)
  })

  it('round-nearest: 84.6 → 85', () => {
    expect(applyRounding(84.6, 'round-nearest')).toBe(85)
  })

  // Classic example from the spec: 7 h / 5 participants = 84 min → 90 min
  it('spec example: 420 min / 5 participants = 84 → rounds to 90', () => {
    expect(applyRounding(420 / 5, 'round-up-10')).toBe(90)
  })
})

// ─── calcStationDurations ─────────────────────────────────────────────────────

describe('calcStationDurations — fixed duration mode', () => {
  it('applies rounding and ignores uneven mode', () => {
    const results = calcStationDurations({
      startTime: '20:00',
      fixedDurationMinutes: 83,
      roundingAlgorithm: 'round-up-10',
      unevenMode: 'equal-duration',
      stationParticipantCounts: [4, 3],
    })
    expect(results[0].roundedDurationMinutes).toBe(90)
    expect(results[1].roundedDurationMinutes).toBe(90)
  })
})

describe('calcStationDurations — end-time mode', () => {
  it('returns zeroes when endTime is not provided', () => {
    const results = calcStationDurations({
      startTime: '20:00',
      roundingAlgorithm: 'round-up-10',
      unevenMode: 'equal-duration',
      stationParticipantCounts: [4],
    })
    expect(results[0].roundedDurationMinutes).toBe(0)
  })

  it('equal-duration: single station — computes correctly', () => {
    // 4 h span, 4 participants → 60 min each
    const [r] = calcStationDurations({
      startTime: '20:00',
      endTime: '00:00',
      roundingAlgorithm: 'round-nearest',
      unevenMode: 'equal-duration',
      stationParticipantCounts: [4],
    })
    expect(r.rawDurationMinutes).toBe(60)
    expect(r.roundedDurationMinutes).toBe(60)
  })

  it('equal-duration: uses max participant count to derive shared duration', () => {
    // 480 min span, station1=4, station2=3
    // max=4 → raw=120, rounded=120; both stations get 120
    const results = calcStationDurations({
      startTime: '20:00',
      endTime: '04:00',
      roundingAlgorithm: 'round-nearest',
      unevenMode: 'equal-duration',
      stationParticipantCounts: [4, 3],
    })
    expect(results[0].roundedDurationMinutes).toBe(120)
    expect(results[1].roundedDurationMinutes).toBe(120)
  })

  it('equal-endtime: each station calculates independently', () => {
    // 480 min span, station1=4 → 120 min, station2=3 → 160 min
    const results = calcStationDurations({
      startTime: '20:00',
      endTime: '04:00',
      roundingAlgorithm: 'round-nearest',
      unevenMode: 'equal-endtime',
      stationParticipantCounts: [4, 3],
    })
    expect(results[0].roundedDurationMinutes).toBe(120)
    expect(results[1].roundedDurationMinutes).toBe(160)
  })

  it('midnight crossover: endTime < startTime adds 24 h to span', () => {
    // 23:00 → 01:00 = 120 min span, 2 participants → 60 min each
    const [r] = calcStationDurations({
      startTime: '23:00',
      endTime: '01:00',
      roundingAlgorithm: 'round-nearest',
      unevenMode: 'equal-duration',
      stationParticipantCounts: [2],
    })
    expect(r.rawDurationMinutes).toBe(60)
  })

  it('rounds up when raw duration is fractional', () => {
    // 420 min span, 5 participants → 84 min raw → 90 min rounded up to 10
    const [r] = calcStationDurations({
      startTime: '20:00',
      endTime: '03:00',
      roundingAlgorithm: 'round-up-10',
      unevenMode: 'equal-duration',
      stationParticipantCounts: [5],
    })
    expect(r.rawDurationMinutes).toBe(84)
    expect(r.roundedDurationMinutes).toBe(90)
  })
})

// ─── distributeParticipants ───────────────────────────────────────────────────

describe('distributeParticipants', () => {
  it('distributes evenly when divisible', () => {
    expect(distributeParticipants(6, 2)).toEqual([3, 3])
  })

  it('gives extra participant to first station (7 across 2 → [4, 3])', () => {
    expect(distributeParticipants(7, 2)).toEqual([4, 3])
  })

  it('distributes across 3 stations (7 across 3 → [3, 2, 2])', () => {
    expect(distributeParticipants(7, 3)).toEqual([3, 2, 2])
  })

  it('single station gets all participants', () => {
    expect(distributeParticipants(5, 1)).toEqual([5])
  })

  it('zero stations returns empty array', () => {
    expect(distributeParticipants(5, 0)).toEqual([])
  })

  it('total equals 1 across 3 stations → [1, 0, 0]', () => {
    expect(distributeParticipants(1, 3)).toEqual([1, 0, 0])
  })
})

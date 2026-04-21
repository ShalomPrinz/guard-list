import { describe, it, expect } from 'vitest'
import {
  parseTimeToMinutes,
  minutesToTime,
  addMinutesToTime,
  applyRounding,
  calcStationDurations,
  distributeParticipants,
  recalculateStation,
  recalculateStationWithMode,
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

// ─── recalculateStation ───────────────────────────────────────────────────────

describe('recalculateStation', () => {
  const participants = [
    { name: 'Alice' },
    { name: 'Bob' },
    { name: 'Charlie' },
  ]

  it('returns empty array when no participants', () => {
    const result = recalculateStation([], '20:00', '2026-01-01', '23:00', 'round-up-10')
    expect(result).toEqual([])
  })

  it('distributes time evenly among 3 participants (3h / 3 = 60min each)', () => {
    const result = recalculateStation(participants, '20:00', '2026-01-01', '23:00', 'round-nearest')
    expect(result).toHaveLength(3)
    expect(result[0].startTime).toBe('20:00')
    expect(result[0].durationMinutes).toBe(60)
    expect(result[1].startTime).toBe('21:00')
    expect(result[2].startTime).toBe('22:00')
    expect(result[2].endTime).toBe('23:00')
  })

  it('applies rounding (round-up-10): 100min / 3 = 33.3 → 40min each', () => {
    // 20:00 to 21:40 = 100 min / 3 = 33.33 → rounds up to 40
    const result = recalculateStation(participants, '20:00', '2026-01-01', '21:40', 'round-up-10')
    expect(result[0].durationMinutes).toBe(40)
  })

  it('handles midnight crossover: endTime < startTime adds 24h', () => {
    // 23:00 → 01:00 = 120 min, 2 participants → 60 min each
    const twoParticipants = [
      { name: 'Alice' },
      { name: 'Bob' },
    ]
    const result = recalculateStation(twoParticipants, '23:00', '2026-01-01', '01:00', 'round-nearest')
    expect(result).toHaveLength(2)
    expect(result[0].durationMinutes).toBe(60)
    expect(result[0].startTime).toBe('23:00')
    expect(result[1].startTime).toBe('00:00')
    expect(result[1].date).toBe('2026-01-02')
  })

  it('preserves participant names', () => {
    const twoParticipants = [{ name: 'Alice' }, { name: 'Bob' }]
    const result = recalculateStation(twoParticipants, '20:00', '2026-01-01', '22:00', 'round-nearest')
    expect(result[0].name).toBe('Alice')
    expect(result[1].name).toBe('Bob')
  })

  it('single participant gets the full duration', () => {
    const one = [{ name: 'Solo' }]
    const result = recalculateStation(one, '08:00', '2026-01-01', '10:00', 'round-nearest')
    expect(result[0].durationMinutes).toBe(120)
    expect(result[0].startTime).toBe('08:00')
    expect(result[0].endTime).toBe('10:00')
  })
})

// ─── recalculateStationWithMode ───────────────────────────────────────────────

describe('recalculateStationWithMode', () => {
  const participants = [
    { name: 'Alice' },
    { name: 'Bob' },
    { name: 'Charlie' },
  ]

  it('endingHour mode produces same result as recalculateStation', () => {
    const resultWithMode = recalculateStationWithMode(
      participants,
      '14:00',
      '2026-04-22',
      'endingHour',
      '16:00',
      'round-up-10'
    )
    const resultDirect = recalculateStation(
      participants,
      '14:00',
      '2026-04-22',
      '16:00',
      'round-up-10'
    )
    expect(resultWithMode).toEqual(resultDirect)
  })

  it('applies constant duration correctly (no rounding applied)', () => {
    const result = recalculateStationWithMode(
      participants,
      '14:00',
      '2026-04-22',
      'constantDuration',
      45,
      'round-up-10'
    )
    expect(result).toHaveLength(3)
    // All participants should have exactly 45 minutes (no rounding)
    expect(result[0].durationMinutes).toBe(45)
    expect(result[1].durationMinutes).toBe(45)
    expect(result[2].durationMinutes).toBe(45)
    // Times should be incremented by 45 minutes each
    expect(result[0].startTime).toBe('14:00')
    expect(result[1].startTime).toBe('14:45')
    expect(result[2].startTime).toBe('15:30')
  })

  it('constant duration with 2 participants', () => {
    const twoParticipants = [{ name: 'Alice' }, { name: 'Bob' }]
    const result = recalculateStationWithMode(
      twoParticipants,
      '09:00',
      '2026-04-22',
      'constantDuration',
      30,
      'round-up-10'
    )
    expect(result[0].durationMinutes).toBe(30)
    expect(result[1].durationMinutes).toBe(30)
    expect(result[0].startTime).toBe('09:00')
    expect(result[1].startTime).toBe('09:30')
    expect(result[0].endTime).toBe('09:30')
    expect(result[1].endTime).toBe('10:00')
  })

  it('constant duration crossing midnight increments date correctly', () => {
    const twoParticipants = [{ name: 'Alice' }, { name: 'Bob' }]
    const result = recalculateStationWithMode(
      twoParticipants,
      '23:30',
      '2026-04-22',
      'constantDuration',
      60,
      'round-up-10'
    )
    expect(result[0].startTime).toBe('23:30')
    expect(result[0].endTime).toBe('00:30')
    expect(result[0].date).toBe('2026-04-22')
    expect(result[1].startTime).toBe('00:30')
    expect(result[1].endTime).toBe('01:30')
    expect(result[1].date).toBe('2026-04-23') // crosses midnight
  })

  it('constant duration with single participant', () => {
    const one = [{ name: 'Solo' }]
    const result = recalculateStationWithMode(
      one,
      '10:00',
      '2026-04-22',
      'constantDuration',
      120,
      'round-up-10'
    )
    expect(result[0].durationMinutes).toBe(120)
    expect(result[0].startTime).toBe('10:00')
    expect(result[0].endTime).toBe('12:00')
  })

  it('constant duration ignores rounding algorithm', () => {
    const result1 = recalculateStationWithMode(
      [{ name: 'Alice' }],
      '10:00',
      '2026-04-22',
      'constantDuration',
      45,
      'round-up-10'
    )
    const result2 = recalculateStationWithMode(
      [{ name: 'Alice' }],
      '10:00',
      '2026-04-22',
      'constantDuration',
      45,
      'round-nearest'
    )
    // Both should have exact same duration (45 min, not rounded)
    expect(result1[0].durationMinutes).toBe(45)
    expect(result2[0].durationMinutes).toBe(45)
  })

  it('returns empty array for no participants in any mode', () => {
    const result = recalculateStationWithMode(
      [],
      '14:00',
      '2026-04-22',
      'constantDuration',
      60,
      'round-up-10'
    )
    expect(result).toEqual([])
  })

  it('preserves participant names in constant duration mode', () => {
    const result = recalculateStationWithMode(
      participants,
      '14:00',
      '2026-04-22',
      'constantDuration',
      60,
      'round-up-10'
    )
    expect(result[0].name).toBe('Alice')
    expect(result[1].name).toBe('Bob')
    expect(result[2].name).toBe('Charlie')
  })

  it('constant duration with various minute values', () => {
    const twoParticipants = [{ name: 'Alice' }, { name: 'Bob' }]
    const testCases = [15, 30, 45, 60, 90, 120]
    testCases.forEach(mins => {
      const result = recalculateStationWithMode(
        twoParticipants,
        '10:00',
        '2026-04-22',
        'constantDuration',
        mins,
        'round-up-10'
      )
      expect(result[0].durationMinutes).toBe(mins)
      expect(result[1].durationMinutes).toBe(mins)
    })
  })
})

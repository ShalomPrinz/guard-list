import { describe, it, expect } from 'vitest'
import {
  addDaysToDate,
  shuffleArray,
  buildStationSchedule,
  formatScheduleForWhatsApp,
} from './generateSchedule'
import type { Schedule } from '../types'

// ─── addDaysToDate ─────────────────────────────────────────────────────────────

describe('addDaysToDate', () => {
  it('returns the same date when days = 0', () => {
    expect(addDaysToDate('2026-03-10', 0)).toBe('2026-03-10')
  })

  it('advances by 1 day', () => {
    expect(addDaysToDate('2026-03-10', 1)).toBe('2026-03-11')
  })

  it('crosses month boundary correctly', () => {
    expect(addDaysToDate('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('crosses year boundary correctly', () => {
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('advances by multiple days', () => {
    expect(addDaysToDate('2026-03-10', 5)).toBe('2026-03-15')
  })
})

// ─── shuffleArray ──────────────────────────────────────────────────────────────

describe('shuffleArray', () => {
  it('returns a new array (does not mutate the original)', () => {
    const original = [1, 2, 3, 4, 5]
    const result = shuffleArray(original)
    expect(result).not.toBe(original)
    expect(original).toEqual([1, 2, 3, 4, 5])
  })

  it('returns array with same length and elements', () => {
    const arr = ['a', 'b', 'c', 'd', 'e', 'f']
    const result = shuffleArray(arr)
    expect(result).toHaveLength(arr.length)
    expect(result.sort()).toEqual([...arr].sort())
  })

  it('handles empty array', () => {
    expect(shuffleArray([])).toEqual([])
  })

  it('handles single-element array', () => {
    expect(shuffleArray([42])).toEqual([42])
  })
})

// ─── buildStationSchedule ──────────────────────────────────────────────────────

describe('buildStationSchedule', () => {
  const participants = [
    { name: 'Alice', durationMinutes: 90 },
    { name: 'Bob',   durationMinutes: 90 },
    { name: 'Carol', durationMinutes: 60 },
  ]

  it('assigns correct sequential start and end times', () => {
    const result = buildStationSchedule(participants, '20:00', '2026-03-10')
    expect(result[0].startTime).toBe('20:00')
    expect(result[0].endTime).toBe('21:30')
    expect(result[1].startTime).toBe('21:30')
    expect(result[1].endTime).toBe('23:00')
    expect(result[2].startTime).toBe('23:00')
    expect(result[2].endTime).toBe('00:00')
  })

  it('all participants are on the start date when no midnight crossover', () => {
    const result = buildStationSchedule(participants, '20:00', '2026-03-10')
    expect(result.every(p => p.date === '2026-03-10')).toBe(true)
  })

  it('advances date when schedule crosses midnight', () => {
    const late = [
      { name: 'Alice', durationMinutes: 120 },
      { name: 'Bob',   durationMinutes: 120 },
    ]
    const result = buildStationSchedule(late, '23:00', '2026-03-10')
    expect(result[0].date).toBe('2026-03-10')
    expect(result[0].startTime).toBe('23:00')
    expect(result[0].endTime).toBe('01:00')
    expect(result[1].date).toBe('2026-03-11')
    expect(result[1].startTime).toBe('01:00')
  })

  it('preserves durationMinutes per participant', () => {
    const result = buildStationSchedule(participants, '20:00', '2026-03-10')
    expect(result[0].durationMinutes).toBe(90)
    expect(result[2].durationMinutes).toBe(60)
  })

  it('returns empty array for empty participants', () => {
    expect(buildStationSchedule([], '08:00', '2026-03-10')).toEqual([])
  })

  it('is deterministic — same inputs produce same outputs', () => {
    const r1 = buildStationSchedule(participants, '20:00', '2026-03-10')
    const r2 = buildStationSchedule(participants, '20:00', '2026-03-10')
    expect(r1).toEqual(r2)
  })
})

// ─── formatScheduleForWhatsApp ────────────────────────────────────────────────

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 's1',
    name: 'Night Watch',
    groupId: 'g1',
    createdAt: '2026-01-01T22:00:00.000Z',
    date: '2026-01-01',
    stations: [],
    unevenDistributionMode: 'equal-duration',
    ...overrides,
  }
}

describe('formatScheduleForWhatsApp', () => {
  it('starts with lock emoji and schedule name', () => {
    const text = formatScheduleForWhatsApp(makeSchedule({ name: 'Night Watch' }))
    expect(text.startsWith('🔒 Night Watch')).toBe(true)
  })

  it('formats time-based stations with times and names', () => {
    const schedule = makeSchedule({
      stations: [
        {
          stationConfigId: 'st1',
          stationName: 'Gate',
          stationType: 'time-based',
          participants: [
            { name: 'Alice', startTime: '20:00', endTime: '21:30', date: '2026-01-01', durationMinutes: 90, },
            { name: 'Bob',   startTime: '21:30', endTime: '23:00', date: '2026-01-01', durationMinutes: 90, },
          ],
        },
      ],
    })
    const text = formatScheduleForWhatsApp(schedule)
    expect(text).toContain('📍 Gate')
    expect(text).toContain('20:00 Alice')
    expect(text).toContain('21:30 Bob')
  })

  it('appends quote when present', () => {
    const text = formatScheduleForWhatsApp(makeSchedule({ quote: 'Be brave', quoteAuthor: 'Sun Tzu' }))
    expect(text).toContain('"Be brave"')
    expect(text).toContain('Sun Tzu')
  })

  it('omits author suffix when quoteAuthor is absent', () => {
    const text = formatScheduleForWhatsApp(makeSchedule({ quote: 'Be brave' }))
    expect(text).toContain('"Be brave"')
  })

  it('omits quote block when quote is absent', () => {
    const text = formatScheduleForWhatsApp(makeSchedule())
    expect(text).not.toContain('"')
  })

  it('lists stations in order', () => {
    const schedule = makeSchedule({
      stations: [
        {
          stationConfigId: 'st1',
          stationName: 'First Station',
          stationType: 'time-based',
          participants: [
            { name: 'Alice', startTime: '20:00', endTime: '21:30', date: '2026-01-01', durationMinutes: 90, },
          ],
        },
        {
          stationConfigId: 'st2',
          stationName: 'Second Station',
          stationType: 'time-based',
          participants: [
            { name: 'Bob', startTime: '20:00', endTime: '21:30', date: '2026-01-01', durationMinutes: 90, },
          ],
        },
      ],
    })
    const text = formatScheduleForWhatsApp(schedule)
    const idx1 = text.indexOf('First Station')
    const idx2 = text.indexOf('Second Station')
    expect(idx1).toBeLessThan(idx2)
  })
})

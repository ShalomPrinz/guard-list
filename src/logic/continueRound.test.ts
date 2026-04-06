import { describe, it, expect } from 'vitest'
import { uniteSchedules, datetimeToSortKey, buildContinueRoundQueue } from './continueRound'
import type { Schedule } from '../types'

function makeParticipant(name: string, startTime: string, endTime: string, date: string) {
  return { name, startTime, endTime, date, durationMinutes: 60, locked: false }
}

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 's1',
    name: 'Round',
    groupId: 'g1',
    createdAt: '2024-01-01T00:00:00Z',
    date: '2024-01-01',
    stations: [],
    unevenDistributionMode: 'equal-duration',
    ...overrides,
  }
}

describe('datetimeToSortKey', () => {
  it('returns a larger value for a later date', () => {
    const day1 = datetimeToSortKey('2024-01-01', '23:00')
    const day2 = datetimeToSortKey('2024-01-02', '00:20')
    expect(day2).toBeGreaterThan(day1)
  })

  it('returns a larger value for a later time on the same date', () => {
    const earlier = datetimeToSortKey('2024-01-01', '20:00')
    const later = datetimeToSortKey('2024-01-01', '21:00')
    expect(later).toBeGreaterThan(earlier)
  })

  it('midnight-crossing: 23:00 on day 1 sorts before 00:20 on day 2', () => {
    const end = datetimeToSortKey('2024-01-01', '23:00')
    const wrap = datetimeToSortKey('2024-01-02', '00:20')
    expect(wrap).toBeGreaterThan(end)
  })
})

describe('uniteSchedules — midnight-crossing sort', () => {
  it('sorts participants correctly when parent ends at 23:00 and child starts at 00:20 next day', () => {
    const parent = makeSchedule({
      id: 'parent1',
      name: 'Seder 1',
      stations: [{
        stationConfigId: 's1',
        stationName: 'Alpha',
        stationType: 'time-based',
        participants: [
          makeParticipant('Alice', '22:00', '23:00', '2024-01-01'),
          makeParticipant('Bob', '23:00', '00:00', '2024-01-01'),
        ],
      }],
    })

    const child = makeSchedule({
      id: 'child1',
      name: 'Seder 2',
      parentScheduleId: 'parent1',
      stations: [{
        stationConfigId: 's1',
        stationName: 'Alpha',
        stationType: 'time-based',
        participants: [
          makeParticipant('Charlie', '00:20', '01:20', '2024-01-02'),
          makeParticipant('Dave', '01:20', '02:20', '2024-01-02'),
        ],
      }],
    })

    const unified = uniteSchedules(parent, child)
    const names = unified.stations[0].participants.map(p => p.name)

    // Alice (22:00 day1) → Bob (23:00 day1) → Charlie (00:20 day2) → Dave (01:20 day2)
    expect(names).toEqual(['Alice', 'Bob', 'Charlie', 'Dave'])
  })

  it('sorts correctly without midnight crossing (normal case)', () => {
    const parent = makeSchedule({
      id: 'parent1',
      name: 'Seder 1',
      stations: [{
        stationConfigId: 's1',
        stationName: 'Alpha',
        stationType: 'time-based',
        participants: [
          makeParticipant('Alice', '20:00', '21:00', '2024-01-01'),
          makeParticipant('Bob', '21:00', '22:00', '2024-01-01'),
        ],
      }],
    })

    const child = makeSchedule({
      id: 'child1',
      name: 'Seder 2',
      parentScheduleId: 'parent1',
      stations: [{
        stationConfigId: 's1',
        stationName: 'Alpha',
        stationType: 'time-based',
        participants: [
          makeParticipant('Charlie', '22:00', '23:00', '2024-01-01'),
        ],
      }],
    })

    const unified = uniteSchedules(parent, child)
    const names = unified.stations[0].participants.map(p => p.name)

    expect(names).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  it('uses parent name, not child name', () => {
    const parent = makeSchedule({ id: 'p1', name: 'Parent Round' })
    const child = makeSchedule({ id: 'c1', name: 'Child Round', parentScheduleId: 'p1' })
    const unified = uniteSchedules(parent, child)
    expect(unified.name).toBe('Parent Round')
  })

  it('uses parent quote and author, not child', () => {
    const parent = makeSchedule({ id: 'p1', name: 'P', quote: 'Parent quote', quoteAuthor: 'Parent author' })
    const child = makeSchedule({ id: 'c1', name: 'C', parentScheduleId: 'p1', quote: 'Child quote', quoteAuthor: 'Child author' })
    const unified = uniteSchedules(parent, child)
    expect(unified.quote).toBe('Parent quote')
    expect(unified.quoteAuthor).toBe('Parent author')
  })

  it('includes station only in parent', () => {
    const parent = makeSchedule({
      id: 'p1',
      name: 'P',
      stations: [{
        stationConfigId: 's1',
        stationName: 'Alpha',
        stationType: 'time-based',
        participants: [makeParticipant('Alice', '20:00', '21:00', '2024-01-01')],
      }, {
        stationConfigId: 's2',
        stationName: 'Beta',
        stationType: 'time-based',
        participants: [makeParticipant('Eve', '20:00', '21:00', '2024-01-01')],
      }],
    })
    const child = makeSchedule({
      id: 'c1',
      name: 'C',
      parentScheduleId: 'p1',
      stations: [{
        stationConfigId: 's1',
        stationName: 'Alpha',
        stationType: 'time-based',
        participants: [makeParticipant('Bob', '21:00', '22:00', '2024-01-01')],
      }],
    })
    const unified = uniteSchedules(parent, child)
    const stationNames = unified.stations.map(s => s.stationName)
    expect(stationNames).toContain('Alpha')
    expect(stationNames).toContain('Beta')
    const beta = unified.stations.find(s => s.stationName === 'Beta')
    expect(beta?.participants.map(p => p.name)).toEqual(['Eve'])
  })

  it('participant date is included in unified schedule', () => {
    const parent = makeSchedule({
      id: 'p1',
      name: 'P',
      stations: [{
        stationConfigId: 's1',
        stationName: 'Alpha',
        stationType: 'time-based',
        participants: [makeParticipant('Alice', '23:00', '00:00', '2024-01-01')],
      }],
    })
    const child = makeSchedule({
      id: 'c1',
      name: 'C',
      parentScheduleId: 'p1',
      stations: [{
        stationConfigId: 's1',
        stationName: 'Alpha',
        stationType: 'time-based',
        participants: [makeParticipant('Bob', '00:20', '01:20', '2024-01-02')],
      }],
    })
    const unified = uniteSchedules(parent, child)
    const alice = unified.stations[0].participants.find(p => p.name === 'Alice')
    const bob = unified.stations[0].participants.find(p => p.name === 'Bob')
    expect(alice?.date).toBe('2024-01-01')
    expect(bob?.date).toBe('2024-01-02')
  })
})

describe('buildContinueRoundQueue — midnight-crossing sort', () => {
  it('first participant (23:00 day1) sorts before midnight-crossing participants, not last', () => {
    // Regression test: timeToMinutes(23:00) = 1380 > timeToMinutes(00:20) = 20,
    // so without date-aware comparison the 23:00 participant would incorrectly sort last.
    const previousSchedule = makeSchedule({
      id: 'p1',
      stations: [{
        stationConfigId: 's1',
        stationName: 'Alpha',
        stationType: 'time-based',
        participants: [
          makeParticipant('Henry', '23:00', '00:20', '2024-01-01'),
          makeParticipant('Sahar', '00:20', '01:40', '2024-01-02'),
          makeParticipant('Shalom', '01:40', '03:00', '2024-01-02'),
          makeParticipant('Dave', '03:00', '04:20', '2024-01-02'),
        ],
      }],
    })

    const groupMembers = [
      { name: 'Henry', availability: 'base' as const },
      { name: 'Sahar', availability: 'base' as const },
      { name: 'Shalom', availability: 'base' as const },
      { name: 'Dave', availability: 'base' as const },
    ]

    const queue = buildContinueRoundQueue(previousSchedule, groupMembers)

    // Henry started earliest (23:00 day1) → must be first in queue
    expect(queue[0]).toBe('Henry')
    // Remaining order: Sahar (00:20), Shalom (01:40), Dave (03:00)
    expect(queue[1]).toBe('Sahar')
    expect(queue[2]).toBe('Shalom')
    expect(queue[3]).toBe('Dave')
  })
})

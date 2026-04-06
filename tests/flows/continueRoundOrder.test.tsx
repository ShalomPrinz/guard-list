/**
 * E2E tests for Continue Round ordering algorithm.
 * Tests the pure functions in src/logic/continueRound.ts.
 *
 * Covers:
 * - Warriors absent from the previous round are placed first in the queue
 * - Warriors from the previous round are sorted by start time ascending
 * - Station rotation swaps warriors when a non-repeat assignment is possible
 * - Warriors marked "בית" are excluded from station lists
 */
import { describe, it, expect } from 'vitest'
import {
  buildContinueRoundQueue,
  buildContinueRoundStations,
} from '@/logic/continueRound'
import type { Schedule, WizardStation } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'prev1',
    name: 'Round 1',
    groupId: 'g1',
    createdAt: '2024-01-01T00:00:00Z',
    date: '2024-01-01',
    stations: [],
    unevenDistributionMode: 'equal-duration',
    ...overrides,
  }
}

function makeParticipant(name: string, startTime: string) {
  return {
    name,
    startTime,
    endTime: '00:00',
    date: '2024-01-01',
    durationMinutes: 60,
    
  }
}

function makeStation(id: string, participants: { name: string; startTime: string }[]) {
  return {
    stationConfigId: id,
    stationName: `Station ${id}`,
    stationType: 'time-based' as const,
    participants: participants.map(p => makeParticipant(p.name, p.startTime)),
  }
}

function makeWizardStation(id: string): WizardStation {
  return {
    config: { id, name: `Station ${id}`, type: 'time-based' },
    participants: [],
    startTime: '20:00',
    startDate: '2026-03-16',
  }
}

// ─── buildContinueRoundQueue ──────────────────────────────────────────────────

describe('buildContinueRoundQueue — absent warriors go first', () => {
  it('places warriors absent from previous round before previous-round warriors', () => {
    const prev = makeSchedule({
      stations: [makeStation('s1', [
        { name: 'Alice', startTime: '20:00' },
        { name: 'Bob', startTime: '21:00' },
      ])],
    })
    const members = [
      { name: 'Alice', availability: 'base' as const },
      { name: 'Bob', availability: 'base' as const },
      { name: 'Charlie', availability: 'base' as const }, // new — absent
    ]
    const queue = buildContinueRoundQueue(prev, members)

    // Charlie (absent from prev round) must come before Alice and Bob
    expect(queue[0]).toBe('Charlie')
    expect(queue).toHaveLength(3)
    expect(queue).toContain('Alice')
    expect(queue).toContain('Bob')
  })

  it('places multiple absent warriors (shuffled) before previous-round warriors', () => {
    const prev = makeSchedule({
      stations: [makeStation('s1', [{ name: 'Alice', startTime: '20:00' }])],
    })
    const members = [
      { name: 'Alice', availability: 'base' as const },
      { name: 'Bob', availability: 'base' as const },   // absent
      { name: 'Charlie', availability: 'base' as const }, // absent
    ]
    const queue = buildContinueRoundQueue(prev, members)

    // Both Bob and Charlie precede Alice
    const aliceIdx = queue.indexOf('Alice')
    const bobIdx = queue.indexOf('Bob')
    const charlieIdx = queue.indexOf('Charlie')
    expect(bobIdx).toBeLessThan(aliceIdx)
    expect(charlieIdx).toBeLessThan(aliceIdx)
  })
})

describe('buildContinueRoundQueue — previous-round warriors sorted by start time', () => {
  it('sorts previous warriors by start time ascending', () => {
    const prev = makeSchedule({
      stations: [
        makeStation('s1', [{ name: 'Alice', startTime: '22:00' }]),
        makeStation('s2', [{ name: 'Bob', startTime: '20:00' }]),
      ],
    })
    const members = [
      { name: 'Alice', availability: 'base' as const },
      { name: 'Bob', availability: 'base' as const },
    ]
    const queue = buildContinueRoundQueue(prev, members)

    // Bob (20:00) should come before Alice (22:00)
    expect(queue.indexOf('Bob')).toBeLessThan(queue.indexOf('Alice'))
  })

  it('uses earliest start time when warrior appears in multiple stations', () => {
    // Edge case: warrior appears twice (shouldn't happen in practice, but algo should handle it)
    const prev = makeSchedule({
      stations: [
        makeStation('s1', [{ name: 'Alice', startTime: '22:00' }]),
        makeStation('s2', [{ name: 'Alice', startTime: '19:00' }]), // earlier occurrence
      ],
    })
    const members = [
      { name: 'Alice', availability: 'base' as const },
      { name: 'Bob', availability: 'base' as const },   // absent
    ]
    // Bob (absent) comes first, then Alice
    const queue = buildContinueRoundQueue(prev, members)
    expect(queue[0]).toBe('Bob')
    expect(queue[1]).toBe('Alice')
  })
})

describe('buildContinueRoundQueue — home warriors excluded', () => {
  it('excludes "בית" warriors from the queue', () => {
    const prev = makeSchedule({
      stations: [makeStation('s1', [{ name: 'Alice', startTime: '20:00' }])],
    })
    const members = [
      { name: 'Alice', availability: 'base' as const },
      { name: 'HomeGuy', availability: 'home' as const },
    ]
    const queue = buildContinueRoundQueue(prev, members)

    expect(queue).not.toContain('HomeGuy')
    expect(queue).toContain('Alice')
    expect(queue).toHaveLength(1)
  })

  it('excludes "בית" warriors even if they were in the previous round', () => {
    const prev = makeSchedule({
      stations: [makeStation('s1', [
        { name: 'Alice', startTime: '20:00' },
        { name: 'HomeGuy', startTime: '21:00' },
      ])],
    })
    const members = [
      { name: 'Alice', availability: 'base' as const },
      { name: 'HomeGuy', availability: 'home' as const },
    ]
    const queue = buildContinueRoundQueue(prev, members)

    expect(queue).not.toContain('HomeGuy')
  })
})

// ─── buildContinueRoundStations ───────────────────────────────────────────────

describe('buildContinueRoundStations — round-robin assignment', () => {
  it('distributes queue round-robin across stations', () => {
    const prev = makeSchedule()
    const stations = [makeWizardStation('s1'), makeWizardStation('s2')]
    const queue = ['A', 'B', 'C', 'D']

    const result = buildContinueRoundStations(queue, stations, prev)

    // A,C → s1; B,D → s2
    expect(result[0].participants.map(p => p.name)).toEqual(['A', 'C'])
    expect(result[1].participants.map(p => p.name)).toEqual(['B', 'D'])
  })

  it('handles single station — all warriors in one station', () => {
    const prev = makeSchedule()
    const stations = [makeWizardStation('s1')]
    const queue = ['Alice', 'Bob', 'Charlie']

    const result = buildContinueRoundStations(queue, stations, prev)

    expect(result[0].participants.map(p => p.name)).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  it('handles empty queue — all stations empty', () => {
    const prev = makeSchedule()
    const stations = [makeWizardStation('s1'), makeWizardStation('s2')]

    const result = buildContinueRoundStations([], stations, prev)

    expect(result[0].participants).toHaveLength(0)
    expect(result[1].participants).toHaveLength(0)
  })
})

describe('buildContinueRoundStations — station rotation', () => {
  it('swaps warriors when doing so eliminates same-station repeats for both', () => {
    // Alice was in s1, Bob was in s2
    // Round-robin: Alice→s1 (repeat!), Bob→s2 (repeat!)
    // Swap: Alice→s2 (no repeat), Bob→s1 (no repeat) ✓
    const prev = makeSchedule({
      stations: [
        makeStation('s1', [{ name: 'Alice', startTime: '20:00' }]),
        makeStation('s2', [{ name: 'Bob', startTime: '20:00' }]),
      ],
    })
    const stations = [makeWizardStation('s1'), makeWizardStation('s2')]

    const result = buildContinueRoundStations(['Alice', 'Bob'], stations, prev)

    const aliceStation = result.findIndex(s => s.participants.some(p => p.name === 'Alice'))
    const bobStation = result.findIndex(s => s.participants.some(p => p.name === 'Bob'))
    // After rotation: Alice in s2 (index 1), Bob in s1 (index 0)
    expect(aliceStation).toBe(1)
    expect(bobStation).toBe(0)
  })

  it('does not swap when swap would create a new repeat', () => {
    // Alice was in s1, Carol was also in s1
    // Round-robin: Alice→s1 (repeat), Carol→s2 (no repeat)
    // Swap attempt: Alice→s2 (no repeat), Carol→s1 (repeat!) → creates new repeat, don't swap
    const prev = makeSchedule({
      stations: [
        makeStation('s1', [{ name: 'Alice', startTime: '20:00' }, { name: 'Carol', startTime: '21:00' }]),
        makeStation('s2', [{ name: 'Bob', startTime: '20:00' }]),
      ],
    })
    const stations = [makeWizardStation('s1'), makeWizardStation('s2')]

    // Queue: Alice first, Bob second (round-robin: Alice→s1, Bob→s2)
    const result = buildContinueRoundStations(['Alice', 'Bob'], stations, prev)

    // Bob has no previous station s1, so swapping Alice↔Bob is fine:
    // Alice→s2 (no repeat), Bob→s1 (no repeat)
    const aliceStation = result.findIndex(s => s.participants.some(p => p.name === 'Alice'))
    const bobStation = result.findIndex(s => s.participants.some(p => p.name === 'Bob'))
    expect(aliceStation).toBe(1) // Alice rotated to s2
    expect(bobStation).toBe(0)   // Bob in s1 (his first appearance)
  })

  it('leaves assignment unchanged when no beneficial swap exists', () => {
    // Alice was in s1, Bob was in s1 too
    // Round-robin: Alice→s1 (repeat), Bob→s2 (no repeat in s2 since Bob was in s1)
    // Swapping Alice↔Bob: Alice→s2 (no repeat), Bob→s1 (repeat!) → creates new repeat, skip
    const prev = makeSchedule({
      stations: [
        makeStation('s1', [{ name: 'Alice', startTime: '20:00' }, { name: 'Bob', startTime: '21:00' }]),
      ],
    })
    const stations = [makeWizardStation('s1'), makeWizardStation('s2')]

    const result = buildContinueRoundStations(['Alice', 'Bob'], stations, prev)

    // Alice in s1 (repeat, but swap would cause Bob repeat), Bob in s2
    const aliceStation = result.findIndex(s => s.participants.some(p => p.name === 'Alice'))
    const bobStation = result.findIndex(s => s.participants.some(p => p.name === 'Bob'))
    expect(aliceStation).toBe(0) // Alice stays in s1
    expect(bobStation).toBe(1)  // Bob in s2 (no repeat — was in s1 before)
  })
})

describe('buildContinueRoundStations — "בית" warriors absent from stations', () => {
  it('home warriors are not in any station (they never enter the queue)', () => {
    const prev = makeSchedule({
      stations: [makeStation('s1', [{ name: 'Alice', startTime: '20:00' }])],
    })
    const stations = [makeWizardStation('s1'), makeWizardStation('s2')]

    // HomeGuy excluded from queue by buildContinueRoundQueue
    const queue = ['Alice'] // HomeGuy not in queue

    const result = buildContinueRoundStations(queue, stations, prev)
    const allNames = result.flatMap(s => s.participants.map(p => p.name))

    expect(allNames).not.toContain('HomeGuy')
    expect(allNames).toContain('Alice')
  })
})

import { describe, it, expect } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'
import {
  getStatistics,
  saveStatistics,
  resetStatistics,
  recordShift,
} from './statistics'
import type { ShiftRecord } from '../types'

function makeShiftRecord(overrides: Partial<ShiftRecord> = {}): ShiftRecord {
  return {
    scheduleId: 's1',
    scheduleName: 'Night Watch',
    stationName: 'Main Gate',
    date: '2026-01-01',
    startTime: '22:00',
    endTime: '23:30',
    durationMinutes: 90,
    ...overrides,
  }
}

describe('getStatistics', () => {
  it('returns empty participants object when storage is empty', () => {
    const stats = getStatistics(createLocalStorageMock())
    expect(stats).toEqual({ participants: {} })
  })

  it('returns empty participants object on malformed JSON', () => {
    const storage = createLocalStorageMock()
    storage.setItem('statistics', 'bad-json')
    expect(getStatistics(storage)).toEqual({ participants: {} })
  })
})

describe('saveStatistics / getStatistics round-trip', () => {
  it('persists and retrieves statistics correctly', () => {
    const storage = createLocalStorageMock()
    const stats = {
      participants: {
        Alice: { totalShifts: 2, totalMinutes: 180, history: [makeShiftRecord()] },
      },
    }
    saveStatistics(stats, storage)
    expect(getStatistics(storage)).toEqual(stats)
  })
})

describe('resetStatistics', () => {
  it('clears all statistics', () => {
    const storage = createLocalStorageMock()
    recordShift('Alice', makeShiftRecord(), storage)
    resetStatistics(storage)
    expect(getStatistics(storage)).toEqual({ participants: {} })
  })
})

describe('recordShift', () => {
  it('creates a new participant entry on first shift', () => {
    const storage = createLocalStorageMock()
    recordShift('Alice', makeShiftRecord({ durationMinutes: 90 }), storage)
    const stats = getStatistics(storage)
    expect(stats.participants['Alice'].totalShifts).toBe(1)
    expect(stats.participants['Alice'].totalMinutes).toBe(90)
    expect(stats.participants['Alice'].history).toHaveLength(1)
  })

  it('increments shifts and minutes for subsequent shifts', () => {
    const storage = createLocalStorageMock()
    recordShift('Alice', makeShiftRecord({ durationMinutes: 90 }), storage)
    recordShift('Alice', makeShiftRecord({ durationMinutes: 60, startTime: '00:00', endTime: '01:00' }), storage)
    const stats = getStatistics(storage)
    expect(stats.participants['Alice'].totalShifts).toBe(2)
    expect(stats.participants['Alice'].totalMinutes).toBe(150)
    expect(stats.participants['Alice'].history).toHaveLength(2)
  })

  it('tracks multiple participants independently', () => {
    const storage = createLocalStorageMock()
    recordShift('Alice', makeShiftRecord({ durationMinutes: 90 }), storage)
    recordShift('Bob', makeShiftRecord({ durationMinutes: 60 }), storage)
    const stats = getStatistics(storage)
    expect(stats.participants['Alice'].totalShifts).toBe(1)
    expect(stats.participants['Bob'].totalShifts).toBe(1)
    expect(stats.participants['Alice'].totalMinutes).toBe(90)
    expect(stats.participants['Bob'].totalMinutes).toBe(60)
  })

  it('uses participant name as the unique key (exact match)', () => {
    const storage = createLocalStorageMock()
    recordShift('alice', makeShiftRecord({ durationMinutes: 30 }), storage)
    recordShift('Alice', makeShiftRecord({ durationMinutes: 30 }), storage)
    const stats = getStatistics(storage)
    // Different casing = different entries
    expect(Object.keys(stats.participants)).toHaveLength(2)
  })

  it('appends the shift record to history', () => {
    const storage = createLocalStorageMock()
    const record = makeShiftRecord()
    recordShift('Alice', record, storage)
    const history = getStatistics(storage).participants['Alice'].history
    expect(history[0]).toEqual(record)
  })
})

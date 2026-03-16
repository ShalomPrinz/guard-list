import { describe, it, expect } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'
import {
  getSchedules,
  saveSchedules,
  getScheduleById,
  addSchedule,
  deleteSchedule,
} from './schedules'
import type { Schedule } from '../types'

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

describe('getSchedules', () => {
  it('returns empty array when storage is empty', () => {
    expect(getSchedules(createLocalStorageMock())).toEqual([])
  })

  it('returns empty array on malformed JSON', () => {
    const storage = createLocalStorageMock()
    storage.setItem('schedules', 'bad-json')
    expect(getSchedules(storage)).toEqual([])
  })
})

describe('saveSchedules / getSchedules round-trip', () => {
  it('persists and retrieves schedules correctly', () => {
    const storage = createLocalStorageMock()
    const schedules = [makeSchedule(), makeSchedule({ id: 's2', name: 'Day Watch' })]
    saveSchedules(schedules, storage)
    expect(getSchedules(storage)).toEqual(schedules)
  })
})

describe('getScheduleById', () => {
  it('finds a schedule by id', () => {
    const storage = createLocalStorageMock()
    saveSchedules([makeSchedule({ id: 's1' }), makeSchedule({ id: 's2' })], storage)
    expect(getScheduleById('s1', storage)?.name).toBe('Night Watch')
  })

  it('returns undefined for unknown id', () => {
    expect(getScheduleById('nope', createLocalStorageMock())).toBeUndefined()
  })
})

describe('addSchedule', () => {
  it('appends a schedule to the list', () => {
    const storage = createLocalStorageMock()
    addSchedule(makeSchedule({ id: 's1' }), storage)
    addSchedule(makeSchedule({ id: 's2' }), storage)
    expect(getSchedules(storage)).toHaveLength(2)
  })
})

describe('deleteSchedule', () => {
  it('removes the schedule with the given id', () => {
    const storage = createLocalStorageMock()
    saveSchedules([makeSchedule({ id: 's1' }), makeSchedule({ id: 's2' })], storage)
    deleteSchedule('s1', storage)
    expect(getSchedules(storage)).toHaveLength(1)
    expect(getScheduleById('s1', storage)).toBeUndefined()
  })

  it('is a no-op for unknown id', () => {
    const storage = createLocalStorageMock()
    saveSchedules([makeSchedule()], storage)
    deleteSchedule('ghost', storage)
    expect(getSchedules(storage)).toHaveLength(1)
  })
})

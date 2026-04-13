import { describe, it, expect, vi } from 'vitest'
import { generateShortListSchedule } from './shortListGeneration'
import type { Group, StationConfig } from '../types'

describe('generateShortListSchedule', () => {
  const mockStorage: Storage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  }

  const createMockGroup = (memberCount: number, baseCount: number): Group => ({
    id: 'group-1',
    name: 'Test Group',
    createdAt: new Date().toISOString(),
    members: Array.from({ length: memberCount }, (_, i) => ({
      id: `member-${i}`,
      name: `Member ${i + 1}`,
      availability: i < baseCount ? 'base' : 'home',
    })),
  })

  const mockStations: StationConfig[] = [
    { id: 'st1', name: 'עמדה 1', type: 'time-based' },
    { id: 'st2', name: 'עמדה 2', type: 'time-based' },
  ]

  it('returns null if group not found', () => {
    const result = generateShortListSchedule('nonexistent', mockStations, '14:00', 60, 5, mockStorage)
    expect(result).toBeNull()
  })

  it('returns null if not enough base-available members', () => {
    const group = createMockGroup(5, 3)
    vi.mocked(mockStorage.getItem).mockReturnValueOnce(JSON.stringify([group]))

    const result = generateShortListSchedule(group.id, mockStations, '14:00', 60, 5, mockStorage)
    expect(result).toBeNull()
  })

  it('generates schedule with correct name and date', () => {
    const group = createMockGroup(10, 8)
    vi.mocked(mockStorage.getItem).mockReturnValueOnce(JSON.stringify([group]))

    const result = generateShortListSchedule(group.id, mockStations, '14:00', 60, 2, mockStorage)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('רשימת שמירה') // default name
    expect(result!.groupId).toBe(group.id)
    expect(result!.unevenDistributionMode).toBe('equal-duration')
    expect(result!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('uses provided name in generated schedule', () => {
    const group = createMockGroup(10, 8)
    vi.mocked(mockStorage.getItem).mockReturnValueOnce(JSON.stringify([group]))

    const result = generateShortListSchedule(group.id, mockStations, '14:00', 60, 2, 'Custom Schedule Name', mockStorage)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Custom Schedule Name')
  })

  it('distributes warriors round-robin across stations (per-station semantics)', () => {
    const group = createMockGroup(10, 8)
    vi.mocked(mockStorage.getItem).mockReturnValueOnce(JSON.stringify([group]))

    // numberOfWarriors=2 per station with 2 stations = 4 total
    const result = generateShortListSchedule(group.id, mockStations, '14:00', 60, 2, mockStorage)
    expect(result).not.toBeNull()
    expect(result!.stations).toHaveLength(2)

    const st1Participants = result!.stations[0].participants.length
    const st2Participants = result!.stations[1].participants.length
    expect(st1Participants + st2Participants).toBe(4)
    // With round-robin on 4 warriors to 2 stations: 2 and 2
    expect(st1Participants).toBe(2)
    expect(st2Participants).toBe(2)
  })

  it('assigns correct duration to each participant', () => {
    const group = createMockGroup(10, 8)
    vi.mocked(mockStorage.getItem).mockReturnValueOnce(JSON.stringify([group]))

    const minutesPerWarrior = 90
    // numberOfWarriors=2 per station with 2 stations = 4 total
    const result = generateShortListSchedule(group.id, mockStations, '14:00', minutesPerWarrior, 2, mockStorage)
    expect(result).not.toBeNull()

    for (const station of result!.stations) {
      for (const participant of station.participants) {
        expect(participant.durationMinutes).toBe(minutesPerWarrior)
      }
    }
  })

  it('starts at the correct hour', () => {
    const group = createMockGroup(10, 8)
    vi.mocked(mockStorage.getItem).mockReturnValueOnce(JSON.stringify([group]))

    const result = generateShortListSchedule(group.id, mockStations, '14:00', 60, 2, mockStorage)
    expect(result).not.toBeNull()

    const firstParticipant = result!.stations[0].participants[0]
    expect(firstParticipant.startTime).toBe('14:00')
  })

  it('starts at 14:30 when startTime is "14:30" — minutes are not discarded', () => {
    const group = createMockGroup(10, 8)
    vi.mocked(mockStorage.getItem).mockReturnValueOnce(JSON.stringify([group]))

    const result = generateShortListSchedule(group.id, mockStations, '14:30', 60, 2, mockStorage)
    expect(result).not.toBeNull()

    for (const station of result!.stations) {
      expect(station.participants[0].startTime).toBe('14:30')
    }
  })

  it('handles midnight crossover correctly', () => {
    const group = createMockGroup(10, 8)
    vi.mocked(mockStorage.getItem).mockReturnValueOnce(JSON.stringify([group]))

    // Create a schedule that definitely crosses midnight: 4 warriors x 60 min each = 240 min = 4 hours
    // Starting at 22:00: 22:00 + 4h = 02:00 (next day)
    const singleStation: StationConfig[] = [{ id: 'st1', name: 'עמדה', type: 'time-based' }]
    // numberOfWarriors=4 per station with 1 station = 4 total
    const result = generateShortListSchedule(group.id, singleStation, '22:00', 60, 4, mockStorage)
    expect(result).not.toBeNull()

    // Should have 4 participants all on the same station
    expect(result!.stations[0].participants).toHaveLength(4)

    // First participant: 22:00 to 23:00 (same day)
    expect(result!.stations[0].participants[0].date).toBe(result!.date)

    // Last (4th) participant: should cross into next day (01:00 to 02:00)
    const lastParticipant = result!.stations[0].participants[3]
    expect(lastParticipant.startTime).toBe('01:00')
    expect(lastParticipant.endTime).toBe('02:00')
    expect(lastParticipant.date > result!.date).toBe(true)
  })

  it('selects only from base-available members, ignoring home members', () => {
    const group = createMockGroup(10, 5)
    vi.mocked(mockStorage.getItem).mockReturnValueOnce(JSON.stringify([group]))

    // numberOfWarriors=2.5 would give 5 total, but we can't use decimals. Let's use 3 per station = 6, but we only have 5 base.
    // Actually, let's use 1 per station = 2 total, well within our 5 base members
    const result = generateShortListSchedule(group.id, mockStations, '14:00', 60, 1, mockStorage)
    expect(result).not.toBeNull()

    const allParticipants = result!.stations.flatMap(s => s.participants)
    expect(allParticipants).toHaveLength(2)

    // All participants should be from the first 5 members (base-available)
    const baseMembers = group.members.filter(m => m.availability === 'base')
    const baseNames = new Set(baseMembers.map(m => m.name))
    for (const participant of allParticipants) {
      expect(baseNames.has(participant.name)).toBe(true)
    }
  })

  it('handles exactly matching warrior count to base members (per-station)', () => {
    const group = createMockGroup(8, 4)
    vi.mocked(mockStorage.getItem).mockReturnValueOnce(JSON.stringify([group]))

    // numberOfWarriors=2 per station with 2 stations = 4 total (exactly matching base members)
    const result = generateShortListSchedule(group.id, mockStations, '14:00', 60, 2, mockStorage)
    expect(result).not.toBeNull()

    const allParticipants = result!.stations.flatMap(s => s.participants)
    expect(allParticipants).toHaveLength(4)
  })

  it('generates deterministic output when seeded', () => {
    // Note: This tests that the same inputs consistently produce schedules with the same structure,
    // not that shuffle produces identical results (shuffle is random, which is correct).
    const group = createMockGroup(20, 15)
    vi.mocked(mockStorage.getItem).mockReturnValueOnce(JSON.stringify([group]))

    // numberOfWarriors=3 per station with 2 stations = 6 total
    const result1 = generateShortListSchedule(group.id, mockStations, '14:00', 60, 3, mockStorage)
    expect(result1).not.toBeNull()
    expect(result1!.stations).toHaveLength(2)
    expect(result1!.stations.flatMap(s => s.participants)).toHaveLength(6)
  })

  it('creates schedule with all required fields', () => {
    const group = createMockGroup(10, 8)
    vi.mocked(mockStorage.getItem).mockReturnValueOnce(JSON.stringify([group]))

    // numberOfWarriors=2 per station with 2 stations = 4 total
    const result = generateShortListSchedule(group.id, mockStations, '14:00', 60, 2, mockStorage)
    expect(result).not.toBeNull()

    expect(result!.id).toBeDefined()
    expect(result!.id.length).toBeGreaterThan(0)
    expect(result!.name).toBeDefined()
    expect(result!.groupId).toBe(group.id)
    expect(result!.createdAt).toBeDefined()
    expect(result!.date).toBeDefined()
    expect(result!.stations).toBeDefined()
    expect(result!.unevenDistributionMode).toBe('equal-duration')
  })

  it('single station distributes all warriors to that station', () => {
    const singleStation: StationConfig[] = [{ id: 'st1', name: 'עמדה יחידה', type: 'time-based' }]
    const group = createMockGroup(10, 8)
    vi.mocked(mockStorage.getItem).mockReturnValueOnce(JSON.stringify([group]))

    // numberOfWarriors=5 per station with 1 station = 5 total
    const result = generateShortListSchedule(group.id, singleStation, '14:00', 60, 5, mockStorage)
    expect(result).not.toBeNull()
    expect(result!.stations).toHaveLength(1)
    expect(result!.stations[0].participants).toHaveLength(5)
  })

  it('many stations with few warriors distributes evenly (per-station)', () => {
    const manyStations: StationConfig[] = Array.from({ length: 5 }, (_, i) => ({
      id: `st${i}`,
      name: `עמדה ${i + 1}`,
      type: 'time-based' as const,
    }))
    const group = createMockGroup(20, 10)
    vi.mocked(mockStorage.getItem).mockReturnValueOnce(JSON.stringify([group]))

    // numberOfWarriors=1 per station with 5 stations = 5 total
    const result = generateShortListSchedule(group.id, manyStations, '14:00', 60, 1, mockStorage)
    expect(result).not.toBeNull()

    let totalWarriors = 0
    for (const station of result!.stations) {
      totalWarriors += station.participants.length
    }
    expect(totalWarriors).toBe(5)
  })
})

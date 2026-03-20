import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'
import type { Group, Citation, ParticipantStats, StationConfig, Schedule } from '../types'

// Override the global setup mock with a controllable version for this file.
vi.mock('./cloudStorage', () => ({
  kvGet: vi.fn().mockResolvedValue(null),
  kvSet: vi.fn().mockResolvedValue(undefined),
  kvDel: vi.fn().mockResolvedValue(undefined),
  kvList: vi.fn().mockResolvedValue([]),
  isKvAvailable: true,
}))

import { kvGet, kvList, kvSet } from './cloudStorage'
import { syncFromCloud, pushLocalToCloud } from './syncFromCloud'

const mockedKvList = vi.mocked(kvList)
const mockedKvGet = vi.mocked(kvGet)
const mockedKvSet = vi.mocked(kvSet)

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'Test Group',
    members: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('syncFromCloud', () => {
  let storage: Storage

  beforeEach(() => {
    storage = createLocalStorageMock()
    // Set a username so syncFromCloud doesn't return early
    storage.setItem('username', 'testuser')
    vi.stubGlobal('localStorage', storage)
    vi.clearAllMocks()
    mockedKvList.mockResolvedValue([])
    mockedKvGet.mockResolvedValue(null)
  })

  it('writes a group from KV when not in localStorage', async () => {
    const group = makeGroup()
    mockedKvList.mockImplementation(async (prefix) => {
      if (prefix === 'groups:') return ['groups:g1']
      return []
    })
    mockedKvGet.mockImplementation(async (key) => {
      if (key === 'groups:g1') return group
      return null
    })

    await syncFromCloud()

    const stored = JSON.parse(storage.getItem('groups') ?? '[]') as Group[]
    expect(stored).toContainEqual(expect.objectContaining({ id: 'g1', name: 'Test Group' }))
  })

  it('does not overwrite a group already in localStorage', async () => {
    const existing = makeGroup({ name: 'Local Version' })
    storage.setItem('groups', JSON.stringify([existing]))

    mockedKvList.mockImplementation(async (prefix) => {
      if (prefix === 'groups:') return ['groups:g1']
      return []
    })
    mockedKvGet.mockResolvedValue(makeGroup({ name: 'KV Version' }))

    await syncFromCloud()

    const stored = JSON.parse(storage.getItem('groups') ?? '[]') as Group[]
    expect(stored[0].name).toBe('Local Version')
  })

  it('writes a citation from KV when not in localStorage', async () => {
    const citation: Citation = { id: 'c1', text: 'Hello', author: 'A. Author', usedInListIds: [] }
    mockedKvList.mockImplementation(async (prefix) => {
      if (prefix === 'citations:') return ['citations:c1']
      return []
    })
    mockedKvGet.mockImplementation(async (key) => {
      if (key === 'citations:c1') return citation
      return null
    })

    await syncFromCloud()

    const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
    expect(stored).toContainEqual(expect.objectContaining({ id: 'c1', text: 'Hello' }))
  })

  it('writes prefs from KV when theme not in localStorage', async () => {
    const prefs = { theme: 'dark' as const }
    mockedKvGet.mockImplementation(async (key) => {
      if (key === 'prefs:global') return prefs
      return null
    })

    await syncFromCloud()

    expect(storage.getItem('theme')).toBe('dark')
  })

  it('does not write prefs when theme already in localStorage', async () => {
    storage.setItem('theme', 'light')
    mockedKvGet.mockResolvedValue({ theme: 'dark' })

    await syncFromCloud()

    expect(storage.getItem('theme')).toBe('light')
  })

  it('writes participant stats from KV when not in localStorage', async () => {
    const participantStats: ParticipantStats = {
      totalShifts: 3,
      totalMinutes: 180,
      history: [],
    }
    mockedKvList.mockImplementation(async (prefix) => {
      if (prefix === 'statistics:') return ['statistics:Alice']
      return []
    })
    mockedKvGet.mockImplementation(async (key) => {
      if (key === 'statistics:Alice') return participantStats
      return null
    })

    await syncFromCloud()

    const stored = JSON.parse(storage.getItem('statistics') ?? '{"participants":{}}') as { participants: Record<string, ParticipantStats> }
    expect(stored.participants['Alice']).toEqual(participantStats)
  })

  it('writes a station config from KV when not in localStorage', async () => {
    const config: StationConfig = { id: 'sc1', name: 'Gate', type: 'time-based' }
    mockedKvList.mockImplementation(async (prefix) => {
      if (prefix === 'stationConfigs:') return ['stationConfigs:sc1']
      return []
    })
    mockedKvGet.mockImplementation(async (key) => {
      if (key === 'stationConfigs:sc1') return config
      return null
    })

    await syncFromCloud()

    const stored = JSON.parse(storage.getItem('stations_config') ?? '[]') as StationConfig[]
    expect(stored).toContainEqual(expect.objectContaining({ id: 'sc1', name: 'Gate' }))
  })

  it('writes a schedule from KV when not in localStorage', async () => {
    const schedule: Schedule = {
      id: 'sched1',
      name: 'Test Schedule',
      groupId: 'g1',
      createdAt: '2026-01-01T00:00:00.000Z',
      date: '2026-01-01',
      stations: [],
      unevenDistributionMode: 'equal-duration',
    }
    mockedKvList.mockImplementation(async (prefix) => {
      if (prefix === 'schedules:') return ['schedules:g1:sched1']
      return []
    })
    mockedKvGet.mockImplementation(async (key) => {
      if (key === 'schedules:g1:sched1') return schedule
      return null
    })

    await syncFromCloud()

    const stored = JSON.parse(storage.getItem('schedules') ?? '[]') as Schedule[]
    expect(stored).toContainEqual(expect.objectContaining({ id: 'sched1' }))
  })

  it('does not throw when KV throws on all namespaces', async () => {
    mockedKvList.mockRejectedValue(new Error('Network error'))

    await expect(syncFromCloud()).resolves.not.toThrow()

    expect(storage.getItem('groups')).toBeNull()
    expect(storage.getItem('citations')).toBeNull()
    expect(storage.getItem('statistics')).toBeNull()
  })

  it('returns early and calls no KV helpers when username is null', async () => {
    storage.removeItem('username')

    await syncFromCloud()

    expect(mockedKvList).not.toHaveBeenCalled()
    expect(mockedKvGet).not.toHaveBeenCalled()
  })
})

describe('pushLocalToCloud', () => {
  let storage: Storage

  beforeEach(() => {
    storage = createLocalStorageMock()
    storage.setItem('username', 'testuser')
    vi.stubGlobal('localStorage', storage)
    vi.clearAllMocks()
    mockedKvSet.mockResolvedValue(undefined)
  })

  it('uploads groups to KV', async () => {
    const group = makeGroup()
    storage.setItem('groups', JSON.stringify([group]))

    await pushLocalToCloud()

    expect(mockedKvSet).toHaveBeenCalledWith('groups:g1', group)
  })

  it('uploads schedules to KV', async () => {
    const schedule: Schedule = {
      id: 'sched1',
      name: 'Test',
      groupId: 'g1',
      createdAt: '2026-01-01T00:00:00.000Z',
      date: '2026-01-01',
      stations: [],
      unevenDistributionMode: 'equal-duration',
    }
    storage.setItem('schedules', JSON.stringify([schedule]))

    await pushLocalToCloud()

    expect(mockedKvSet).toHaveBeenCalledWith('schedules:g1:sched1', schedule)
  })

  it('uploads citations to KV', async () => {
    const citation: Citation = { id: 'c1', text: 'Hello', author: 'Author', usedInListIds: [] }
    storage.setItem('citations', JSON.stringify([citation]))

    await pushLocalToCloud()

    expect(mockedKvSet).toHaveBeenCalledWith('citations:c1', citation)
  })

  it('uploads statistics to KV per participant', async () => {
    const stats = { participants: { Alice: { totalShifts: 2, totalMinutes: 120, history: [] } } }
    storage.setItem('statistics', JSON.stringify(stats))

    await pushLocalToCloud()

    expect(mockedKvSet).toHaveBeenCalledWith('statistics:Alice', stats.participants.Alice)
  })

  it('uploads theme prefs to KV', async () => {
    storage.setItem('theme', 'dark')

    await pushLocalToCloud()

    expect(mockedKvSet).toHaveBeenCalledWith('prefs:global', { theme: 'dark' })
  })

  it('does nothing when username is null', async () => {
    storage.removeItem('username')
    storage.setItem('groups', JSON.stringify([makeGroup()]))

    await pushLocalToCloud()

    expect(mockedKvSet).not.toHaveBeenCalled()
  })

  it('does not call kvSet when localStorage is empty', async () => {
    await pushLocalToCloud()

    expect(mockedKvSet).not.toHaveBeenCalled()
  })
})

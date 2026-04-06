import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'
import type { Group, Citation, ParticipantStats, StationConfig, Schedule } from '../types'

// Override the global setup mock with a controllable version for this file.
vi.mock('./cloudStorage', () => ({
  kvGet: vi.fn().mockResolvedValue(null),
  kvSet: vi.fn().mockResolvedValue(undefined),
  kvDel: vi.fn().mockResolvedValue(undefined),
  kvList: vi.fn().mockResolvedValue([]),
  kvMGet: vi.fn().mockResolvedValue([]),
  kvCrossReadGroupMember: vi.fn().mockResolvedValue(null),
  kvGroupGetMembers: vi.fn().mockResolvedValue(null),
  kvGetNoBackup: vi.fn().mockResolvedValue(false),
  isKvAvailable: true,
}))

import { kvGet, kvList, kvMGet, kvSet, kvCrossReadGroupMember, kvGroupGetMembers } from './cloudStorage'
import { syncFromCloud, pushLocalToCloud } from './syncFromCloud'

const mockedKvList = vi.mocked(kvList)
const mockedKvGet = vi.mocked(kvGet)
const mockedKvMGet = vi.mocked(kvMGet)
const mockedKvSet = vi.mocked(kvSet)
const mockedKvCrossReadGroupMember = vi.mocked(kvCrossReadGroupMember)
const mockedKvGroupGetMembers = vi.mocked(kvGroupGetMembers)

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
    mockedKvMGet.mockResolvedValue([])
    mockedKvCrossReadGroupMember.mockResolvedValue(null)
    mockedKvGroupGetMembers.mockResolvedValue(null)
  })

  it('skips entire sync body when synced flag is present in localStorage', async () => {
    storage.setItem('synced', '1')

    await syncFromCloud()

    expect(mockedKvList).not.toHaveBeenCalled()
    expect(mockedKvGet).not.toHaveBeenCalled()
    expect(mockedKvMGet).not.toHaveBeenCalled()
  })

  it('sets synced flag after successful sync', async () => {
    await syncFromCloud()

    expect(storage.getItem('synced')).toBe('1')
  })

  it('writes a group from KV when not in localStorage', async () => {
    const group = makeGroup()
    mockedKvList.mockImplementation(async (prefix) => {
      if (prefix === 'groups:') return ['groups:g1']
      return []
    })
    mockedKvMGet.mockImplementation(async (keys) => {
      if (keys.includes('groups:g1')) return [group]
      return keys.map(() => null)
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
    // kvMGet should not be called for already-local items — no missing keys

    await syncFromCloud()

    const stored = JSON.parse(storage.getItem('groups') ?? '[]') as Group[]
    expect(stored[0].name).toBe('Local Version')
    expect(mockedKvMGet).not.toHaveBeenCalledWith(expect.arrayContaining(['groups:g1']))
  })

  it('calls kvMGet for namespace with missing items', async () => {
    const group = makeGroup()
    mockedKvList.mockImplementation(async (prefix) => {
      if (prefix === 'groups:') return ['groups:g1']
      return []
    })
    mockedKvMGet.mockImplementation(async (keys) => {
      if (keys.includes('groups:g1')) return [group]
      return keys.map(() => null)
    })

    await syncFromCloud()

    expect(mockedKvMGet).toHaveBeenCalledWith(['groups:g1'])
  })

  it('writes a citation from KV when not in localStorage', async () => {
    const citation: Citation = { id: 'c1', text: 'Hello', author: 'A. Author', usedInListIds: [] }
    mockedKvList.mockImplementation(async (prefix) => {
      if (prefix === 'citations:') return ['citations:c1']
      return []
    })
    mockedKvMGet.mockImplementation(async (keys) => {
      if (keys.includes('citations:c1')) return [citation]
      return keys.map(() => null)
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
    mockedKvMGet.mockImplementation(async (keys) => {
      if (keys.includes('statistics:Alice')) return [participantStats]
      return keys.map(() => null)
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
    mockedKvMGet.mockImplementation(async (keys) => {
      if (keys.includes('stationConfigs:sc1')) return [config]
      return keys.map(() => null)
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
    mockedKvMGet.mockImplementation(async (keys) => {
      if (keys.includes('schedules:g1:sched1')) return [schedule]
      return keys.map(() => null)
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
    expect(mockedKvMGet).not.toHaveBeenCalled()
  })

  describe('share sync — group citation pull', () => {
    it('adds citations from group members not in local storage', async () => {
      storage.setItem('share:group', JSON.stringify({ groupId: 'grp_1', members: ['testuser', 'bob'], joinedAt: 1000 }))
      const partnerCitation: Citation = { id: 'pc1', text: 'partner text', author: 'B. Bob', usedInListIds: [] }
      mockedKvCrossReadGroupMember.mockResolvedValue({ citations: [partnerCitation], deleteLog: [] })

      await syncFromCloud()

      const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
      expect(stored).toContainEqual(expect.objectContaining({ id: 'pc1' }))
    })

    it('does not duplicate local citations from group member', async () => {
      storage.setItem('share:group', JSON.stringify({ groupId: 'grp_1', members: ['testuser', 'bob'], joinedAt: 1000 }))
      const localCitation: Citation = { id: 'c1', text: 'mine', author: 'A', usedInListIds: [] }
      storage.setItem('citations', JSON.stringify([localCitation]))
      mockedKvCrossReadGroupMember.mockResolvedValue({ citations: [localCitation], deleteLog: [] })

      await syncFromCloud()

      const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
      expect(stored.filter(c => c.id === 'c1')).toHaveLength(1)
    })

    it('applies group member delete log to local citations', async () => {
      storage.setItem('share:group', JSON.stringify({ groupId: 'grp_1', members: ['testuser', 'bob'], joinedAt: 1000 }))
      const localCitation: Citation = { id: 'c1', text: 'to delete', author: 'A', usedInListIds: [] }
      storage.setItem('citations', JSON.stringify([localCitation]))
      mockedKvCrossReadGroupMember.mockResolvedValue({ citations: [], deleteLog: ['c1'] })

      await syncFromCloud()

      const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
      expect(stored.find(c => c.id === 'c1')).toBeUndefined()
    })

    it('iterates all group members except self', async () => {
      storage.setItem('share:group', JSON.stringify({ groupId: 'grp_1', members: ['testuser', 'bob', 'carol'], joinedAt: 1000 }))
      mockedKvCrossReadGroupMember.mockResolvedValue({ citations: [], deleteLog: [] })

      await syncFromCloud()

      expect(mockedKvCrossReadGroupMember).toHaveBeenCalledTimes(2)
      expect(mockedKvCrossReadGroupMember).toHaveBeenCalledWith('bob')
      expect(mockedKvCrossReadGroupMember).toHaveBeenCalledWith('carol')
      expect(mockedKvCrossReadGroupMember).not.toHaveBeenCalledWith('testuser')
    })

    it('skips null cross-read results silently', async () => {
      storage.setItem('share:group', JSON.stringify({ groupId: 'grp_1', members: ['testuser', 'bob'], joinedAt: 1000 }))
      mockedKvCrossReadGroupMember.mockResolvedValue(null)

      await expect(syncFromCloud()).resolves.not.toThrow()
    })

    it('does not attempt cross-read when not in a group', async () => {
      await syncFromCloud()
      expect(mockedKvCrossReadGroupMember).not.toHaveBeenCalled()
    })
  })

  describe('share sync — group restoration from stale localStorage', () => {
    // Regression: when localStorage is wiped but KV still has share:groupId,
    // accepting a new invitation would fail with "Already in a group" from the server.
    // Fix: syncFromCloud restores share:group from KV so the client reflects real state.

    it('restores share:group when localStorage has no group but KV has share:groupId', async () => {
      mockedKvGet.mockImplementation(async (key: string) => {
        if (key === 'share:groupId') return 'grp_restored'
        return null
      })
      mockedKvGroupGetMembers.mockResolvedValue(['testuser', 'bob'])

      await syncFromCloud()

      const stored = JSON.parse(storage.getItem('share:group') ?? 'null') as { groupId: string; members: string[] } | null
      expect(stored?.groupId).toBe('grp_restored')
      expect(stored?.members).toEqual(['testuser', 'bob'])
    })

    it('does not overwrite existing local group when one is already set', async () => {
      storage.setItem('share:group', JSON.stringify({ groupId: 'grp_local', members: ['testuser'], joinedAt: 1000 }))
      mockedKvGet.mockImplementation(async (key: string) => {
        if (key === 'share:groupId') return 'grp_other'
        return null
      })
      mockedKvGroupGetMembers.mockResolvedValue(['testuser', 'carol'])

      await syncFromCloud()

      const stored = JSON.parse(storage.getItem('share:group') ?? 'null') as { groupId: string } | null
      expect(stored?.groupId).toBe('grp_local')
    })

    it('does not call kvGroupGetMembers when KV has no share:groupId', async () => {
      // kvGet returns null for everything (default)
      await syncFromCloud()

      expect(mockedKvGroupGetMembers).not.toHaveBeenCalled()
      expect(storage.getItem('share:group')).toBeNull()
    })

    it('does not restore group when kvGroupGetMembers returns null', async () => {
      mockedKvGet.mockImplementation(async (key: string) => {
        if (key === 'share:groupId') return 'grp_1'
        return null
      })
      mockedKvGroupGetMembers.mockResolvedValue(null)

      await syncFromCloud()

      expect(storage.getItem('share:group')).toBeNull()
    })

    it('does not restore group when kvGroupGetMembers returns empty array', async () => {
      mockedKvGet.mockImplementation(async (key: string) => {
        if (key === 'share:groupId') return 'grp_1'
        return null
      })
      mockedKvGroupGetMembers.mockResolvedValue([])

      await syncFromCloud()

      expect(storage.getItem('share:group')).toBeNull()
    })
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

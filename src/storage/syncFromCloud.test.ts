import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'
import type { Group, Citation, ParticipantStats, StationConfig, Schedule } from '../types'

// Override the global setup mock with a controllable version for this file.
vi.mock('./cloudStorage', () => ({
  kvGet: vi.fn().mockResolvedValue(null),
  kvSet: vi.fn().mockResolvedValue(undefined),
  kvDel: vi.fn().mockResolvedValue(undefined),
  kvList: vi.fn().mockResolvedValue([]),
  kvCrossReadPartner: vi.fn().mockResolvedValue(null),
  isKvAvailable: true,
}))

import { kvGet, kvList, kvSet, kvDel, kvCrossReadPartner } from './cloudStorage'
import { syncFromCloud, pushLocalToCloud } from './syncFromCloud'

const mockedKvList = vi.mocked(kvList)
const mockedKvGet = vi.mocked(kvGet)
const mockedKvSet = vi.mocked(kvSet)
const mockedKvDel = vi.mocked(kvDel)
const mockedKvCrossReadPartner = vi.mocked(kvCrossReadPartner)

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
    mockedKvDel.mockResolvedValue(undefined)
    mockedKvCrossReadPartner.mockResolvedValue(null)
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

  describe('share sync — accept notification', () => {
    it('sets share status when accept notification found in KV', async () => {
      // Simulate an outgoing request (we sent to 'bob')
      storage.setItem('share:outgoingRequest', JSON.stringify({ toUsername: 'bob', sentAt: 1000 }))
      // KV has the accept notification from bob
      mockedKvGet.mockImplementation(async (key) => {
        if (key === 'share:acceptNotification') return { byUsername: 'bob', at: 2000 }
        return null
      })
      // Partner crossRead succeeds (otherwise clearShareStatus would be called)
      mockedKvCrossReadPartner.mockResolvedValue({ citations: [], deleteLog: [] })

      await syncFromCloud()

      const statusRaw = storage.getItem('share:status')
      expect(statusRaw).not.toBeNull()
      const status = JSON.parse(statusRaw!)
      expect(status.partnerUsername).toBe('bob')
      expect(status.since).toBe(2000)
      // Outgoing request should be cleared
      expect(storage.getItem('share:outgoingRequest')).toBeNull()
      // Accept notification should be deleted from KV
      expect(mockedKvDel).toHaveBeenCalledWith('share:acceptNotification')
    })

    it('does not set share status when no accept notification in KV', async () => {
      storage.setItem('share:outgoingRequest', JSON.stringify({ toUsername: 'bob', sentAt: 1000 }))
      mockedKvGet.mockResolvedValue(null)

      await syncFromCloud()

      expect(storage.getItem('share:status')).toBeNull()
    })

    it('does not check accept notification when not sharing and no outgoing request', async () => {
      await syncFromCloud()

      // kvGet should not be called for share:acceptNotification
      const calls = mockedKvGet.mock.calls.map(c => c[0])
      expect(calls).not.toContain('share:acceptNotification')
    })
  })

  describe('share sync — incoming request', () => {
    it('copies incoming request from KV to localStorage when none exists', async () => {
      mockedKvGet.mockImplementation(async (key) => {
        if (key === 'share:incomingRequest') return { fromUsername: 'carol', sentAt: 3000 }
        return null
      })

      await syncFromCloud()

      const raw = storage.getItem('share:incomingRequest')
      expect(raw).not.toBeNull()
      expect(JSON.parse(raw!).fromUsername).toBe('carol')
    })

    it('does not overwrite existing local incoming request', async () => {
      storage.setItem('share:incomingRequest', JSON.stringify({ fromUsername: 'existing', sentAt: 1 }))
      mockedKvGet.mockImplementation(async (key) => {
        if (key === 'share:incomingRequest') return { fromUsername: 'new', sentAt: 2 }
        return null
      })

      await syncFromCloud()

      expect(JSON.parse(storage.getItem('share:incomingRequest')!).fromUsername).toBe('existing')
    })

    it('does not check KV for incoming request when already sharing', async () => {
      storage.setItem('share:status', JSON.stringify({ partnerUsername: 'bob', since: 1000 }))

      await syncFromCloud()

      const calls = mockedKvGet.mock.calls.map(c => c[0])
      expect(calls).not.toContain('share:incomingRequest')
    })
  })

  describe('share sync — partner citation pull', () => {
    it('adds partner citations not in local storage', async () => {
      storage.setItem('share:status', JSON.stringify({ partnerUsername: 'bob', since: 1000 }))
      const partnerCitation: Citation = { id: 'pc1', text: 'partner text', author: 'B. Bob', usedInListIds: [] }
      mockedKvCrossReadPartner.mockResolvedValue({ citations: [partnerCitation], deleteLog: [] })

      await syncFromCloud()

      const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
      expect(stored).toContainEqual(expect.objectContaining({ id: 'pc1' }))
    })

    it('does not duplicate local citations from partner', async () => {
      storage.setItem('share:status', JSON.stringify({ partnerUsername: 'bob', since: 1000 }))
      const localCitation: Citation = { id: 'c1', text: 'mine', author: 'A', usedInListIds: [] }
      storage.setItem('citations', JSON.stringify([localCitation]))
      mockedKvCrossReadPartner.mockResolvedValue({ citations: [localCitation], deleteLog: [] })

      await syncFromCloud()

      const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
      expect(stored.filter(c => c.id === 'c1')).toHaveLength(1)
    })

    it('applies partner delete log to local citations', async () => {
      storage.setItem('share:status', JSON.stringify({ partnerUsername: 'bob', since: 1000 }))
      const localCitation: Citation = { id: 'c1', text: 'to delete', author: 'A', usedInListIds: [] }
      storage.setItem('citations', JSON.stringify([localCitation]))
      mockedKvCrossReadPartner.mockResolvedValue({ citations: [], deleteLog: ['c1'] })

      await syncFromCloud()

      const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
      expect(stored.find(c => c.id === 'c1')).toBeUndefined()
    })

    it('clears share status when partner crossRead returns null (partner stopped sharing)', async () => {
      storage.setItem('share:status', JSON.stringify({ partnerUsername: 'bob', since: 1000 }))
      mockedKvCrossReadPartner.mockResolvedValue(null)

      await syncFromCloud()

      expect(storage.getItem('share:status')).toBeNull()
    })

    it('does not attempt cross-read when not sharing', async () => {
      await syncFromCloud()

      expect(mockedKvCrossReadPartner).not.toHaveBeenCalled()
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

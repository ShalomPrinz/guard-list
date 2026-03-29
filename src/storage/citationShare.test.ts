import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'
import type { Citation } from '../types'

vi.mock('./cloudStorage', () => ({
  kvSet: vi.fn().mockResolvedValue(undefined),
  kvDel: vi.fn().mockResolvedValue(undefined),
  kvCrossSet: vi.fn().mockResolvedValue('ok'),
  kvCrossReadPartner: vi.fn().mockResolvedValue(null),
}))

vi.mock('./userStorage', () => ({
  getUsername: vi.fn().mockReturnValue('alice'),
}))

import {
  getShareStatus,
  setShareStatus,
  clearShareStatus,
  getOutgoingRequest,
  setOutgoingRequest,
  clearOutgoingRequest,
  getLocalIncomingRequest,
  setLocalIncomingRequest,
  clearLocalIncomingRequest,
  getDeleteLog,
  appendToDeleteLog,
  clearDeleteLog,
  sendShareRequest,
  acceptShareRequest,
  declineShareRequest,
  stopSharing,
} from './citationShare'
import { kvCrossSet, kvCrossReadPartner } from './cloudStorage'
import { getUsername } from './userStorage'

const mockedKvCrossSet = vi.mocked(kvCrossSet)
const mockedKvCrossReadPartner = vi.mocked(kvCrossReadPartner)
const mockedGetUsername = vi.mocked(getUsername)

describe('citationShare storage', () => {
  let storage: Storage

  beforeEach(() => {
    storage = createLocalStorageMock()
    vi.stubGlobal('localStorage', storage)
    vi.clearAllMocks()
    mockedGetUsername.mockReturnValue('alice')
    mockedKvCrossSet.mockResolvedValue('ok')
    mockedKvCrossReadPartner.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('getShareStatus / setShareStatus / clearShareStatus', () => {
    it('returns null when not set', () => {
      expect(getShareStatus()).toBeNull()
    })

    it('returns the saved status', () => {
      setShareStatus({ partnerUsername: 'bob', since: 1000 })
      const status = getShareStatus()
      expect(status).toEqual({ partnerUsername: 'bob', since: 1000 })
    })

    it('clearShareStatus removes the status', () => {
      setShareStatus({ partnerUsername: 'bob', since: 1000 })
      clearShareStatus()
      expect(getShareStatus()).toBeNull()
    })
  })

  describe('getOutgoingRequest / setOutgoingRequest / clearOutgoingRequest', () => {
    it('returns null when not set', () => {
      expect(getOutgoingRequest()).toBeNull()
    })

    it('persists and retrieves the outgoing request', () => {
      setOutgoingRequest({ toUsername: 'bob', sentAt: 2000 })
      expect(getOutgoingRequest()).toEqual({ toUsername: 'bob', sentAt: 2000 })
    })

    it('clearOutgoingRequest removes the request', () => {
      setOutgoingRequest({ toUsername: 'bob', sentAt: 2000 })
      clearOutgoingRequest()
      expect(getOutgoingRequest()).toBeNull()
    })
  })

  describe('getLocalIncomingRequest / setLocalIncomingRequest / clearLocalIncomingRequest', () => {
    it('returns null when not set', () => {
      expect(getLocalIncomingRequest()).toBeNull()
    })

    it('persists and retrieves the incoming request', () => {
      setLocalIncomingRequest({ fromUsername: 'carol', sentAt: 3000 })
      expect(getLocalIncomingRequest()).toEqual({ fromUsername: 'carol', sentAt: 3000 })
    })

    it('clearLocalIncomingRequest removes the request', () => {
      setLocalIncomingRequest({ fromUsername: 'carol', sentAt: 3000 })
      clearLocalIncomingRequest()
      expect(getLocalIncomingRequest()).toBeNull()
    })
  })

  describe('getDeleteLog / appendToDeleteLog / clearDeleteLog', () => {
    it('returns empty array when not set', () => {
      expect(getDeleteLog()).toEqual([])
    })

    it('appends entries to the delete log', () => {
      appendToDeleteLog('c1')
      appendToDeleteLog('c2')
      expect(getDeleteLog()).toEqual(['c1', 'c2'])
    })

    it('clearDeleteLog empties the log', () => {
      appendToDeleteLog('c1')
      clearDeleteLog()
      expect(getDeleteLog()).toEqual([])
    })
  })

  describe('sendShareRequest', () => {
    it('returns sent on success', async () => {
      const result = await sendShareRequest('bob')
      expect(result).toBe('sent')
      expect(getOutgoingRequest()?.toUsername).toBe('bob')
    })

    it('normalizes target username to lowercase', async () => {
      await sendShareRequest('BOB')
      expect(getOutgoingRequest()?.toUsername).toBe('bob')
    })

    it('returns already_have_outgoing when outgoing exists', async () => {
      setOutgoingRequest({ toUsername: 'carol', sentAt: 1000 })
      const result = await sendShareRequest('bob')
      expect(result).toBe('already_have_outgoing')
    })

    it('returns already_sharing when already sharing', async () => {
      setShareStatus({ partnerUsername: 'carol', since: 1000 })
      const result = await sendShareRequest('bob')
      expect(result).toBe('already_sharing')
    })

    it('returns target_has_pending when crossSet returns already_pending', async () => {
      mockedKvCrossSet.mockResolvedValue('already_pending')
      const result = await sendShareRequest('bob')
      expect(result).toBe('target_has_pending')
    })

    it('returns error when crossSet returns error', async () => {
      mockedKvCrossSet.mockResolvedValue('error')
      const result = await sendShareRequest('bob')
      expect(result).toBe('error')
    })

    it('returns error when no username', async () => {
      mockedGetUsername.mockReturnValue(null)
      const result = await sendShareRequest('bob')
      expect(result).toBe('error')
    })
  })

  describe('acceptShareRequest', () => {
    it('sets share status and clears incoming request', async () => {
      setLocalIncomingRequest({ fromUsername: 'bob', sentAt: 1000 })
      await acceptShareRequest('bob')
      expect(getShareStatus()?.partnerUsername).toBe('bob')
      expect(getLocalIncomingRequest()).toBeNull()
    })

    it('sends accept notification via kvCrossSet', async () => {
      await acceptShareRequest('bob')
      expect(mockedKvCrossSet).toHaveBeenCalledWith(
        'bob',
        'share:acceptNotification',
        expect.objectContaining({ byUsername: 'alice' }),
      )
    })

    it('merges partner citations on initial pull', async () => {
      const partnerCitation: Citation = { id: 'pc1', text: 'partner text', author: 'P. Partner', usedInListIds: [] }
      mockedKvCrossReadPartner.mockResolvedValueOnce({ citations: [partnerCitation], deleteLog: [] })

      await acceptShareRequest('bob')

      const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
      expect(stored.find(c => c.id === 'pc1')).toBeDefined()
    })

    it('does not duplicate local citations during initial pull', async () => {
      const existing: Citation = { id: 'local1', text: 'mine', author: 'A', usedInListIds: [] }
      storage.setItem('citations', JSON.stringify([existing]))
      mockedKvCrossReadPartner.mockResolvedValueOnce({ citations: [existing], deleteLog: [] })

      await acceptShareRequest('bob')

      const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
      expect(stored.filter(c => c.id === 'local1')).toHaveLength(1)
    })

    it('applies partner delete log on initial pull', async () => {
      const toDelete: Citation = { id: 'del1', text: 'to delete', author: 'D', usedInListIds: [] }
      storage.setItem('citations', JSON.stringify([toDelete]))
      mockedKvCrossReadPartner.mockResolvedValueOnce({ citations: [], deleteLog: ['del1'] })

      await acceptShareRequest('bob')

      const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
      expect(stored.find(c => c.id === 'del1')).toBeUndefined()
    })

    it('does not touch citations when initial pull returns null', async () => {
      const local: Citation = { id: 'c1', text: 'keep', author: 'A', usedInListIds: [] }
      storage.setItem('citations', JSON.stringify([local]))
      mockedKvCrossReadPartner.mockResolvedValueOnce(null)

      await acceptShareRequest('bob')

      const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
      expect(stored).toHaveLength(1)
      expect(stored[0].id).toBe('c1')
    })
  })

  describe('declineShareRequest', () => {
    it('removes the local incoming request', () => {
      setLocalIncomingRequest({ fromUsername: 'bob', sentAt: 1000 })
      declineShareRequest()
      expect(getLocalIncomingRequest()).toBeNull()
    })
  })

  describe('stopSharing', () => {
    it('clears status, delete log, and outgoing request', () => {
      setShareStatus({ partnerUsername: 'bob', since: 1000 })
      appendToDeleteLog('c1')
      setOutgoingRequest({ toUsername: 'carol', sentAt: 2000 })

      stopSharing()

      expect(getShareStatus()).toBeNull()
      expect(getDeleteLog()).toEqual([])
      expect(getOutgoingRequest()).toBeNull()
    })
  })
})

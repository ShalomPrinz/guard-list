import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'
import type { Citation, GroupInvitation } from '../types'

const mockKvGet = vi.fn().mockResolvedValue(null)

vi.mock('./cloudStorage', () => ({
  kvSet: vi.fn().mockResolvedValue(undefined),
  kvDel: vi.fn().mockResolvedValue(undefined),
  kvGet: (...args: unknown[]) => mockKvGet(...args),
  kvCrossSet: vi.fn().mockResolvedValue('ok'),
  kvCrossReadGroupMember: vi.fn().mockResolvedValue(null),
  kvGroupCreate: vi.fn().mockResolvedValue(null),
  kvGroupJoin: vi.fn().mockResolvedValue('ok'),
  kvGroupLeave: vi.fn().mockResolvedValue('ok'),
  kvGroupGetMembers: vi.fn().mockResolvedValue(null),
  kvInvitationDecline: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./userStorage', () => ({
  getUsername: vi.fn().mockReturnValue('alice'),
}))

import {
  getLocalGroup,
  setLocalGroup,
  clearLocalGroup,
  getLocalGroupInvitation,
  setLocalGroupInvitation,
  clearLocalGroupInvitation,
  getOutgoingInvitation,
  setOutgoingInvitation,
  clearOutgoingInvitation,
  getDeleteLog,
  appendToDeleteLog,
  clearDeleteLog,
  sendGroupInvitation,
  acceptGroupInvitation,
  declineGroupInvitation,
  leaveGroup,
} from './citationShare'
import { kvCrossSet, kvDel, kvGroupCreate, kvGroupJoin, kvGroupLeave, kvGroupGetMembers, kvCrossReadGroupMember, kvInvitationDecline } from './cloudStorage'
import { getUsername } from './userStorage'

const mockedKvCrossSet = vi.mocked(kvCrossSet)
const mockedKvGroupCreate = vi.mocked(kvGroupCreate)
const mockedKvGroupJoin = vi.mocked(kvGroupJoin)
const mockedKvGroupLeave = vi.mocked(kvGroupLeave)
const mockedKvGroupGetMembers = vi.mocked(kvGroupGetMembers)
const mockedKvCrossReadGroupMember = vi.mocked(kvCrossReadGroupMember)
const mockedKvInvitationDecline = vi.mocked(kvInvitationDecline)
const mockedGetUsername = vi.mocked(getUsername)

describe('citationShare storage', () => {
  let storage: Storage

  beforeEach(() => {
    storage = createLocalStorageMock()
    vi.stubGlobal('localStorage', storage)
    vi.clearAllMocks()
    mockedGetUsername.mockReturnValue('alice')
    mockedKvCrossSet.mockResolvedValue('ok')
    mockedKvGroupCreate.mockResolvedValue({ groupId: 'grp_test_abc' })
    mockedKvGroupJoin.mockResolvedValue('ok')
    mockedKvGroupLeave.mockResolvedValue('ok')
    mockedKvGroupGetMembers.mockResolvedValue(null)
    mockedKvCrossReadGroupMember.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ─── getLocalGroup / setLocalGroup / clearLocalGroup ─────────────────────────

  describe('getLocalGroup / setLocalGroup / clearLocalGroup', () => {
    it('returns null when not set', () => {
      expect(getLocalGroup()).toBeNull()
    })

    it('returns the saved group', () => {
      setLocalGroup({ groupId: 'grp_1', members: ['alice', 'bob'], joinedAt: 1000 })
      expect(getLocalGroup()).toEqual({ groupId: 'grp_1', members: ['alice', 'bob'], joinedAt: 1000 })
    })

    it('clearLocalGroup removes the group', () => {
      setLocalGroup({ groupId: 'grp_1', members: ['alice'], joinedAt: 1000 })
      clearLocalGroup()
      expect(getLocalGroup()).toBeNull()
    })

    it('clearLocalGroup does NOT call any KV function', () => {
      const mockedKvDel = vi.mocked(kvDel)
      setLocalGroup({ groupId: 'grp_1', members: ['alice'], joinedAt: 1000 })
      vi.clearAllMocks()
      clearLocalGroup()
      expect(mockedKvDel).not.toHaveBeenCalled()
    })
  })

  // ─── getLocalGroupInvitation ──────────────────────────────────────────────────

  describe('getLocalGroupInvitation / setLocalGroupInvitation / clearLocalGroupInvitation', () => {
    it('returns null when not set', () => {
      expect(getLocalGroupInvitation()).toBeNull()
    })

    it('persists and retrieves the invitation', () => {
      const inv: GroupInvitation = { groupId: 'grp_1', fromUsername: 'carol', sentAt: 3000 }
      setLocalGroupInvitation(inv)
      expect(getLocalGroupInvitation()).toEqual(inv)
    })

    it('clearLocalGroupInvitation removes the invitation', () => {
      setLocalGroupInvitation({ groupId: 'grp_1', fromUsername: 'carol', sentAt: 3000 })
      clearLocalGroupInvitation()
      expect(getLocalGroupInvitation()).toBeNull()
    })
  })

  // ─── getOutgoingInvitation ────────────────────────────────────────────────────

  describe('getOutgoingInvitation / setOutgoingInvitation / clearOutgoingInvitation', () => {
    it('returns null when not set', () => {
      expect(getOutgoingInvitation()).toBeNull()
    })

    it('persists and retrieves the outgoing invitation', () => {
      setOutgoingInvitation({ toUsername: 'bob', groupId: 'grp_1', sentAt: 2000 })
      expect(getOutgoingInvitation()).toEqual({ toUsername: 'bob', groupId: 'grp_1', sentAt: 2000 })
    })

    it('clearOutgoingInvitation removes it', () => {
      setOutgoingInvitation({ toUsername: 'bob', groupId: 'grp_1', sentAt: 2000 })
      clearOutgoingInvitation()
      expect(getOutgoingInvitation()).toBeNull()
    })
  })

  // ─── getDeleteLog / appendToDeleteLog / clearDeleteLog ───────────────────────

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

  // ─── sendGroupInvitation ──────────────────────────────────────────────────────

  describe('sendGroupInvitation', () => {
    it('creates a group and sends invitation when no group exists', async () => {
      mockedKvGroupCreate.mockResolvedValue({ groupId: 'grp_test_abc' })
      const result = await sendGroupInvitation('bob', storage)
      expect(result).toBe('sent')
      expect(mockedKvGroupCreate).toHaveBeenCalled()
      expect(mockedKvCrossSet).toHaveBeenCalledWith(
        'bob',
        'share:groupInvitation',
        expect.objectContaining({ fromUsername: 'alice', groupId: 'grp_test_abc' }),
      )
      expect(getLocalGroup(storage)?.groupId).toBe('grp_test_abc')
      expect(getOutgoingInvitation(storage)?.toUsername).toBe('bob')
    })

    it('reuses existing group when already in one', async () => {
      setLocalGroup({ groupId: 'grp_existing', members: ['alice'], joinedAt: 1000 }, storage)
      const result = await sendGroupInvitation('bob', storage)
      expect(result).toBe('sent')
      expect(mockedKvGroupCreate).not.toHaveBeenCalled()
      expect(mockedKvCrossSet).toHaveBeenCalledWith(
        'bob',
        'share:groupInvitation',
        expect.objectContaining({ groupId: 'grp_existing' }),
      )
    })

    it('normalizes target username to lowercase', async () => {
      await sendGroupInvitation('BOB', storage)
      expect(getOutgoingInvitation(storage)?.toUsername).toBe('bob')
    })

    it('returns already_have_outgoing when outgoing invitation exists', async () => {
      setOutgoingInvitation({ toUsername: 'carol', groupId: 'grp_1', sentAt: 1000 }, storage)
      const result = await sendGroupInvitation('bob', storage)
      expect(result).toBe('already_have_outgoing')
    })

    it('returns own_namespace when targeting self', async () => {
      const result = await sendGroupInvitation('alice', storage)
      expect(result).toBe('own_namespace')
    })

    it('returns own_namespace (case-insensitive)', async () => {
      const result = await sendGroupInvitation('ALICE', storage)
      expect(result).toBe('own_namespace')
    })

    it('returns target_has_pending when crossSet returns already_pending', async () => {
      mockedKvCrossSet.mockResolvedValue('already_pending')
      const result = await sendGroupInvitation('bob', storage)
      expect(result).toBe('target_has_pending')
    })

    it('returns error when crossSet returns error', async () => {
      mockedKvCrossSet.mockResolvedValue('error')
      const result = await sendGroupInvitation('bob', storage)
      expect(result).toBe('error')
    })

    it('returns error when kvGroupCreate fails', async () => {
      mockedKvGroupCreate.mockResolvedValue(null)
      const result = await sendGroupInvitation('bob', storage)
      expect(result).toBe('error')
    })

    it('returns error when no username', async () => {
      mockedGetUsername.mockReturnValue(null)
      const result = await sendGroupInvitation('bob', storage)
      expect(result).toBe('error')
    })
  })

  // ─── acceptGroupInvitation ────────────────────────────────────────────────────

  describe('acceptGroupInvitation', () => {
    const invitation: GroupInvitation = { groupId: 'grp_test', fromUsername: 'bob', sentAt: 1000 }

    beforeEach(() => {
      // Default: KV invitation exists (not cancelled)
      mockKvGet.mockImplementation((key: string) => {
        if (key === 'share:groupInvitation') return Promise.resolve(invitation)
        return Promise.resolve(null)
      })
    })

    it('joins the group and sets local group', async () => {
      mockedKvGroupGetMembers.mockResolvedValue(['bob', 'alice'])
      setLocalGroupInvitation(invitation, storage)

      const result = await acceptGroupInvitation(invitation, storage)

      expect(result).toBe('ok')
      expect(mockedKvGroupJoin).toHaveBeenCalledWith('grp_test')
      const group = getLocalGroup(storage)
      expect(group?.groupId).toBe('grp_test')
      expect(group?.members).toEqual(['bob', 'alice'])
    })

    it('clears the local invitation', async () => {
      setLocalGroupInvitation(invitation, storage)
      await acceptGroupInvitation(invitation, storage)
      expect(getLocalGroupInvitation(storage)).toBeNull()
    })

    it('sends accept notification via kvCrossSet', async () => {
      mockedKvGroupGetMembers.mockResolvedValue(['bob', 'alice'])
      await acceptGroupInvitation(invitation, storage)
      expect(mockedKvCrossSet).toHaveBeenCalledWith(
        'bob',
        'share:acceptNotification',
        expect.objectContaining({ byUsername: 'alice', groupId: 'grp_test' }),
      )
    })

    it('pulls citations from other group members', async () => {
      mockedKvGroupGetMembers.mockResolvedValue(['bob', 'alice'])
      const partnerCitation: Citation = { id: 'pc1', text: 'partner', author: 'B. Bob', usedInListIds: [] }
      mockedKvCrossReadGroupMember.mockResolvedValueOnce({ citations: [partnerCitation], deleteLog: [] })

      await acceptGroupInvitation(invitation, storage)

      const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
      expect(stored.find(c => c.id === 'pc1')).toBeDefined()
    })

    it('does not duplicate local citations during pull', async () => {
      mockedKvGroupGetMembers.mockResolvedValue(['bob', 'alice'])
      const existing: Citation = { id: 'local1', text: 'mine', author: 'A', usedInListIds: [] }
      storage.setItem('citations', JSON.stringify([existing]))
      mockedKvCrossReadGroupMember.mockResolvedValueOnce({ citations: [existing], deleteLog: [] })

      await acceptGroupInvitation(invitation, storage)

      const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
      expect(stored.filter(c => c.id === 'local1')).toHaveLength(1)
    })

    it('applies delete log from partner', async () => {
      mockedKvGroupGetMembers.mockResolvedValue(['bob', 'alice'])
      const toDelete: Citation = { id: 'del1', text: 'to delete', author: 'D', usedInListIds: [] }
      storage.setItem('citations', JSON.stringify([toDelete]))
      mockedKvCrossReadGroupMember.mockResolvedValueOnce({ citations: [], deleteLog: ['del1'] })

      await acceptGroupInvitation(invitation, storage)

      const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
      expect(stored.find(c => c.id === 'del1')).toBeUndefined()
    })

    it('returns error when kvGroupJoin fails', async () => {
      mockedKvGroupJoin.mockResolvedValue('error')
      const result = await acceptGroupInvitation(invitation, storage)
      expect(result).toBe('error')
      expect(getLocalGroup(storage)).toBeNull()
    })

    it('does not set local group when kvGroupGetMembers returns null', async () => {
      mockedKvGroupGetMembers.mockResolvedValue(null)
      await acceptGroupInvitation(invitation, storage)
      expect(mockedKvGroupJoin).toHaveBeenCalledWith('grp_test')
      expect(getLocalGroup(storage)).toBeNull()
    })

    it('calls kvInvitationDecline after joining to prevent KV key from re-delivering invitation', async () => {
      // Regression: without this call, loadSharingCenterUpdates sees local=null + KV key still present
      // and restores the invitation, making the invitation card persist after acceptance.
      mockedKvGroupGetMembers.mockResolvedValue(['bob', 'alice'])
      await acceptGroupInvitation(invitation, storage)
      expect(mockedKvInvitationDecline).toHaveBeenCalled()
    })

    it('returns error when no username', async () => {
      mockedGetUsername.mockReturnValue(null)
      const result = await acceptGroupInvitation(invitation, storage)
      expect(result).toBe('error')
      expect(mockedKvGroupJoin).not.toHaveBeenCalled()
    })

    it('returns cancelled and clears local invitation when KV invitation is gone', async () => {
      mockKvGet.mockResolvedValue(null) // KV invitation gone
      setLocalGroupInvitation(invitation, storage)

      const result = await acceptGroupInvitation(invitation, storage)

      expect(result).toBe('cancelled')
      expect(getLocalGroupInvitation(storage)).toBeNull()
      expect(mockedKvGroupJoin).not.toHaveBeenCalled()
    })
  })

  // ─── declineGroupInvitation ───────────────────────────────────────────────────

  describe('declineGroupInvitation', () => {
    it('clears the local invitation', async () => {
      const invitation: GroupInvitation = { groupId: 'grp_1', fromUsername: 'bob', sentAt: 1000 }
      setLocalGroupInvitation(invitation, storage)
      await declineGroupInvitation(invitation, storage)
      expect(getLocalGroupInvitation(storage)).toBeNull()
    })

    it('sends rejection notification to inviter and deletes KV key', async () => {
      const invitation: GroupInvitation = { groupId: 'grp_1', fromUsername: 'bob', sentAt: 1000 }
      await declineGroupInvitation(invitation, storage)
      expect(mockedKvInvitationDecline).toHaveBeenCalled()
      expect(mockedKvCrossSet).toHaveBeenCalledWith(
        'bob',
        'share:rejectionNotification',
        expect.objectContaining({ byUsername: 'alice', groupId: 'grp_1' }),
      )
    })

    it('silently does nothing when no username', async () => {
      mockedGetUsername.mockReturnValue(null)
      const invitation: GroupInvitation = { groupId: 'grp_1', fromUsername: 'bob', sentAt: 1000 }
      await expect(declineGroupInvitation(invitation, storage)).resolves.not.toThrow()
      expect(mockedKvCrossSet).not.toHaveBeenCalled()
    })

    it('clears local invitation even when username is null', async () => {
      mockedGetUsername.mockReturnValue(null)
      const invitation: GroupInvitation = { groupId: 'grp_1', fromUsername: 'bob', sentAt: 1000 }
      setLocalGroupInvitation(invitation, storage)
      await declineGroupInvitation(invitation, storage)
      expect(getLocalGroupInvitation(storage)).toBeNull()
    })
  })

  // ─── leaveGroup ───────────────────────────────────────────────────────────────

  describe('leaveGroup', () => {
    it('calls kvGroupLeave and clears local group state', async () => {
      setLocalGroup({ groupId: 'grp_1', members: ['alice', 'bob'], joinedAt: 1000 }, storage)
      await leaveGroup(storage)
      expect(mockedKvGroupLeave).toHaveBeenCalledWith('grp_1')
      expect(getLocalGroup(storage)).toBeNull()
    })

    it('removes citations owned by other group members', async () => {
      setLocalGroup({ groupId: 'grp_1', members: ['alice', 'bob'], joinedAt: 1000 }, storage)
      const ownCitation: Citation = { id: 'c1', text: 'mine', author: 'A', usedInListIds: [], createdByUsername: 'alice' }
      const partnerCitation: Citation = { id: 'c2', text: 'partner', author: 'B', usedInListIds: [], createdByUsername: 'bob' }
      storage.setItem('citations', JSON.stringify([ownCitation, partnerCitation]))

      await leaveGroup(storage)

      const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
      expect(stored.find(c => c.id === 'c1')).toBeDefined()
      expect(stored.find(c => c.id === 'c2')).toBeUndefined()
    })

    it('keeps citations with undefined createdByUsername (legacy)', async () => {
      setLocalGroup({ groupId: 'grp_1', members: ['alice', 'bob'], joinedAt: 1000 }, storage)
      const legacyCitation: Citation = { id: 'c3', text: 'legacy', author: 'L', usedInListIds: [] }
      storage.setItem('citations', JSON.stringify([legacyCitation]))

      await leaveGroup(storage)

      const stored = JSON.parse(storage.getItem('citations') ?? '[]') as Citation[]
      expect(stored.find(c => c.id === 'c3')).toBeDefined()
    })

    it('clears delete log and outgoing invitation', async () => {
      setLocalGroup({ groupId: 'grp_1', members: ['alice'], joinedAt: 1000 }, storage)
      appendToDeleteLog('c1', storage)
      setOutgoingInvitation({ toUsername: 'bob', groupId: 'grp_1', sentAt: 2000 }, storage)

      await leaveGroup(storage)

      expect(getDeleteLog(storage)).toEqual([])
      expect(getOutgoingInvitation(storage)).toBeNull()
    })

    it('does nothing when not in a group', async () => {
      await leaveGroup(storage)
      expect(mockedKvGroupLeave).not.toHaveBeenCalled()
    })
  })
})

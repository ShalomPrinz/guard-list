import type { SharingGroup, GroupInvitation } from '../types'
import { kvSet, kvDel, kvGet } from './cloudStorage'
import { getUsername } from './userStorage'
import { getCitations, deleteCitationSilent } from './citations'

const KEY_GROUP = 'share:group'
const KEY_GROUP_INVITATION = 'share:groupInvitation'
const KEY_OUTGOING_INVITATION = 'share:outgoingInvitation'
const KEY_DELETE_LOG = 'share:deleteLog'

// ─── share:group ─────────────────────────────────────────────────────────────

export function getLocalGroup(storage: Storage = window.localStorage): SharingGroup | null {
  const raw = storage.getItem(KEY_GROUP)
  if (!raw) return null
  try { return JSON.parse(raw) as SharingGroup } catch { return null }
}

export function setLocalGroup(group: SharingGroup, storage: Storage = window.localStorage): void {
  storage.setItem(KEY_GROUP, JSON.stringify(group))
}

/** Clears local group state only — does NOT call KV. Group leave is done via kvGroupLeave(). */
export function clearLocalGroup(storage: Storage = window.localStorage): void {
  storage.removeItem(KEY_GROUP)
}

// ─── share:groupInvitation ───────────────────────────────────────────────────

export function getLocalGroupInvitation(storage: Storage = window.localStorage): GroupInvitation | null {
  const raw = storage.getItem(KEY_GROUP_INVITATION)
  if (!raw) return null
  try { return JSON.parse(raw) as GroupInvitation } catch { return null }
}

export function setLocalGroupInvitation(inv: GroupInvitation, storage: Storage = window.localStorage): void {
  storage.setItem(KEY_GROUP_INVITATION, JSON.stringify(inv))
}

export function clearLocalGroupInvitation(storage: Storage = window.localStorage): void {
  storage.removeItem(KEY_GROUP_INVITATION)
}

// ─── share:outgoingInvitation ─────────────────────────────────────────────────

export function getOutgoingInvitation(storage: Storage = window.localStorage): { toUsername: string; groupId: string; sentAt: number } | null {
  const raw = storage.getItem(KEY_OUTGOING_INVITATION)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function setOutgoingInvitation(inv: { toUsername: string; groupId: string; sentAt: number }, storage: Storage = window.localStorage): void {
  storage.setItem(KEY_OUTGOING_INVITATION, JSON.stringify(inv))
}

export function clearOutgoingInvitation(storage: Storage = window.localStorage): void {
  storage.removeItem(KEY_OUTGOING_INVITATION)
}

// ─── share:deleteLog ──────────────────────────────────────────────────────────

export function getDeleteLog(storage: Storage = window.localStorage): string[] {
  const raw = storage.getItem(KEY_DELETE_LOG)
  if (!raw) return []
  try { return JSON.parse(raw) as string[] } catch { return [] }
}

export function appendToDeleteLog(citationId: string, storage: Storage = window.localStorage): void {
  const log = getDeleteLog(storage)
  const updated = [...log, citationId]
  storage.setItem(KEY_DELETE_LOG, JSON.stringify(updated))
  void kvSet('share:deleteLog', updated)
}

export function clearDeleteLog(storage: Storage = window.localStorage): void {
  storage.removeItem(KEY_DELETE_LOG)
  void kvDel('share:deleteLog')
}

// ─── Group operations ─────────────────────────────────────────────────────────

export async function sendGroupInvitation(
  targetUsername: string,
  storage: Storage = window.localStorage,
): Promise<'sent' | 'already_have_outgoing' | 'target_has_pending' | 'own_namespace' | 'target_not_found' | 'target_in_group' | 'error'> {
  if (getOutgoingInvitation(storage) !== null) return 'already_have_outgoing'

  const currentUser = getUsername()
  if (!currentUser) return 'error'

  const normalized = targetUsername.toLowerCase()
  if (normalized === currentUser.toLowerCase()) return 'own_namespace'

  const { kvGroupCreate, kvCrossSet } = await import('./cloudStorage')

  // If no group yet, create one
  let groupId: string
  const existing = getLocalGroup(storage)
  if (existing !== null) {
    groupId = existing.groupId
  } else {
    const created = await kvGroupCreate()
    if (!created) return 'error'
    groupId = created.groupId
    setLocalGroup({ groupId, members: [currentUser], joinedAt: Date.now() }, storage)
  }

  const sentAt = Date.now()
  const result = await kvCrossSet(normalized, 'share:groupInvitation', {
    groupId,
    fromUsername: currentUser,
    sentAt,
  })

  if (result === 'target_not_found') return 'target_not_found'
  if (result === 'target_in_group') return 'target_in_group'
  if (result === 'already_pending') return 'target_has_pending'
  if (result === 'error') return 'error'

  setOutgoingInvitation({ toUsername: normalized, groupId, sentAt }, storage)
  return 'sent'
}

export async function acceptGroupInvitation(
  invitation: GroupInvitation,
  storage: Storage = window.localStorage,
): Promise<'ok' | 'cancelled' | 'error'> {
  const currentUser = getUsername()
  if (!currentUser) return 'error'

  const kvInvitation = await kvGet<GroupInvitation>('share:groupInvitation')
  if (kvInvitation === null) {
    clearLocalGroupInvitation(storage)
    return 'cancelled'
  }

  const { kvGroupJoin, kvGroupGetMembers, kvCrossSet, kvCrossReadGroupMember, kvInvitationDecline } = await import('./cloudStorage')

  const joinResult = await kvGroupJoin(invitation.groupId)
  if (joinResult !== 'ok') return 'error'

  const members = await kvGroupGetMembers(invitation.groupId)
  if (members !== null) {
    setLocalGroup({ groupId: invitation.groupId, members, joinedAt: Date.now() }, storage)
  }

  clearLocalGroupInvitation(storage)
  // Delete the KV invitation key so loadSharingCenterUpdates doesn't re-add it
  await kvInvitationDecline()

  void kvCrossSet(invitation.fromUsername, 'share:acceptNotification', {
    byUsername: currentUser,
    groupId: invitation.groupId,
    at: Date.now(),
  })

  // Initial citation pull from all other group members
  const otherMembers = (members ?? []).filter(m => m !== currentUser)
  for (const member of otherMembers) {
    try {
      const result = await kvCrossReadGroupMember(member)
      if (result !== null) {
        const { upsertCitation } = await import('./citations')
        const localIds = new Set(getCitations(storage).map(c => c.id))
        for (const citation of result.citations) {
          if (!localIds.has(citation.id)) {
            upsertCitation(citation, storage)
          }
        }
        const updatedIds = new Set(getCitations(storage).map(c => c.id))
        for (const deletedId of result.deleteLog) {
          if (updatedIds.has(deletedId)) {
            deleteCitationSilent(deletedId, storage)
          }
        }
      }
    } catch { /* silent */ }
  }

  return 'ok'
}

export async function declineGroupInvitation(
  invitation: GroupInvitation,
  storage: Storage = window.localStorage,
): Promise<void> {
  const currentUser = getUsername()
  clearLocalGroupInvitation(storage)
  if (!currentUser) return
  try {
    const { kvCrossSet, kvInvitationDecline } = await import('./cloudStorage')
    // Delete the invitation key server-side to prevent re-appearance on next load
    await kvInvitationDecline()
    // Notify the inviter of the rejection
    void kvCrossSet(invitation.fromUsername, 'share:rejectionNotification', {
      byUsername: currentUser,
      groupId: invitation.groupId,
      at: Date.now(),
    })
  } catch { /* silent */ }
}

// ─── Sharing Center on-demand refresh ────────────────────────────────────────

export async function loadSharingCenterUpdates(storage: Storage = window.localStorage): Promise<{
  acceptedBy?: string
  rejectedBy?: string
  freshMembers?: string[]
  invitationCancelledBy?: string
  autoLeftLoneGroup?: true
}> {
  const result: { acceptedBy?: string; rejectedBy?: string; freshMembers?: string[]; invitationCancelledBy?: string; autoLeftLoneGroup?: true } = {}

  try {
    const acceptNotif = await kvGet<{ byUsername: string; groupId: string; at: number }>('share:acceptNotification')
    if (acceptNotif !== null) {
      const { kvGroupGetMembers } = await import('./cloudStorage')
      const freshMembers = await kvGroupGetMembers(acceptNotif.groupId)
      const existing = getLocalGroup(storage)
      if (freshMembers !== null) {
        setLocalGroup({ groupId: acceptNotif.groupId, members: freshMembers, joinedAt: existing?.joinedAt ?? Date.now() }, storage)
        result.freshMembers = freshMembers
      }
      clearOutgoingInvitation(storage)
      await kvDel('share:acceptNotification')
      result.acceptedBy = acceptNotif.byUsername
    }
  } catch { /* silent */ }

  try {
    const rejectNotif = await kvGet<{ byUsername: string; groupId: string; at: number }>('share:rejectionNotification')
    if (rejectNotif !== null) {
      clearOutgoingInvitation(storage)
      await kvDel('share:rejectionNotification')
      result.rejectedBy = rejectNotif.byUsername
    }
  } catch { /* silent */ }

  try {
    const existingLocal = getLocalGroupInvitation(storage)
    const remoteInvitation = await kvGet<GroupInvitation>('share:groupInvitation')
    if (existingLocal === null && remoteInvitation !== null) {
      // Invitation arrived — save locally so the UI can render it
      setLocalGroupInvitation(remoteInvitation, storage)
    } else if (existingLocal !== null && remoteInvitation === null) {
      // Invitation was cancelled by the inviter while we weren't looking
      const cancelledBy = existingLocal.fromUsername
      clearLocalGroupInvitation(storage)
      result.invitationCancelledBy = cancelledBy
    }
  } catch { /* silent */ }

  try {
    const group = getLocalGroup(storage)
    if (group !== null) {
      const { kvGroupGetMembers } = await import('./cloudStorage')
      const freshMembers = await kvGroupGetMembers(group.groupId)
      if (freshMembers !== null) {
        const currentUser = getUsername() ?? ''
        const othersExist = freshMembers.some(m => m !== currentUser)
        if (!othersExist) {
          await leaveGroup(storage)
          result.autoLeftLoneGroup = true
          return result
        }
        setLocalGroup({ ...group, members: freshMembers }, storage)
        result.freshMembers = freshMembers
      }
    }
  } catch { /* silent */ }

  return result
}

export async function leaveGroup(storage: Storage = window.localStorage): Promise<void> {
  const group = getLocalGroup(storage)
  if (!group) return

  const { kvGroupLeave } = await import('./cloudStorage')
  await kvGroupLeave(group.groupId)

  // Remove citations owned by other group members
  const currentUser = getUsername()
  const citations = getCitations(storage)
  for (const citation of citations) {
    if (citation.createdByUsername !== undefined && citation.createdByUsername !== currentUser) {
      deleteCitationSilent(citation.id, storage)
    }
  }

  clearLocalGroup(storage)
  clearDeleteLog(storage)
  clearOutgoingInvitation(storage)
}

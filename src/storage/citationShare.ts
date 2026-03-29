import type { CitationShareStatus, CitationShareRequest } from '../types'
import { kvSet, kvDel, kvCrossSet } from './cloudStorage'
import { getUsername } from './userStorage'
import { getCitations, upsertCitation } from './citations'

const KEY_STATUS = 'share:status'
const KEY_OUTGOING = 'share:outgoingRequest'
const KEY_INCOMING = 'share:incomingRequest'
const KEY_DELETE_LOG = 'share:deleteLog'

export function getShareStatus(storage: Storage = window.localStorage): CitationShareStatus | null {
  const raw = storage.getItem(KEY_STATUS)
  if (!raw) return null
  try { return JSON.parse(raw) as CitationShareStatus } catch { return null }
}

export function setShareStatus(status: CitationShareStatus, storage: Storage = window.localStorage): void {
  storage.setItem(KEY_STATUS, JSON.stringify(status))
  void kvSet('share:partner', status.partnerUsername)
}

export function clearShareStatus(storage: Storage = window.localStorage): void {
  storage.removeItem(KEY_STATUS)
  void kvDel('share:partner')
}

export function getOutgoingRequest(storage: Storage = window.localStorage): { toUsername: string; sentAt: number } | null {
  const raw = storage.getItem(KEY_OUTGOING)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function setOutgoingRequest(req: { toUsername: string; sentAt: number }, storage: Storage = window.localStorage): void {
  storage.setItem(KEY_OUTGOING, JSON.stringify(req))
}

export function clearOutgoingRequest(storage: Storage = window.localStorage): void {
  storage.removeItem(KEY_OUTGOING)
}

export function getLocalIncomingRequest(storage: Storage = window.localStorage): CitationShareRequest | null {
  const raw = storage.getItem(KEY_INCOMING)
  if (!raw) return null
  try { return JSON.parse(raw) as CitationShareRequest } catch { return null }
}

export function setLocalIncomingRequest(req: CitationShareRequest, storage: Storage = window.localStorage): void {
  storage.setItem(KEY_INCOMING, JSON.stringify(req))
}

export function clearLocalIncomingRequest(storage: Storage = window.localStorage): void {
  storage.removeItem(KEY_INCOMING)
  void kvDel('share:incomingRequest')
}

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

export async function sendShareRequest(
  targetUsername: string,
  storage: Storage = window.localStorage,
): Promise<'sent' | 'already_have_outgoing' | 'target_has_pending' | 'error'> {
  if (getOutgoingRequest(storage) !== null) return 'already_have_outgoing'
  if (getShareStatus(storage) !== null) return 'error'

  const currentUser = getUsername()
  if (!currentUser) return 'error'

  const normalized = targetUsername.toLowerCase()
  const result = await kvCrossSet(normalized, 'share:incomingRequest', {
    fromUsername: currentUser,
    sentAt: Date.now(),
  })

  if (result === 'already_pending') return 'target_has_pending'
  if (result === 'error') return 'error'

  setOutgoingRequest({ toUsername: normalized, sentAt: Date.now() }, storage)
  return 'sent'
}

export async function acceptShareRequest(
  fromUsername: string,
  storage: Storage = window.localStorage,
): Promise<void> {
  setShareStatus({ partnerUsername: fromUsername, since: Date.now() }, storage)
  clearLocalIncomingRequest(storage)

  const currentUser = getUsername()
  if (currentUser) {
    void kvCrossSet(fromUsername, 'share:acceptNotification', {
      byUsername: currentUser,
      at: Date.now(),
    })
  }

  // Initial pull from partner
  const { kvCrossReadPartner } = await import('./cloudStorage')
  try {
    const result = await kvCrossReadPartner(fromUsername)
    if (result !== null) {
      const localIds = new Set(getCitations(storage).map(c => c.id))
      for (const citation of result.citations) {
        if (!localIds.has(citation.id)) {
          upsertCitation(citation, storage)
        }
      }
      const { deleteCitationSilent } = await import('./citations')
      const updatedIds = new Set(getCitations(storage).map(c => c.id))
      for (const deletedId of result.deleteLog) {
        if (updatedIds.has(deletedId)) {
          deleteCitationSilent(deletedId, storage)
        }
      }
    }
  } catch { /* silent */ }
}

export function declineShareRequest(storage: Storage = window.localStorage): void {
  clearLocalIncomingRequest(storage)
}

export function stopSharing(storage: Storage = window.localStorage): void {
  clearShareStatus(storage)
  clearDeleteLog(storage)
  clearOutgoingRequest(storage)
}

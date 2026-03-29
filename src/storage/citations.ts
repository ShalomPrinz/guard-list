import type { Citation } from '../types'
import { kvSet, kvDel } from './cloudStorage'
import { getShareStatus, appendToDeleteLog } from './citationShare'

const KEY = 'citations'

export function getCitations(storage: Storage = window.localStorage): Citation[] {
  const raw = storage.getItem(KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as Citation[]
  } catch {
    return []
  }
}

export function saveCitations(citations: Citation[], storage: Storage = window.localStorage): void {
  storage.setItem(KEY, JSON.stringify(citations))
}

export function upsertCitation(citation: Citation, storage: Storage = window.localStorage): void {
  const citations = getCitations(storage)
  const idx = citations.findIndex(c => c.id === citation.id)
  if (idx >= 0) {
    citations[idx] = citation
  } else {
    citations.push(citation)
  }
  saveCitations(citations, storage)
  void kvSet('citations:' + citation.id, citation)
}

export function deleteCitation(id: string, storage: Storage = window.localStorage): void {
  if (getShareStatus(storage) !== null) {
    appendToDeleteLog(id, storage)
  }
  saveCitations(getCitations(storage).filter(c => c.id !== id), storage)
  void kvDel('citations:' + id)
}

export function deleteCitationSilent(id: string, storage: Storage = window.localStorage): void {
  saveCitations(getCitations(storage).filter(c => c.id !== id), storage)
}

export function markCitationUsed(id: string, scheduleId: string, storage: Storage = window.localStorage): void {
  const citations = getCitations(storage)
  const idx = citations.findIndex(c => c.id === id)
  if (idx >= 0 && !citations[idx].usedInListIds.includes(scheduleId)) {
    citations[idx] = { ...citations[idx], usedInListIds: [...citations[idx].usedInListIds, scheduleId] }
    saveCitations(citations, storage)
    void kvSet('citations:' + id, citations[idx])
  }
}

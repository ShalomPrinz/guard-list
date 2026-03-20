import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'
import { getCitations, saveCitations, upsertCitation, deleteCitation, markCitationUsed } from './citations'
import type { Citation } from '../types'

function makeCitation(id: string, overrides: Partial<Citation> = {}): Citation {
  return { id, text: `text-${id}`, author: 'author', usedInListIds: [], ...overrides }
}

let storage: Storage

beforeEach(() => {
  storage = createLocalStorageMock()
})

describe('getCitations', () => {
  it('returns empty array when nothing saved', () => {
    expect(getCitations(storage)).toEqual([])
  })

  it('returns parsed citations', () => {
    const c = makeCitation('a')
    saveCitations([c], storage)
    expect(getCitations(storage)).toEqual([c])
  })
})

describe('upsertCitation', () => {
  it('adds a new citation', () => {
    const c = makeCitation('a')
    upsertCitation(c, storage)
    expect(getCitations(storage)).toEqual([c])
  })

  it('updates existing citation without changing id', () => {
    const c = makeCitation('a', { text: 'original' })
    upsertCitation(c, storage)
    const updated = { ...c, text: 'updated' }
    upsertCitation(updated, storage)
    const all = getCitations(storage)
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('a')
    expect(all[0].text).toBe('updated')
  })
})

describe('deleteCitation', () => {
  it('removes the citation from storage', () => {
    upsertCitation(makeCitation('a'), storage)
    upsertCitation(makeCitation('b'), storage)
    deleteCitation('a', storage)
    const all = getCitations(storage)
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('b')
  })

  it('does nothing when id not found', () => {
    upsertCitation(makeCitation('a'), storage)
    deleteCitation('x', storage)
    expect(getCitations(storage)).toHaveLength(1)
  })
})

describe('markCitationUsed', () => {
  it('adds scheduleId to usedInListIds', () => {
    upsertCitation(makeCitation('a'), storage)
    markCitationUsed('a', 's1', storage)
    const c = getCitations(storage)[0]
    expect(c.usedInListIds).toContain('s1')
  })

  it('does not add duplicate scheduleId', () => {
    upsertCitation(makeCitation('a'), storage)
    markCitationUsed('a', 's1', storage)
    markCitationUsed('a', 's1', storage)
    const c = getCitations(storage)[0]
    expect(c.usedInListIds).toHaveLength(1)
  })

  it('does nothing when citation not found', () => {
    markCitationUsed('missing', 's1', storage)
    // no error thrown
    expect(getCitations(storage)).toHaveLength(0)
  })
})

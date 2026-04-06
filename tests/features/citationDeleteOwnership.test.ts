/**
 * Regression tests for citation delete ownership enforcement.
 * Verifies that deleteCitation blocks deletion of citations owned by other users.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import { getCitations, upsertCitation, deleteCitation } from '@/storage/citations'
import { setUsername } from '@/storage/userStorage'
import type { Citation } from '@/types'

vi.mock('@/storage/cloudStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/storage/cloudStorage')>()
  return {
    ...actual,
    kvDel: vi.fn().mockResolvedValue(undefined),
    kvSet: vi.fn().mockResolvedValue(undefined),
  }
})

function makeCitation(id: string, overrides: Partial<Citation> = {}): Citation {
  return { id, text: `text-${id}`, author: 'א. מחבר', usedInListIds: [], ...overrides }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('deleteCitation ownership enforcement', () => {
  it('does NOT delete a citation whose createdByUsername differs from current user', () => {
    setUsername('alice')
    upsertCitation(makeCitation('c1', { createdByUsername: 'bob' }))

    deleteCitation('c1')

    expect(getCitations()).toHaveLength(1)
    expect(getCitations()[0].id).toBe('c1')
  })

  it('deletes a citation whose createdByUsername matches current user', () => {
    setUsername('alice')
    upsertCitation(makeCitation('c1', { createdByUsername: 'alice' }))

    deleteCitation('c1')

    expect(getCitations()).toHaveLength(0)
  })

  it('deletes a legacy citation with no createdByUsername (treated as owned)', () => {
    setUsername('alice')
    upsertCitation(makeCitation('c1')) // no createdByUsername

    deleteCitation('c1')

    expect(getCitations()).toHaveLength(0)
  })

  it('does not delete when no current user is set and citation has an owner', () => {
    // No setUsername call — getUsername() returns null
    upsertCitation(makeCitation('c1', { createdByUsername: 'bob' }))

    deleteCitation('c1')

    expect(getCitations()).toHaveLength(1)
  })
})

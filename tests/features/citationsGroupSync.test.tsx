/**
 * Tests for group citation sync on CitationsScreen mount.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CitationsScreen from '@/screens/CitationsScreen'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import { upsertCitation, getCitations } from '@/storage/citations'
import { setLocalGroup } from '@/storage/citationShare'
import type { Citation } from '@/types'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { mockKvCrossReadGroupMember } = vi.hoisted(() => ({
  mockKvCrossReadGroupMember: vi.fn(),
}))

vi.mock('@/storage/cloudStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/storage/cloudStorage')>()
  return {
    ...actual,
    syncFromCloud: vi.fn().mockResolvedValue(undefined),
    kvCrossReadGroupMember: mockKvCrossReadGroupMember,
  }
})

vi.mock('@/storage/userStorage', () => ({
  getUsername: vi.fn(() => 'alice'),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCitation(id: string, overrides: Partial<Citation> = {}): Citation {
  return { id, text: `text-${id}`, author: 'א. מחבר', usedInListIds: [], ...overrides }
}

function renderCitations() {
  return render(
    <MemoryRouter initialEntries={['/citations']}>
      <Routes>
        <Route path="/citations" element={<CitationsScreen />} />
        <Route path="/" element={<div>דף הבית</div>} />
        <Route path="/sharing-center" element={<div>שיתוף</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
  mockKvCrossReadGroupMember.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CitationsScreen — group sync on mount', () => {
  it('shows loading indicator while syncing', async () => {
    setLocalGroup({ groupId: 'g1', members: ['alice', 'bob'], joinedAt: Date.now() })
    // Delay resolution so we can observe the loading state
    mockKvCrossReadGroupMember.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(null), 100)),
    )
    renderCitations()
    expect(screen.getByText('מסנכרן ציטוטים...')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('מסנכרן ציטוטים...')).toBeNull())
  })

  it('merges new citations from a group member into the list', async () => {
    setLocalGroup({ groupId: 'g1', members: ['alice', 'bob'], joinedAt: Date.now() })
    const bobCitation = makeCitation('bob-c1', { text: 'ציטוט של בוב', createdByUsername: 'bob' })
    mockKvCrossReadGroupMember.mockResolvedValue({ citations: [bobCitation], deleteLog: [] })

    renderCitations()
    await waitFor(() => expect(screen.queryByText('מסנכרן ציטוטים...')).toBeNull())

    expect(screen.getByText('ציטוט של בוב')).toBeTruthy()
    expect(mockKvCrossReadGroupMember).toHaveBeenCalledWith('bob')
  })

  it('does not duplicate a citation already present locally', async () => {
    setLocalGroup({ groupId: 'g1', members: ['alice', 'bob'], joinedAt: Date.now() })
    const existingCitation = makeCitation('shared-c1', { text: 'ציטוט משותף' })
    upsertCitation(existingCitation)

    mockKvCrossReadGroupMember.mockResolvedValue({ citations: [existingCitation], deleteLog: [] })

    renderCitations()
    await waitFor(() => expect(screen.queryByText('מסנכרן ציטוטים...')).toBeNull())

    const items = screen.getAllByText('ציטוט משותף')
    expect(items).toHaveLength(1)
    expect(getCitations()).toHaveLength(1)
  })

  it('applies delete log from group member — removes matching local citation', async () => {
    setLocalGroup({ groupId: 'g1', members: ['alice', 'bob'], joinedAt: Date.now() })
    const toDelete = makeCitation('del-c1', { text: 'למחיקה' })
    upsertCitation(toDelete)

    mockKvCrossReadGroupMember.mockResolvedValue({ citations: [], deleteLog: ['del-c1'] })

    renderCitations()
    await waitFor(() => expect(screen.queryByText('מסנכרן ציטוטים...')).toBeNull())

    expect(screen.queryByText('למחיקה')).toBeNull()
    expect(getCitations().find(c => c.id === 'del-c1')).toBeUndefined()
  })

  it('skips sync and hides loader immediately when not in a group', async () => {
    // No group set in localStorage
    mockKvCrossReadGroupMember.mockResolvedValue({ citations: [], deleteLog: [] })

    renderCitations()
    await waitFor(() => expect(screen.queryByText('מסנכרן ציטוטים...')).toBeNull())
    expect(mockKvCrossReadGroupMember).not.toHaveBeenCalled()
  })

  it('handles kvCrossReadGroupMember returning null gracefully', async () => {
    setLocalGroup({ groupId: 'g1', members: ['alice', 'bob'], joinedAt: Date.now() })
    mockKvCrossReadGroupMember.mockResolvedValue(null)

    renderCitations()
    await waitFor(() => expect(screen.queryByText('מסנכרן ציטוטים...')).toBeNull())
    expect(screen.getByText('אין ציטוטים עדיין.')).toBeTruthy()
  })

  it('syncs citations from multiple group members', async () => {
    setLocalGroup({ groupId: 'g1', members: ['alice', 'bob', 'charlie'], joinedAt: Date.now() })
    const bobCitation = makeCitation('b1', { text: 'ציטוט בוב', createdByUsername: 'bob' })
    const charlieCitation = makeCitation('c1', { text: "ציטוט צ'ארלי", createdByUsername: 'charlie' })
    mockKvCrossReadGroupMember
      .mockResolvedValueOnce({ citations: [bobCitation], deleteLog: [] })
      .mockResolvedValueOnce({ citations: [charlieCitation], deleteLog: [] })

    renderCitations()
    await waitFor(() => expect(screen.queryByText('מסנכרן ציטוטים...')).toBeNull())

    expect(screen.getByText('ציטוט בוב')).toBeTruthy()
    expect(screen.getByText("ציטוט צ'ארלי")).toBeTruthy()
    expect(mockKvCrossReadGroupMember).toHaveBeenCalledTimes(2)
    expect(mockKvCrossReadGroupMember).toHaveBeenCalledWith('bob')
    expect(mockKvCrossReadGroupMember).toHaveBeenCalledWith('charlie')
  })
})

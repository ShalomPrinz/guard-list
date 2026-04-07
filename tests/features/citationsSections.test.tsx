import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CitationsScreen from '@/screens/CitationsScreen'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import type { Citation } from '@/types'

function makeCitation(id: string, overrides: Partial<Citation> = {}): Citation {
  return {
    id,
    text: `ציטוט ${id}`,
    author: `מחבר ${id}`,
    usedInListIds: [],
    createdByUsername: undefined,
    ...overrides,
  }
}

function renderCitations(storage: ReturnType<typeof createLocalStorageMock>) {
  vi.stubGlobal('localStorage', storage)
  return render(
    <MemoryRouter initialEntries={['/citations']}>
      <Routes>
        <Route path="/citations" element={<CitationsScreen />} />
        <Route path="/" element={<div>דף הבית</div>} />
        <Route path="/sharing-center" element={<div>Sharing Center</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Citations Sections by Creator', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('renders citations from two different createdByUsername values in separate sections', async () => {
    const storage = createLocalStorageMock()
    storage.setItem('username', 'alice')
    const citations: Citation[] = [
      makeCitation('1', { createdByUsername: undefined }), // mine (alice)
      makeCitation('2', { createdByUsername: 'alice' }),   // also mine
      makeCitation('3', { createdByUsername: 'bob' }),     // bob's
      makeCitation('4', { createdByUsername: 'bob' }),     // bob's
    ]
    storage.setItem('citations', JSON.stringify(citations))
    renderCitations(storage)

    await waitFor(() => {
      expect(screen.getByText('הציטוטים שלי')).toBeTruthy()
    })

    // Current user's section header
    expect(screen.getByText('הציטוטים שלי')).toBeTruthy()
    // Other user's section header
    expect(screen.getByText('bob')).toBeTruthy()
  })

  it('renders current user section before other user sections', async () => {
    const storage = createLocalStorageMock()
    storage.setItem('username', 'alice')
    const citations: Citation[] = [
      makeCitation('1', { createdByUsername: 'bob' }),
      makeCitation('2', { createdByUsername: undefined }), // alice's
    ]
    storage.setItem('citations', JSON.stringify(citations))
    renderCitations(storage)

    await waitFor(() => {
      expect(screen.getByText('הציטוטים שלי')).toBeTruthy()
    })

    const headings = screen.getAllByRole('heading').map(h => h.textContent)
    // "הציטוטים שלי" should appear before "bob" in the DOM
    const myIdx = headings.findIndex(t => t === 'הציטוטים שלי')
    const bobIdx = headings.findIndex(t => t === 'bob')
    expect(myIdx).toBeLessThan(bobIdx)
  })

  it('shows "טען עוד ציטוטים" button only when section has more than 3 citations', async () => {
    const storage = createLocalStorageMock()
    storage.setItem('username', 'alice')
    // alice has 4 citations → button shown; bob has 2 → button NOT shown
    const citations: Citation[] = [
      makeCitation('a1', { createdByUsername: undefined }),
      makeCitation('a2', { createdByUsername: undefined }),
      makeCitation('a3', { createdByUsername: undefined }),
      makeCitation('a4', { createdByUsername: undefined }),
      makeCitation('b1', { createdByUsername: 'bob' }),
      makeCitation('b2', { createdByUsername: 'bob' }),
    ]
    storage.setItem('citations', JSON.stringify(citations))
    renderCitations(storage)

    await waitFor(() => {
      expect(screen.getByText('הציטוטים שלי')).toBeTruthy()
    })

    // alice has 4 → load more button exists
    expect(screen.getByText('טען עוד ציטוטים')).toBeTruthy()

    // bob has 2 → only one button total
    const loadMoreButtons = screen.getAllByText('טען עוד ציטוטים')
    expect(loadMoreButtons).toHaveLength(1)
  })

  it('does not show "טען עוד ציטוטים" when section has exactly 3 citations', async () => {
    const storage = createLocalStorageMock()
    storage.setItem('username', 'alice')
    const citations: Citation[] = [
      makeCitation('1', { createdByUsername: undefined }),
      makeCitation('2', { createdByUsername: undefined }),
      makeCitation('3', { createdByUsername: undefined }),
    ]
    storage.setItem('citations', JSON.stringify(citations))
    renderCitations(storage)

    await waitFor(() => {
      expect(screen.getByText('הציטוטים שלי')).toBeTruthy()
    })

    expect(screen.queryByText('טען עוד ציטוטים')).toBeNull()
  })

  it('each section starts with only 3 visible citations', async () => {
    const storage = createLocalStorageMock()
    storage.setItem('username', 'alice')
    const citations: Citation[] = Array.from({ length: 5 }, (_, i) =>
      makeCitation(`a${i}`, { text: `ציטוט alice ${i}`, createdByUsername: undefined })
    )
    storage.setItem('citations', JSON.stringify(citations))
    renderCitations(storage)

    await waitFor(() => {
      expect(screen.getByText('הציטוטים שלי')).toBeTruthy()
    })

    // First 3 should be visible
    expect(screen.getByText('ציטוט alice 0')).toBeTruthy()
    expect(screen.getByText('ציטוט alice 1')).toBeTruthy()
    expect(screen.getByText('ציטוט alice 2')).toBeTruthy()
    // 4th and 5th should NOT be visible yet
    expect(screen.queryByText('ציטוט alice 3')).toBeNull()
    expect(screen.queryByText('ציטוט alice 4')).toBeNull()
  })

  it('loads more citations when "טען עוד ציטוטים" is clicked', async () => {
    const storage = createLocalStorageMock()
    storage.setItem('username', 'alice')
    const citations: Citation[] = Array.from({ length: 5 }, (_, i) =>
      makeCitation(`a${i}`, { text: `ציטוט alice ${i}`, createdByUsername: undefined })
    )
    storage.setItem('citations', JSON.stringify(citations))
    renderCitations(storage)

    await waitFor(() => {
      expect(screen.getByText('טען עוד ציטוטים')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('טען עוד ציטוטים'))

    await waitFor(() => {
      expect(screen.getByText('ציטוט alice 3')).toBeTruthy()
      expect(screen.getByText('ציטוט alice 4')).toBeTruthy()
    })
  })

  it('does not render empty sections for users with no citations', async () => {
    const storage = createLocalStorageMock()
    storage.setItem('username', 'alice')
    // Only alice has citations — bob section should not appear
    const citations: Citation[] = [
      makeCitation('1', { createdByUsername: undefined }),
    ]
    storage.setItem('citations', JSON.stringify(citations))
    renderCitations(storage)

    await waitFor(() => {
      expect(screen.getByText('הציטוטים שלי')).toBeTruthy()
    })

    expect(screen.queryByText('bob')).toBeNull()
  })

  it('filters within each section when search is active (both sections remain visible with matching citations)', async () => {
    const storage = createLocalStorageMock()
    storage.setItem('username', 'alice')
    const citations: Citation[] = [
      makeCitation('1', { text: 'ציטוט מיוחד', createdByUsername: undefined }),
      makeCitation('2', { text: 'ציטוט רגיל', createdByUsername: undefined }),
      makeCitation('3', { text: 'ציטוט מיוחד של בוב', createdByUsername: 'bob' }),
      makeCitation('4', { text: 'ציטוט אחר של בוב', createdByUsername: 'bob' }),
    ]
    storage.setItem('citations', JSON.stringify(citations))
    renderCitations(storage)

    await waitFor(() => {
      expect(screen.getByText('הציטוטים שלי')).toBeTruthy()
    })

    const searchInput = screen.getByPlaceholderText('חיפוש לפי טקסט או מחבר...')
    fireEvent.change(searchInput, { target: { value: 'מיוחד' } })

    await waitFor(() => {
      // Both sections still visible
      expect(screen.getByText('הציטוטים שלי')).toBeTruthy()
      expect(screen.getByText('bob')).toBeTruthy()
      // Only matching citations visible
      expect(screen.getByText('ציטוט מיוחד')).toBeTruthy()
      expect(screen.getByText('ציטוט מיוחד של בוב')).toBeTruthy()
      // Non-matching citations hidden
      expect(screen.queryByText('ציטוט רגיל')).toBeNull()
      expect(screen.queryByText('ציטוט אחר של בוב')).toBeNull()
    })
  })

  it('hides a section with no matches during search', async () => {
    const storage = createLocalStorageMock()
    storage.setItem('username', 'alice')
    const citations: Citation[] = [
      makeCitation('1', { text: 'ציטוט מיוחד', createdByUsername: undefined }),
      makeCitation('2', { text: 'ציטוט של בוב', createdByUsername: 'bob' }),
    ]
    storage.setItem('citations', JSON.stringify(citations))
    renderCitations(storage)

    await waitFor(() => {
      expect(screen.getByText('הציטוטים שלי')).toBeTruthy()
    })

    const searchInput = screen.getByPlaceholderText('חיפוש לפי טקסט או מחבר...')
    fireEvent.change(searchInput, { target: { value: 'מיוחד' } })

    await waitFor(() => {
      // Alice's section still visible (has a match)
      expect(screen.getByText('הציטוטים שלי')).toBeTruthy()
      // Bob's section is hidden (no matches)
      expect(screen.queryByText('bob')).toBeNull()
    })
  })

  it('shows global empty state when no section has matches during search', async () => {
    const storage = createLocalStorageMock()
    storage.setItem('username', 'alice')
    const citations: Citation[] = [
      makeCitation('1', { text: 'ציטוט רגיל', createdByUsername: undefined }),
    ]
    storage.setItem('citations', JSON.stringify(citations))
    renderCitations(storage)

    await waitFor(() => {
      expect(screen.getByText('הציטוטים שלי')).toBeTruthy()
    })

    const searchInput = screen.getByPlaceholderText('חיפוש לפי טקסט או מחבר...')
    fireEvent.change(searchInput, { target: { value: 'אין תוצאה' } })

    await waitFor(() => {
      expect(screen.getByText('אין תוצאות לחיפוש זה.')).toBeTruthy()
    })
  })

  it('resets each section back to showing 3 items when search query changes', async () => {
    const storage = createLocalStorageMock()
    storage.setItem('username', 'alice')
    // 5 citations that all match 'ציטוט'
    const citations: Citation[] = Array.from({ length: 5 }, (_, i) =>
      makeCitation(`a${i}`, { text: `ציטוט alice ${i}`, createdByUsername: undefined })
    )
    storage.setItem('citations', JSON.stringify(citations))
    renderCitations(storage)

    await waitFor(() => {
      expect(screen.getByText('הציטוטים שלי')).toBeTruthy()
    })

    // Load more to see all 5
    fireEvent.click(screen.getByText('טען עוד ציטוטים'))
    await waitFor(() => {
      expect(screen.getByText('ציטוט alice 4')).toBeTruthy()
    })

    // Now type a search — section should reset to 3 visible
    const searchInput = screen.getByPlaceholderText('חיפוש לפי טקסט או מחבר...')
    fireEvent.change(searchInput, { target: { value: 'ציטוט' } })

    await waitFor(() => {
      expect(screen.getByText('ציטוט alice 0')).toBeTruthy()
      expect(screen.getByText('ציטוט alice 2')).toBeTruthy()
      expect(screen.queryByText('ציטוט alice 3')).toBeNull()
      expect(screen.queryByText('ציטוט alice 4')).toBeNull()
    })
  })

  it('shows "הציטוטים שלי" label for legacy citations (no createdByUsername)', async () => {
    const storage = createLocalStorageMock()
    storage.setItem('username', 'alice')
    const citations: Citation[] = [
      makeCitation('1', { createdByUsername: undefined }), // legacy
    ]
    storage.setItem('citations', JSON.stringify(citations))
    renderCitations(storage)

    await waitFor(() => {
      expect(screen.getByText('הציטוטים שלי')).toBeTruthy()
    })
  })
})

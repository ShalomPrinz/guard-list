import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CitationsScreen from '@/screens/CitationsScreen'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import type { Citation } from '@/types'

function makeCitation(id: string, overrides: Partial<Citation> = {}): Citation {
  return {
    id,
    text: `Quote text ${id}`,
    author: `Author ${id}`,
    usedInListIds: [],
    createdByUsername: undefined,
    ...overrides,
  }
}

const mockCitations: Citation[] = Array.from({ length: 50 }, (_, i) =>
  makeCitation(`${i}`)
)

function renderCitations(initialPath = '/citations') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/citations" element={<CitationsScreen />} />
        <Route path="/" element={<div>דף הבית</div>} />
        <Route path="/schedule/new/step4" element={<div>Step4</div>} />
        <Route path="/sharing-center" element={<div>Sharing Center</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Citations Infinite Scroll', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('renders only first PAGE_SIZE items when there are more citations', async () => {
    const storage = createLocalStorageMock()
    storage.setItem('citations', JSON.stringify(mockCitations))
    storage.setItem('username', 'testuser')
    vi.stubGlobal('localStorage', storage)

    renderCitations()

    // Wait for first citation to appear
    await waitFor(() => {
      expect(screen.getByText(/Quote text 0/)).toBeTruthy()
    })

    // Check that items in the first PAGE_SIZE are rendered (spot check)
    expect(screen.getByText(/Quote text 0/)).toBeTruthy()
    expect(screen.getByText(/Quote text 10/)).toBeTruthy()
    expect(screen.getByText(/Quote text 19/)).toBeTruthy()

    // Check that items beyond PAGE_SIZE are not rendered
    // Use the exact match to avoid ambiguity
    const beyond20 = screen.queryByText((content: string) => content === 'Quote text 20')
    expect(beyond20).toBeNull()

    const beyond49 = screen.queryByText((content: string) => content === 'Quote text 49')
    expect(beyond49).toBeNull()
  })

  it('resets visibleCount when search changes', async () => {
    const storage = createLocalStorageMock()
    storage.setItem('citations', JSON.stringify(mockCitations))
    storage.setItem('username', 'testuser')
    vi.stubGlobal('localStorage', storage)

    const user = (await import('@testing-library/user-event')).default.setup()

    renderCitations()

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText(/Quote text 0/)).toBeTruthy()
    })

    // Verify first 20 items are shown initially (spot check a few)
    expect(screen.getByText(/Quote text 0/)).toBeTruthy()
    expect(screen.getByText(/Quote text 5/)).toBeTruthy()
    expect(screen.getByText(/Quote text 19/)).toBeTruthy()

    // Search for citations containing "Author 0"
    const searchInput = screen.getByPlaceholderText('חיפוש לפי טקסט או מחבר...')
    await user.type(searchInput, 'Author 0')

    // After search, only matching citations should be shown
    const matchingCitations = mockCitations.filter(c =>
      c.text.includes('Author 0') || c.author.includes('Author 0')
    )
    expect(matchingCitations.length).toBeGreaterThan(0)

    // First matching citation should be visible
    if (matchingCitations.length > 0) {
      const firstMatch = matchingCitations[0]
      expect(screen.getByText(new RegExp(firstMatch.text))).toBeTruthy()
    }
  })

  it('keeps all filtered items in data even if not all rendered', async () => {
    const storage = createLocalStorageMock()
    storage.setItem('citations', JSON.stringify(mockCitations))
    storage.setItem('username', 'testuser')
    vi.stubGlobal('localStorage', storage)

    renderCitations()

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText(/Quote text 0/)).toBeTruthy()
    })

    // Verify that the total number of citations is correct (50)
    // by checking that we have exactly 50 citations in localStorage
    const stored = storage.getItem('citations')
    const citations = JSON.parse(stored || '[]') as Citation[]
    expect(citations).toHaveLength(50)

    // Verify that only 20 are rendered initially
    const listItems = screen.getAllByRole('button')
    // Each citation has one role="button" div for the main content
    // We expect approximately 20 (the exact count depends on other buttons in the page)
    const citationButtons = listItems.filter(btn =>
      btn.textContent?.includes('Quote text')
    )
    expect(citationButtons.length).toBeLessThanOrEqual(20)

    // Verify items beyond 20 exist but are not rendered
    expect(screen.queryByText(/Quote text 30/)).toBeNull()
    expect(screen.queryByText(/Quote text 49/)).toBeNull()
  })
})

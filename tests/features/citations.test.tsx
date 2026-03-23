/**
 * E2E tests for Citation Management.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CitationsScreen from '@/screens/CitationsScreen'
import StatisticsScreen from '@/screens/StatisticsScreen'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import { getCitations, upsertCitation, deleteCitation, markCitationUsed } from '@/storage/citations'
import { getCitationAuthorLinks, saveCitationAuthorLink, skipCitationAuthorLink } from '@/storage/citationAuthorLinks'
import { upsertGroup } from '@/storage/groups'
import { formatAuthorName, pickRandomCitation } from '@/logic/citations'
import type { Citation } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCitation(id: string, overrides: Partial<Citation> = {}): Citation {
  return { id, text: `text-${id}`, author: 'א. מחבר', usedInListIds: [], ...overrides }
}

function renderCitations(initialPath = '/citations', state?: Record<string, unknown>) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: initialPath, state }]}>
      <Routes>
        <Route path="/citations" element={<CitationsScreen />} />
        <Route path="/" element={<div>דף הבית</div>} />
        <Route path="/schedule/new/step4" element={<div>Step4</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderStatistics() {
  return render(
    <MemoryRouter initialEntries={['/statistics']}>
      <Routes>
        <Route path="/statistics" element={<StatisticsScreen />} />
        <Route path="/" element={<div>דף הבית</div>} />
        <Route path="/statistics/:participantName" element={<div>History</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Unit: Author formatting ───────────────────────────────────────────────────

describe('formatAuthorName', () => {
  it('formats "יוסי ישראלי" → "י. ישראלי"', () => {
    expect(formatAuthorName('יוסי ישראלי')).toBe('י. ישראלי')
  })

  it('leaves single word unchanged', () => {
    expect(formatAuthorName('ישראלי')).toBe('ישראלי')
  })

  it('formats "דוד בן גוריון" → "ד. בן גוריון"', () => {
    expect(formatAuthorName('דוד בן גוריון')).toBe('ד. בן גוריון')
  })
})

// ─── Unit: Random citation selection ──────────────────────────────────────────

describe('pickRandomCitation', () => {
  it('skips already-used citations when unused ones are available', () => {
    const used = makeCitation('a', { usedInListIds: ['s1'] })
    const unused = makeCitation('b', { usedInListIds: [] })
    const result = pickRandomCitation([used, unused])
    expect(result?.id).toBe('b')
  })

  it('when all citations are used, picks the least-used one', () => {
    const heavy = makeCitation('a', { usedInListIds: ['s1', 's2'] })
    const light = makeCitation('b', { usedInListIds: ['s1'] })
    const result = pickRandomCitation([heavy, light])
    expect(result?.id).toBe('b')
  })
})

// ─── Storage: Adding a citation persists to localStorage ──────────────────────

describe('Citation storage', () => {
  it('adding a citation persists it to localStorage', () => {
    const c = makeCitation('c1', { text: 'שלום עולם', author: 'א. מחבר' })
    upsertCitation(c)
    const all = getCitations()
    expect(all).toHaveLength(1)
    expect(all[0].text).toBe('שלום עולם')
  })

  it('editing a citation updates it without changing its id', () => {
    upsertCitation(makeCitation('c1', { text: 'מקורי' }))
    upsertCitation({ ...makeCitation('c1'), text: 'עודכן' })
    const all = getCitations()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('c1')
    expect(all[0].text).toBe('עודכן')
  })

  it('deleting a citation removes it from localStorage', () => {
    upsertCitation(makeCitation('c1'))
    upsertCitation(makeCitation('c2'))
    deleteCitation('c1')
    const all = getCitations()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('c2')
  })

  it('markCitationUsed adds scheduleId to usedInListIds', () => {
    upsertCitation(makeCitation('c1'))
    markCitationUsed('c1', 'schedule-42')
    const c = getCitations()[0]
    expect(c.usedInListIds).toContain('schedule-42')
  })
})

// ─── CitationsScreen: list and search ─────────────────────────────────────────

describe('CitationsScreen', () => {
  it('displays a saved citation', () => {
    upsertCitation(makeCitation('c1', { text: 'ציטוט יפה', author: 'י. כהן' }))
    renderCitations()
    expect(screen.getByText('ציטוט יפה')).toBeTruthy()
  })

  it('shows "נוצל" badge for used citations', () => {
    upsertCitation(makeCitation('c1', { text: 'בשימוש', usedInListIds: ['s1'] }))
    renderCitations()
    expect(screen.getByText('נוצל')).toBeTruthy()
  })

  it('filters by text in real time', async () => {
    const user = userEvent.setup()
    upsertCitation(makeCitation('c1', { text: 'ציטוט על אמץ', author: 'א. א' }))
    upsertCitation(makeCitation('c2', { text: 'ציטוט על שלום', author: 'ב. ב' }))
    renderCitations()

    await user.type(screen.getByPlaceholderText('חיפוש לפי טקסט או מחבר...'), 'אמץ')

    expect(screen.getByText('ציטוט על אמץ')).toBeTruthy()
    expect(screen.queryByText('ציטוט על שלום')).toBeNull()
  })

  it('filters by author in real time', async () => {
    const user = userEvent.setup()
    upsertCitation(makeCitation('c1', { text: 'text1', author: 'א. כהן' }))
    upsertCitation(makeCitation('c2', { text: 'text2', author: 'ב. לוי' }))
    renderCitations()

    await user.type(screen.getByPlaceholderText('חיפוש לפי טקסט או מחבר...'), 'כהן')

    expect(screen.getByText('text1')).toBeTruthy()
    expect(screen.queryByText('text2')).toBeNull()
  })

  it('adds a new citation via the form', async () => {
    const user = userEvent.setup()
    renderCitations()

    await user.click(screen.getByText('+ הוסף ציטוט'))
    await user.type(screen.getByPlaceholderText('הכנס טקסט ציטוט...'), 'ציטוט חדש')
    await user.type(screen.getByPlaceholderText('שם המחבר...'), 'יוסי ישראלי')
    await user.click(screen.getByText('שמור'))

    await waitFor(() => {
      expect(getCitations()).toHaveLength(1)
      expect(getCitations()[0].text).toBe('ציטוט חדש')
    })
  })

  it('shows author formatting preview while typing', async () => {
    const user = userEvent.setup()
    renderCitations()

    await user.click(screen.getByText('+ הוסף ציטוט'))
    await user.type(screen.getByPlaceholderText('שם המחבר...'), 'יוסי ישראלי')

    expect(screen.getByText(/יוצג כ:/)).toBeTruthy()
    expect(screen.getByText(/י\. ישראלי/)).toBeTruthy()
  })

  it('applies author formatting on blur', async () => {
    const user = userEvent.setup()
    renderCitations()

    await user.click(screen.getByText('+ הוסף ציטוט'))
    const authorInput = screen.getByPlaceholderText('שם המחבר...')
    await user.type(authorInput, 'יוסי ישראלי')
    await user.tab() // trigger blur

    await waitFor(() => {
      expect((authorInput as HTMLInputElement).value).toBe('י. ישראלי')
    })
  })

  it('deletes a citation after confirmation', async () => {
    const user = userEvent.setup()
    upsertCitation(makeCitation('c1', { text: 'למחיקה' }))
    renderCitations()

    await user.click(screen.getByText('למחיקה'))
    // Open edit modal, then click delete, then confirm
    const deleteBtn = await screen.findByRole('button', { name: 'מחיקה' })
    await user.click(deleteBtn)
    // Confirmation dialog: click the confirm button
    const buttons = screen.getAllByRole('button', { name: 'מחיקה' })
    await user.click(buttons[buttons.length - 1])

    await waitFor(() => {
      expect(getCitations()).toHaveLength(0)
    })
  })
})

// ─── CitationsScreen: selection mode ──────────────────────────────────────────

describe('CitationsScreen selection mode', () => {
  it('shows "בחר ציטוט" title in selection mode', () => {
    renderCitations('/citations', { selectionMode: true })
    expect(screen.getByText('בחר ציטוט')).toBeTruthy()
  })

  it('tapping a citation in selection mode navigates to Step4 with citation state', async () => {
    const user = userEvent.setup()
    upsertCitation(makeCitation('c1', { text: 'ציטוט לבחירה' }))

    render(
      <MemoryRouter initialEntries={[{ pathname: '/citations', state: { selectionMode: true } }]}>
        <Routes>
          <Route path="/citations" element={<CitationsScreen />} />
          <Route path="/schedule/new/step4" element={<div data-testid="step4">Step4</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByText('ציטוט לבחירה'))

    await waitFor(() => {
      expect(screen.getByTestId('step4')).toBeTruthy()
    })
  })
})

// ─── Statistics: tabs ─────────────────────────────────────────────────────────

describe('StatisticsScreen tabs', () => {
  it('defaults to "זמני שמירה" tab', () => {
    renderStatistics()
    expect(screen.getByText('זמני שמירה')).toBeTruthy()
    expect(screen.getByText('ציטוטים')).toBeTruthy()
  })

  it('switches to citations tab', async () => {
    const user = userEvent.setup()
    renderStatistics()

    await user.click(screen.getByRole('button', { name: 'ציטוטים' }))

    expect(screen.getByText(/ציטוטים משויכים/)).toBeTruthy()
  })

  it('shows citation counts for warrior in citations tab via author link', async () => {
    const user = userEvent.setup()
    // Set up group with member
    upsertGroup({
      id: 'g1', name: 'מחלקה', createdAt: new Date().toISOString(),
      members: [{ id: 'm1', name: 'יוסי ישראלי', availability: 'base' }],
    })
    // Link "י. ישראלי" to member m1
    saveCitationAuthorLink('י. ישראלי', 'm1')
    // Add citation with that author (used)
    upsertCitation({ id: 'c1', text: 'ציטוט', author: 'י. ישראלי', usedInListIds: ['s1'] })

    renderStatistics()
    await user.click(screen.getByRole('button', { name: 'ציטוטים' }))

    expect(screen.getByText('יוסי ישראלי')).toBeTruthy()
    const ones = screen.getAllByText('1')
    expect(ones.length).toBeGreaterThanOrEqual(2) // inDB=1, used=1
  })

  it('falls back to name matching when no link exists', async () => {
    const user = userEvent.setup()
    upsertGroup({
      id: 'g1', name: 'מחלקה', createdAt: new Date().toISOString(),
      members: [{ id: 'm1', name: 'יוסי ישראלי', availability: 'base' }],
    })
    // No explicit link — citation author matches warrior's formatted name
    upsertCitation({ id: 'c1', text: 'ציטוט', author: 'י. ישראלי', usedInListIds: [] })

    renderStatistics()
    await user.click(screen.getByRole('button', { name: 'ציטוטים' }))

    expect(screen.getByText('יוסי ישראלי')).toBeTruthy()
  })

  it('hides warrior in citations tab when link is "skip"', async () => {
    const user = userEvent.setup()
    upsertGroup({
      id: 'g1', name: 'מחלקה', createdAt: new Date().toISOString(),
      members: [{ id: 'm1', name: 'יוסי ישראלי', availability: 'base' }],
    })
    skipCitationAuthorLink('י. ישראלי')
    upsertCitation({ id: 'c1', text: 'ציטוט', author: 'י. ישראלי', usedInListIds: [] })

    renderStatistics()
    await user.click(screen.getByRole('button', { name: 'ציטוטים' }))

    expect(screen.queryByText('יוסי ישראלי')).toBeNull()
  })
})

// ─── Citation author linkage storage ──────────────────────────────────────────

describe('citationAuthorLinks storage', () => {
  it('saveCitationAuthorLink stores a member mapping', () => {
    saveCitationAuthorLink('י. ישראלי', 'm1')
    expect(getCitationAuthorLinks()['י. ישראלי']).toBe('m1')
  })

  it('skipCitationAuthorLink stores "skip" marker', () => {
    skipCitationAuthorLink('י. ישראלי')
    expect(getCitationAuthorLinks()['י. ישראלי']).toBe('skip')
  })

  it('link prompt does not appear when link already exists', () => {
    // If the author is already linked, getCitationAuthorLinks returns a non-undefined value
    saveCitationAuthorLink('א. כהן', 'm2')
    const links = getCitationAuthorLinks()
    expect(links['א. כהן']).toBeDefined()
  })

  it('"skip" marker prevents future prompts', () => {
    skipCitationAuthorLink('א. כהן')
    const links = getCitationAuthorLinks()
    // 'skip' is defined, so the prompt condition (=== undefined) is false
    expect(links['א. כהן']).toBe('skip')
    expect(links['א. כהן'] === undefined).toBe(false)
  })
})

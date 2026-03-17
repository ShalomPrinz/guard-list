/**
 * E2E tests for StandbyScreen (כיתת כוננות).
 * All tests use an in-memory localStorage mock; no real DOM storage is touched.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import StandbyScreen, { formatStandbyText } from '../../src/screens/StandbyScreen'
import HomeScreen from '../../src/screens/HomeScreen'
import { createLocalStorageMock } from '../../src/tests/localStorageMock'
import { upsertGroup } from '../../src/storage/groups'
import type { Group } from '../../src/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderStandby(initialPath = '/standby') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/standby" element={<StandbyScreen />} />
        <Route path="/schedule/new/step1" element={<div>שלב 1</div>} />
        <Route path="/statistics" element={<div>סטטיסטיקות</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'מחלקה א',
    members: [
      { id: 'm1', name: 'Alice', availability: 'base' },
      { id: 'm2', name: 'Bob', availability: 'base' },
      { id: 'm3', name: 'Charlie', availability: 'home' },
    ],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── formatStandbyText unit tests ─────────────────────────────────────────────

describe('formatStandbyText', () => {
  it('formats a numbered list with title', () => {
    const text = formatStandbyText('כיתת כוננות', ['Alice', 'Bob', 'Charlie'])
    expect(text).toBe('כיתת כוננות\n\n1. Alice\n2. Bob\n3. Charlie')
  })

  it('returns only title and empty line when no names selected', () => {
    const text = formatStandbyText('כיתת כוננות', [])
    expect(text).toBe('כיתת כוננות\n')
  })

  it('uses custom title', () => {
    const text = formatStandbyText('כוננות לילה', ['David'])
    expect(text).toBe('כוננות לילה\n\n1. David')
  })
})

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('StandbyScreen — rendering', () => {
  it('renders all base members as selected checkboxes', () => {
    upsertGroup(makeGroup())
    renderStandby()

    const aliceCheckbox = screen.getByRole('checkbox', { name: 'Alice' })
    const bobCheckbox = screen.getByRole('checkbox', { name: 'Bob' })
    expect(aliceCheckbox).toBeTruthy()
    expect(bobCheckbox).toBeTruthy()
    expect((aliceCheckbox as HTMLInputElement).checked).toBe(true)
    expect((bobCheckbox as HTMLInputElement).checked).toBe(true)
  })

  it('renders home members as grayed out and non-selectable (no checkbox)', () => {
    upsertGroup(makeGroup())
    renderStandby()

    // Charlie is "home" — should not have a checkbox
    expect(screen.queryByRole('checkbox', { name: 'Charlie' })).toBeNull()
    // Charlie name should still be visible
    expect(screen.getByText('Charlie')).toBeTruthy()
  })

  it('shows the title input pre-filled with "כיתת כוננות"', () => {
    upsertGroup(makeGroup())
    renderStandby()

    const input = screen.getByDisplayValue('כיתת כוננות')
    expect(input).toBeTruthy()
  })

  it('shows back button', () => {
    upsertGroup(makeGroup())
    renderStandby()
    expect(screen.getByText('← חזרה לדף הבית')).toBeTruthy()
  })

  it('shows WhatsApp action buttons', () => {
    upsertGroup(makeGroup())
    renderStandby()
    expect(screen.getByText('📋 העתק לווטסאפ')).toBeTruthy()
    expect(screen.getByText('📤 שלח בווטסאפ')).toBeTruthy()
  })
})

// ─── Selection behavior ───────────────────────────────────────────────────────

describe('StandbyScreen — checkbox interaction', () => {
  it('deselecting a member removes them from the output', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())

    // Spy on clipboard to capture output
    let clipboardText = ''
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: async (t: string) => { clipboardText = t } },
    })

    renderStandby()

    // Deselect Bob
    const bobCheckbox = screen.getByRole('checkbox', { name: 'Bob' })
    await user.click(bobCheckbox)
    expect((bobCheckbox as HTMLInputElement).checked).toBe(false)

    // Copy to clipboard and verify Bob is absent
    await user.click(screen.getByText('📋 העתק לווטסאפ'))
    expect(clipboardText).toContain('Alice')
    expect(clipboardText).not.toContain('Bob')
  })
})

// ─── Select all / Deselect all ────────────────────────────────────────────────

describe('StandbyScreen — select all / deselect all', () => {
  it('"בחר הכל" selects all available (base) members', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderStandby()

    // First deselect Alice manually
    await user.click(screen.getByRole('checkbox', { name: 'Alice' }))
    expect((screen.getByRole('checkbox', { name: 'Alice' }) as HTMLInputElement).checked).toBe(false)

    // Now click "בחר הכל"
    await user.click(screen.getByText('בחר הכל'))
    expect((screen.getByRole('checkbox', { name: 'Alice' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: 'Bob' }) as HTMLInputElement).checked).toBe(true)
  })

  it('"בטל הכל" deselects all available members', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderStandby()

    // Initially all selected → button reads "בטל הכל"
    await user.click(screen.getByText('בטל הכל'))
    expect((screen.getByRole('checkbox', { name: 'Alice' }) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: 'Bob' }) as HTMLInputElement).checked).toBe(false)
  })

  it('button label toggles between "בחר הכל" and "בטל הכל"', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderStandby()

    // All selected → label is "בטל הכל"
    expect(screen.getByText('בטל הכל')).toBeTruthy()

    // Deselect one → label switches to "בחר הכל"
    await user.click(screen.getByRole('checkbox', { name: 'Alice' }))
    expect(screen.getByText('בחר הכל')).toBeTruthy()
  })
})

// ─── WhatsApp text format ─────────────────────────────────────────────────────

describe('StandbyScreen — WhatsApp output format', () => {
  it('produces a correctly numbered list with the default title', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())

    let clipboardText = ''
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: async (t: string) => { clipboardText = t } },
    })

    renderStandby()

    await user.click(screen.getByText('📋 העתק לווטסאפ'))
    expect(clipboardText).toBe('כיתת כוננות\n\n1. Alice\n2. Bob')
  })

  it('uses the custom title from the input field', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())

    let clipboardText = ''
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: async (t: string) => { clipboardText = t } },
    })

    renderStandby()

    const titleInput = screen.getByDisplayValue('כיתת כוננות')
    await user.clear(titleInput)
    await user.type(titleInput, 'כוננות לילה')

    await user.click(screen.getByText('📋 העתק לווטסאפ'))
    expect(clipboardText.startsWith('כוננות לילה')).toBe(true)
  })
})

// ─── Multiple groups ──────────────────────────────────────────────────────────

describe('StandbyScreen — multiple groups', () => {
  it('shows a group selector dropdown when multiple groups exist', () => {
    upsertGroup(makeGroup({ id: 'g1', name: 'מחלקה א' }))
    upsertGroup({
      id: 'g2',
      name: 'מחלקה ב',
      members: [{ id: 'm4', name: 'David', availability: 'base' }],
      createdAt: new Date().toISOString(),
    })
    renderStandby()

    const select = screen.getByRole('combobox')
    expect(select).toBeTruthy()
    expect(within(select as HTMLElement).getByText('מחלקה א')).toBeTruthy()
    expect(within(select as HTMLElement).getByText('מחלקה ב')).toBeTruthy()
  })

  it('selecting a different group updates the member list', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({ id: 'g1', name: 'מחלקה א' }))
    upsertGroup({
      id: 'g2',
      name: 'מחלקה ב',
      members: [{ id: 'm4', name: 'David', availability: 'base' }],
      createdAt: new Date().toISOString(),
    })
    renderStandby()

    // Initially shows group 1 members
    expect(screen.getByText('Alice')).toBeTruthy()

    // Switch to group 2
    await user.selectOptions(screen.getByRole('combobox'), 'g2')

    // Now shows group 2 member
    expect(screen.queryByText('Alice')).toBeNull()
    expect(screen.getByText('David')).toBeTruthy()
  })

  it('does not show group selector when only one group exists', () => {
    upsertGroup(makeGroup())
    renderStandby()

    expect(screen.queryByRole('combobox')).toBeNull()
  })
})

// ─── Back navigation ──────────────────────────────────────────────────────────

describe('StandbyScreen — back navigation', () => {
  it('clicking Back returns to HomeScreen', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderStandby()

    await user.click(screen.getByText('← חזרה לדף הבית'))

    // HomeScreen should be rendered (shows "קבוצות שמורות" section)
    expect(screen.getByText('קבוצות שמורות')).toBeTruthy()
  })
})

// ─── HomeScreen button ────────────────────────────────────────────────────────

describe('HomeScreen — כיתת כוננות button', () => {
  it('shows the כיתת כוננות button when groups exist', () => {
    upsertGroup(makeGroup())

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/standby" element={<StandbyScreen />} />
          <Route path="/schedule/new/step1" element={<div>שלב 1</div>} />
          <Route path="/statistics" element={<div>סטטיסטיקות</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('🛡️ כיתת כוננות')).toBeTruthy()
  })

  it('does not show כיתת כוננות button in welcome state (no groups)', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByText('🛡️ כיתת כוננות')).toBeNull()
  })

  it('clicking כיתת כוננות navigates to StandbyScreen', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/standby" element={<StandbyScreen />} />
          <Route path="/schedule/new/step1" element={<div>שלב 1</div>} />
          <Route path="/statistics" element={<div>סטטיסטיקות</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByText('🛡️ כיתת כוננות'))

    // StandbyScreen should render
    expect(screen.getByDisplayValue('כיתת כוננות')).toBeTruthy()
  })
})

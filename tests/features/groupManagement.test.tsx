/**
 * E2E tests for Group Management — HomeScreen + GroupEditScreen.
 * All tests use an in-memory localStorage mock; no real DOM storage is touched.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import HomeScreen from '@/screens/HomeScreen'
import GroupEditScreen from '@/screens/GroupEditScreen'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import { upsertGroup, getGroups, getGroupById } from '@/storage/groups'
import type { Group } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/group/:groupId/edit" element={<GroupEditScreen />} />
        <Route path="/statistics" element={<div>סטטיסטיקות</div>} />
        <Route path="/schedule/new/step1" element={<div>שלב 1</div>} />
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

// ─── HomeScreen — empty state ─────────────────────────────────────────────────

describe('HomeScreen — empty state', () => {
  it('shows welcome state when no groups exist', () => {
    renderApp()
    expect(screen.getByText('ברוך הבא! כדי להתחיל, צור קבוצת לוחמים שמורה')).toBeTruthy()
    expect(screen.getByText('צור קבוצה')).toBeTruthy()
  })

  it('shows empty schedules message when no schedules exist (requires a group)', () => {
    upsertGroup(makeGroup())
    renderApp()
    expect(screen.getByText('אין לוחות שמירה עדיין.')).toBeTruthy()
  })

  it('renders saved group cards when groups are present', () => {
    upsertGroup(makeGroup())
    renderApp()
    expect(screen.getByText('מחלקה א')).toBeTruthy()
  })
})

// ─── Group creation ───────────────────────────────────────────────────────────

describe('Group creation via modal', () => {
  it('creates a group with parsed members and persists to localStorage', async () => {
    const user = userEvent.setup()
    renderApp()

    // Welcome state — click the CTA to open creation modal
    await user.click(screen.getByText('צור קבוצה'))

    // Fill group name
    await user.type(screen.getByPlaceholderText("למשל: מחלקה א'"), 'פלוגה א')

    // Use the second textbox (textarea) since the first is the group name input
    const textboxes = screen.getAllByRole('textbox')
    await user.type(textboxes[1], 'Alice\nBob\nCharlie')

    await user.click(screen.getByText('צור'))

    const groups = getGroups()
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('פלוגה א')
    expect(groups[0].members).toHaveLength(3)
    expect(groups[0].members.map(m => m.name)).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  it('deduplicates member names on creation', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByText('צור קבוצה'))

    const textboxes = screen.getAllByRole('textbox')
    await user.type(textboxes[0], 'קבוצה')
    await user.type(textboxes[1], 'Alice\nAlice\nalice\nBob')

    await user.click(screen.getByText('צור'))

    const groups = getGroups()
    expect(groups[0].members).toHaveLength(2)
    expect(groups[0].members[0].name).toBe('Alice')
    expect(groups[0].members[1].name).toBe('Bob')
  })

  it('shows error when group name is empty', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByText('צור קבוצה'))
    await user.click(screen.getByText('צור'))

    expect(screen.getByText('שם הקבוצה נדרש')).toBeTruthy()
    expect(getGroups()).toHaveLength(0)
  })

  it('shows error when no members are provided', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByText('צור קבוצה'))
    await user.type(screen.getByPlaceholderText("למשל: מחלקה א'"), 'קבוצה')
    await user.click(screen.getByText('צור'))

    expect(screen.getByText('הוסף לפחות חבר אחד')).toBeTruthy()
  })

  it('all new members are initialized with base availability', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByText('צור קבוצה'))
    const textboxes = screen.getAllByRole('textbox')
    await user.type(textboxes[0], 'קבוצה')
    await user.type(textboxes[1], 'Alice')
    await user.click(screen.getByText('צור'))

    expect(getGroups()[0].members[0].availability).toBe('base')
  })
})

// ─── GroupEditScreen ──────────────────────────────────────────────────────────

describe('GroupEditScreen — member availability toggle', () => {
  it('toggles a member from base to home and autosaves', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({ id: 'g1' }))
    renderApp('/group/g1/edit')

    // Alice is currently "בסיס"
    const aliceBasePill = screen.getAllByText('בסיס')[0]
    await user.click(aliceBasePill)

    await waitFor(() => {
      const member = getGroupById('g1')?.members.find(m => m.name === 'Alice')
      expect(member?.availability).toBe('home')
    })
  })

  it('toggles a member from home to base and autosaves', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({
      id: 'g1',
      members: [{ id: 'm1', name: 'Alice', availability: 'home' }],
    }))
    renderApp('/group/g1/edit')

    await user.click(screen.getByText('בית'))

    await waitFor(() => {
      const member = getGroupById('g1')?.members.find(m => m.name === 'Alice')
      expect(member?.availability).toBe('base')
    })
  })
})

describe('GroupEditScreen — rename member', () => {
  it('renames a member inline and autosaves', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({ id: 'g1' }))
    renderApp('/group/g1/edit')

    // Click the name button to enter edit mode
    await user.click(screen.getByText('Alice'))

    // Input should appear pre-filled with the current name
    const input = await screen.findByDisplayValue('Alice')
    await user.clear(input)
    await user.type(input, 'Alicia')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      const member = getGroupById('g1')?.members.find(m => m.id === 'm1')
      expect(member?.name).toBe('Alicia')
    })
  })
})

describe('GroupEditScreen — add member', () => {
  it('adds a new member with base availability and autosaves', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({ id: 'g1' }))
    renderApp('/group/g1/edit')

    await user.type(screen.getByPlaceholderText('הוסף חבר…'), 'Charlie')
    await user.click(screen.getByText('הוסף'))

    await waitFor(() => {
      const group = getGroupById('g1')
      expect(group?.members).toHaveLength(3)
      const charlie = group?.members.find(m => m.name === 'Charlie')
      expect(charlie?.availability).toBe('base')
    })
  })

  it('silently ignores duplicate member names (case-insensitive)', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({ id: 'g1' }))
    renderApp('/group/g1/edit')

    await user.type(screen.getByPlaceholderText('הוסף חבר…'), 'alice')
    await user.click(screen.getByText('הוסף'))

    await waitFor(() => {
      expect(getGroupById('g1')?.members).toHaveLength(2)
    })
  })
})

describe('GroupEditScreen — delete member', () => {
  it('removes member after confirmation and autosaves', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({ id: 'g1' }))
    renderApp('/group/g1/edit')

    // Click the ✕ button next to Alice (first member row)
    const deleteButtons = screen.getAllByLabelText('הסר חבר')
    await user.click(deleteButtons[0])

    // Confirm dialog appears — click מחיקה
    await user.click(await screen.findByText('מחיקה'))

    await waitFor(() => {
      expect(getGroupById('g1')?.members).toHaveLength(1)
      expect(getGroupById('g1')?.members[0].name).toBe('Bob')
    })
  })
})

// ─── Group deletion from HomeScreen ──────────────────────────────────────────

describe('HomeScreen — delete group', () => {
  it('removes group after confirmation and updates the list', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({ id: 'g1' }))
    renderApp()

    // Find the מחיקה button for the group card
    const groupCard = screen.getByText('מחלקה א').closest('li')!
    const deleteBtn = within(groupCard).getByText('מחיקה')
    await user.click(deleteBtn)

    // Confirm dialog — click מחיקה within the dialog overlay
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByText('מחיקה'))

    await waitFor(() => {
      expect(getGroups()).toHaveLength(0)
    })

    // After deleting the last group, the welcome state should appear
    expect(screen.getByText('ברוך הבא! כדי להתחיל, צור קבוצת לוחמים שמורה')).toBeTruthy()
  })
})

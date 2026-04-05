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
  it('creates an empty group and navigates to edit screen', async () => {
    const user = userEvent.setup()
    renderApp()

    // Welcome state — click the CTA to open creation modal
    await user.click(screen.getByText('צור קבוצה'))

    // Fill group name
    await user.type(screen.getByPlaceholderText("למשל: מחלקה א'"), 'פלוגה א')

    await user.click(screen.getByText('צור'))

    const groups = getGroups()
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('פלוגה א')
    expect(groups[0].members).toHaveLength(0)
  })

  it('shows error when group name is empty', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByText('צור קבוצה'))
    await user.click(screen.getByText('צור'))

    expect(screen.getByText('שם הקבוצה נדרש')).toBeTruthy()
    expect(getGroups()).toHaveLength(0)
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

describe('GroupEditScreen — bulk add members', () => {
  it('opens bulk add textarea when toggle button is clicked', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({ id: 'g1' }))
    renderApp('/group/g1/edit')

    // Initially: group name input + add member input = 2 textboxes (no bulk textarea yet)
    const textboxesInitial = screen.getAllByRole('textbox')
    expect(textboxesInitial).toHaveLength(2)

    const bulkButton = screen.getByText('הוסף מספר חברים בבת אחת')
    await user.click(bulkButton)

    // After clicking, should have 3 textboxes (group name + add input + bulk textarea)
    const textboxesAfter = screen.getAllByRole('textbox')
    expect(textboxesAfter).toHaveLength(3)
  })

  it('adds multiple comma-separated names and autosaves', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({ id: 'g1' }))
    renderApp('/group/g1/edit')

    await user.click(screen.getByText('הוסף מספר חברים בבת אחת'))
    const textareas = screen.getAllByRole('textbox')
    const bulkTextarea = textareas[textareas.length - 1]
    await user.type(bulkTextarea, 'Charlie, David, Eve')

    const buttons = screen.getAllByText('הוסף')
    const bulkAddButton = buttons[buttons.length - 1]
    await user.click(bulkAddButton)

    await waitFor(() => {
      const group = getGroupById('g1')
      expect(group?.members).toHaveLength(5)
      expect(group?.members.map(m => m.name)).toContain('Charlie')
      expect(group?.members.map(m => m.name)).toContain('David')
      expect(group?.members.map(m => m.name)).toContain('Eve')
    })
  })

  it('adds multiple newline-separated names and autosaves', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({ id: 'g1' }))
    renderApp('/group/g1/edit')

    await user.click(screen.getByText('הוסף מספר חברים בבת אחת'))
    const textareas = screen.getAllByRole('textbox')
    const bulkTextarea = textareas[textareas.length - 1]
    await user.type(bulkTextarea, 'Frank\nGrace\nHenry')

    const buttons = screen.getAllByText('הוסף')
    await user.click(buttons[buttons.length - 1])

    await waitFor(() => {
      const group = getGroupById('g1')
      expect(group?.members).toHaveLength(5)
      expect(group?.members.map(m => m.name)).toEqual(['Alice', 'Bob', 'Frank', 'Grace', 'Henry'])
    })
  })

  it('filters out duplicates when bulk adding', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({ id: 'g1' }))
    renderApp('/group/g1/edit')

    await user.click(screen.getByText('הוסף מספר חברים בבת אחת'))
    const textareas = screen.getAllByRole('textbox')
    const bulkTextarea = textareas[textareas.length - 1]
    await user.type(bulkTextarea, 'Charlie\nCharlie\ncharlie\nDavid')

    const buttons = screen.getAllByText('הוסף')
    await user.click(buttons[buttons.length - 1])

    await waitFor(() => {
      const group = getGroupById('g1')
      expect(group?.members).toHaveLength(4)
    })
  })

  it('does not add names that already exist in the group (case-insensitive)', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({ id: 'g1' }))
    renderApp('/group/g1/edit')

    await user.click(screen.getByText('הוסף מספר חברים בבת אחת'))
    const textareas = screen.getAllByRole('textbox')
    const bulkTextarea = textareas[textareas.length - 1]
    await user.type(bulkTextarea, 'alice, bob, charlie')

    const buttons = screen.getAllByText('הוסף')
    await user.click(buttons[buttons.length - 1])

    await waitFor(() => {
      const group = getGroupById('g1')
      expect(group?.members).toHaveLength(3)
      expect(group?.members.map(m => m.name)).toEqual(['Alice', 'Bob', 'charlie'])
    })
  })

  it('closes bulk textarea after adding and clears input', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({ id: 'g1' }))
    renderApp('/group/g1/edit')

    await user.click(screen.getByText('הוסף מספר חברים בבת אחת'))
    const textboxes = screen.getAllByRole('textbox')
    const bulkTextarea = textboxes[textboxes.length - 1] // Last textbox is the bulk textarea
    await user.type(bulkTextarea, 'Charlie')

    const buttons = screen.getAllByText('הוסף')
    await user.click(buttons[buttons.length - 1]) // Last button is the bulk add button

    await waitFor(() => {
      // After adding, the member should be saved
      const group = getGroupById('g1')
      expect(group?.members).toHaveLength(3)
      expect(group?.members.map(m => m.name)).toContain('Charlie')
      // After adding and closing, should be back to 2 textboxes (group name + add input)
      expect(screen.getAllByRole('textbox')).toHaveLength(2)
    })
  })

  it('all bulk-added members are initialized with base availability and warrior role', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({ id: 'g1', members: [] }))
    renderApp('/group/g1/edit')

    await user.click(screen.getByText('הוסף מספר חברים בבת אחת'))
    const textareas = screen.getAllByRole('textbox')
    const bulkTextarea = textareas[textareas.length - 1]
    await user.type(bulkTextarea, 'Charlie, David')

    const buttons = screen.getAllByText('הוסף')
    await user.click(buttons[buttons.length - 1])

    await waitFor(() => {
      const group = getGroupById('g1')
      const charlie = group?.members.find(m => m.name === 'Charlie')
      const david = group?.members.find(m => m.name === 'David')
      expect(charlie?.availability).toBe('base')
      expect(charlie?.role).toBe('warrior')
      expect(david?.availability).toBe('base')
      expect(david?.role).toBe('warrior')
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

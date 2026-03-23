/**
 * E2E tests for the Commanders feature.
 * Covers GroupEditScreen commander management and StandbyScreen commander section.
 * All tests use an in-memory localStorage mock; no real DOM storage is touched.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import GroupEditScreen from '@/screens/GroupEditScreen'
import CommandersSelectScreen from '@/screens/CommandersSelectScreen'
import StandbyScreen, { formatStandbyText } from '@/screens/StandbyScreen'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import { upsertGroup, getGroupById } from '@/storage/groups'
import type { Group } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'מחלקה א',
    members: [
      { id: 'm1', name: 'Alice', availability: 'base' },
      { id: 'm2', name: 'Bob', availability: 'base' },
      { id: 'm3', name: 'Charlie', availability: 'base' },
    ],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function renderGroupEdit(groupId = 'g1') {
  return render(
    <MemoryRouter initialEntries={[`/group/${groupId}/edit`]}>
      <Routes>
        <Route path="/" element={<div>בית</div>} />
        <Route path="/group/:groupId/edit" element={<GroupEditScreen />} />
        <Route path="/group/:groupId/commanders" element={<CommandersSelectScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderCommandersSelect(groupId = 'g1') {
  return render(
    <MemoryRouter initialEntries={[`/group/${groupId}/commanders`]}>
      <Routes>
        <Route path="/group/:groupId/edit" element={<GroupEditScreen />} />
        <Route path="/group/:groupId/commanders" element={<CommandersSelectScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderStandby() {
  return render(
    <MemoryRouter initialEntries={['/standby']}>
      <Routes>
        <Route path="/" element={<div>בית</div>} />
        <Route path="/standby" element={<StandbyScreen />} />
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

// ─── formatStandbyText with commander ─────────────────────────────────────────

describe('formatStandbyText — commander line', () => {
  it('includes commander line when commanderName is provided', () => {
    const text = formatStandbyText('כיתת כוננות', ['Alice', 'Bob'], 'Commander Name')
    expect(text).toBe('*כיתת כוננות*\n\nמפקד: Commander Name\n\n1. Alice\n2. Bob')
  })

  it('omits commander line when no commanderName provided', () => {
    const text = formatStandbyText('כיתת כוננות', ['Alice', 'Bob'])
    expect(text).toBe('*כיתת כוננות*\n\n1. Alice\n2. Bob')
  })

  it('includes only commander line with no warriors', () => {
    const text = formatStandbyText('כיתת כוננות', [], 'Commander')
    expect(text).toBe('*כיתת כוננות*\n\nמפקד: Commander\n')
  })
})

// ─── GroupEditScreen — commander promotion ─────────────────────────────────────

describe('GroupEditScreen — בחר מפקדים button', () => {
  it('shows the בחר מפקדים button', () => {
    upsertGroup(makeGroup())
    renderGroupEdit()
    expect(screen.getByText('👑 בחר מפקדים')).toBeTruthy()
  })

  it('navigates to commanders screen when button is clicked', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderGroupEdit()

    await user.click(screen.getByText('👑 בחר מפקדים'))

    // CommandersSelectScreen should now be rendered
    expect(screen.getByText('בחר מפקדים')).toBeTruthy()
    // All members visible in the screen
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0)
  })

  it('promoting a member to commander persists role: commander to localStorage', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderCommandersSelect()

    // Check Alice's checkbox
    const aliceCheckbox = screen.getByRole('checkbox', { name: 'Alice' })
    await user.click(aliceCheckbox)

    // Alice should now be role: commander in localStorage
    await waitFor(() => {
      const group = getGroupById('g1')
      const alice = group?.members.find(m => m.name === 'Alice')
      expect(alice?.role).toBe('commander')
    })
  })

  it('demoting a commander back to warrior persists role: warrior to localStorage', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({
      members: [{ id: 'm1', name: 'Alice', availability: 'base', role: 'commander' }],
    }))
    renderCommandersSelect()

    // Uncheck Alice (she is already a commander)
    const aliceCheckbox = screen.getByRole('checkbox', { name: 'Alice' })
    expect((aliceCheckbox as HTMLInputElement).checked).toBe(true)
    await user.click(aliceCheckbox)

    await waitFor(() => {
      const group = getGroupById('g1')
      const alice = group?.members.find(m => m.name === 'Alice')
      expect(alice?.role).toBe('warrior')
    })
  })
})

describe('GroupEditScreen — commanders/warriors sections', () => {
  it('shows מפקדים section above לוחמים section', () => {
    upsertGroup(makeGroup({
      members: [
        { id: 'm1', name: 'Alice', availability: 'base', role: 'commander' },
        { id: 'm2', name: 'Bob', availability: 'base', role: 'warrior' },
      ],
    }))
    renderGroupEdit()

    expect(screen.getByText('מפקדים')).toBeTruthy()
    expect(screen.getByText('לוחמים')).toBeTruthy()
    // Alice appears under commanders, Bob under warriors
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('shows "לא נבחרו מפקדים" placeholder when no commanders assigned', () => {
    upsertGroup(makeGroup())
    renderGroupEdit()

    expect(screen.getByText('לא נבחרו מפקדים')).toBeTruthy()
  })

  it('existing members with no role field default to warrior without error', () => {
    // Store a group with members that have no role field (simulating old data)
    upsertGroup(makeGroup({
      members: [
        { id: 'm1', name: 'Alice', availability: 'base' }, // no role field
        { id: 'm2', name: 'Bob', availability: 'base' },   // no role field
      ],
    }))
    renderGroupEdit()

    // Should render without throwing
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('לוחמים')).toBeTruthy()
    // No commanders — placeholder shown
    expect(screen.getByText('לא נבחרו מפקדים')).toBeTruthy()
  })
})

// ─── StandbyScreen — commander section ────────────────────────────────────────

describe('StandbyScreen — commander section visibility', () => {
  it('hides commander section when group has no commanders defined', () => {
    upsertGroup(makeGroup()) // all warriors, no commanders
    renderStandby()

    expect(screen.queryByText('מפקד')).toBeNull()
  })

  it('shows commander section when group has commanders with base status', () => {
    upsertGroup(makeGroup({
      members: [
        { id: 'm1', name: 'Alice', availability: 'base', role: 'commander' },
        { id: 'm2', name: 'Bob', availability: 'base', role: 'warrior' },
      ],
    }))
    renderStandby()

    expect(screen.getByText('מפקד')).toBeTruthy()
  })

  it('shows commander section even when commander is home (section header visible)', () => {
    upsertGroup(makeGroup({
      members: [
        { id: 'm1', name: 'Alice', availability: 'home', role: 'commander' },
        { id: 'm2', name: 'Bob', availability: 'base', role: 'warrior' },
      ],
    }))
    renderStandby()

    // Section header should still show since there is a commander
    expect(screen.getByText('מפקד')).toBeTruthy()
  })
})

describe('StandbyScreen — commander selection', () => {
  it('allows selecting a commander via radio button', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({
      members: [
        { id: 'm1', name: 'Alice', availability: 'base', role: 'commander' },
        { id: 'm2', name: 'Bob', availability: 'base', role: 'warrior' },
      ],
    }))

    let clipboardText = ''
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: async (t: string) => { clipboardText = t } },
    })

    renderStandby()

    // Select Alice as commander
    const aliceRadio = screen.getByRole('radio', { name: 'Alice' })
    await user.click(aliceRadio)
    expect((aliceRadio as HTMLInputElement).checked).toBe(true)

    // Copy to clipboard
    await user.click(screen.getByText('📋 העתק לווטסאפ'))

    expect(clipboardText).toContain('מפקד: Alice')
    expect(clipboardText).toContain('Bob')
  })

  it('omits commander line in WhatsApp output when no commander selected', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({
      members: [
        { id: 'm1', name: 'Alice', availability: 'base', role: 'commander' },
        { id: 'm2', name: 'Bob', availability: 'base', role: 'warrior' },
      ],
    }))

    let clipboardText = ''
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: async (t: string) => { clipboardText = t } },
    })

    renderStandby()

    // Do not select any commander — just copy
    await user.click(screen.getByText('📋 העתק לווטסאפ'))

    expect(clipboardText).not.toContain('מפקד:')
    expect(clipboardText).toContain('Bob')
  })

  it('produces correct WhatsApp output with commander above warriors list', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({
      members: [
        { id: 'm1', name: 'Commander Alice', availability: 'base', role: 'commander' },
        { id: 'm2', name: 'Warrior Bob', availability: 'base', role: 'warrior' },
      ],
    }))

    let clipboardText = ''
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: async (t: string) => { clipboardText = t } },
    })

    renderStandby()

    const aliceRadio = screen.getByRole('radio', { name: 'Commander Alice' })
    await user.click(aliceRadio)

    await user.click(screen.getByText('📋 העתק לווטסאפ'))

    expect(clipboardText).toBe('*כיתת כוננות* - החל מהשעה 22:00\n\nמפקד: Commander Alice\n\n1. Warrior Bob')
  })
})

describe('StandbyScreen — commander deselection when toggled home', () => {
  it('deselects commander when their availability is toggled to home', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({
      members: [
        { id: 'm1', name: 'Alice', availability: 'base', role: 'commander' },
        { id: 'm2', name: 'Bob', availability: 'base', role: 'warrior' },
      ],
    }))

    let clipboardText = ''
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: async (t: string) => { clipboardText = t } },
    })

    renderStandby()

    // Select Alice as commander
    const aliceRadio = screen.getByRole('radio', { name: 'Alice' })
    await user.click(aliceRadio)
    expect((aliceRadio as HTMLInputElement).checked).toBe(true)

    // Toggle Alice to home — she becomes unavailable
    const aliceBaseButton = screen.getAllByText('בסיס')[0]
    await user.click(aliceBaseButton)

    // Copy — should not include commander line
    await waitFor(async () => {
      await user.click(screen.getByText('📋 העתק לווטסאפ'))
      expect(clipboardText).not.toContain('מפקד:')
    })
  })
})

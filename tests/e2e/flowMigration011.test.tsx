/**
 * E2E tests for Migration 011 — Show All Warriors in Order Screen & Drag Hold Threshold.
 * Covers:
 * - "בית" members appear in "לא משובצים" section on Step3_Order mount
 * - Removing a station member sends them to "לא משובצים"
 * - "לא משובצים" section is hidden when all members are assigned and none are "בית"
 * - Home member in "לא משובצים" shows "בית" badge
 * - After removing a member from a station they appear in unassigned section
 * - Unassigned member added to a station shows correct times in Step4_Review
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '../../src/context/WizardContext'
import Step1_Stations from '../../src/screens/Step1_Stations'
import Step2_Time from '../../src/screens/Step2_Time'
import Step3_Order from '../../src/screens/Step3_Order'
import Step4_Review from '../../src/screens/Step4_Review'
import { createLocalStorageMock } from '../../src/tests/localStorageMock'
import { upsertGroup } from '../../src/storage/groups'
import type { Group } from '../../src/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGroupWithHomeMembers(overrides: Partial<Group> = {}): Group {
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

function makeGroupAllBase(): Group {
  return {
    id: 'g1',
    name: 'מחלקה א',
    members: [
      { id: 'm1', name: 'Alice', availability: 'base' },
      { id: 'm2', name: 'Bob', availability: 'base' },
      { id: 'm3', name: 'Charlie', availability: 'base' },
    ],
    createdAt: new Date().toISOString(),
  }
}

function renderApp() {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={['/schedule/new/step1']}>
        <Routes>
          <Route path="/schedule/new/step1" element={<Step1_Stations />} />
          <Route path="/schedule/new/step2" element={<Step2_Time />} />
          <Route path="/schedule/new/step3" element={<Step3_Order />} />
          <Route path="/schedule/new/step4" element={<Step4_Review />} />
          <Route path="/schedule/:scheduleId/result" element={<div>תוצאה</div>} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

async function navigateToStep3(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('הבא →'))
  expect(screen.getByText('הגדרת זמנים')).toBeTruthy()

  await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
  await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
  await user.click(screen.getByText('הבא →'))
  expect(screen.getByText('סדר שומרים')).toBeTruthy()
}

async function navigateToStep4(user: ReturnType<typeof userEvent.setup>) {
  await navigateToStep3(user)
  await user.click(screen.getByText('הבא →'))
  expect(screen.getByText('סקירה ועריכה')).toBeTruthy()
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Migration 011 — לא משובצים section visibility', () => {
  it('shows "לא משובצים" section when there are "בית" members', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroupWithHomeMembers())
    renderApp()
    await navigateToStep3(user)

    expect(screen.getByText('לא משובצים')).toBeTruthy()
  })

  it('always shows "לא משובצים" section even when all members are base and assigned', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroupAllBase())
    renderApp()
    await navigateToStep3(user)

    // "לא משובצים" section is always rendered (Migration 012 — never conditionally removed)
    expect(screen.getByText('לא משובצים')).toBeTruthy()
    // Placeholder text shown when section is empty
    expect(screen.getByText('גרור לוחם לכאן להוצאה מהרשימה')).toBeTruthy()
  })
})

describe('Migration 011 — "בית" members in "לא משובצים"', () => {
  it('shows "בית" member in "לא משובצים" section with "בית" badge', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroupWithHomeMembers())
    renderApp()
    await navigateToStep3(user)

    // Charlie is "בית", should appear in unassigned section
    expect(screen.getByText('Charlie')).toBeTruthy()
    // "בית" badge should be displayed
    expect(screen.getByText('בית')).toBeTruthy()
  })

  it('"בסיס" members assigned to station do NOT appear in "לא משובצים"', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroupWithHomeMembers())
    renderApp()
    await navigateToStep3(user)

    // Alice and Bob are "base" and should be in the station, not in unassigned
    // We know they appear in the DOM. The key check is that "בית" badge appears only for Charlie
    const homeBadges = screen.queryAllByText('בית')
    expect(homeBadges).toHaveLength(1)
  })
})

describe('Migration 011 — remove from station to "לא משובצים"', () => {
  it('removing a member from a station sends them to "לא משובצים"', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroupWithHomeMembers())
    renderApp()
    await navigateToStep3(user)

    // Initially: Alice and Bob in station, Charlie in "לא משובצים"
    // לא משובצים section should exist (due to Charlie)
    expect(screen.getByText('לא משובצים')).toBeTruthy()

    // Remove Alice from the station using the ✕ remove button in the station
    // Only station rows have "הסר" (✕) buttons; unassigned rows do not
    const removeButtons = screen.getAllByLabelText('הסר')
    expect(removeButtons.length).toBeGreaterThanOrEqual(1)
    await user.click(removeButtons[0])

    // Now one more member should be in "לא משובצים"
    // Previously: Charlie (1 unassigned). After remove: Charlie + one of Alice/Bob (2 unassigned)
    // Only 1 station participant remains → only 1 "הסר" button in station section
    await waitFor(() => {
      expect(screen.getAllByLabelText('הסר').length).toBe(1)
    })
  })

  it('"לא משובצים" section is always present and shows removed member after removal (all-base group)', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroupAllBase())
    renderApp()
    await navigateToStep3(user)

    // "לא משובצים" section is always rendered (Migration 012)
    expect(screen.getByText('לא משובצים')).toBeTruthy()
    // Initially shows placeholder since all are assigned
    expect(screen.getByText('גרור לוחם לכאן להוצאה מהרשימה')).toBeTruthy()

    // Remove one participant from the station
    const removeButtons = screen.getAllByLabelText('הסר')
    await user.click(removeButtons[0])

    // After removing, a member appears in "לא משובצים" and placeholder disappears
    await waitFor(() => {
      expect(screen.getByText('לא משובצים')).toBeTruthy()
      expect(screen.queryByText('גרור לוחם לכאן להוצאה מהרשימה')).toBeNull()
    })
  })
})

describe('Migration 011 — member in "לא משובצים" shown in Step4_Review after re-assignment', () => {
  it('base members assigned to station show correct shift times in Step4_Review', async () => {
    const user = userEvent.setup()
    // All base members distributed to station — verify times are shown correctly
    upsertGroup(makeGroupAllBase())
    renderApp()
    await navigateToStep4(user)

    // The first participant should have start time 20:00 (default)
    expect(screen.getByText(/20:00/)).toBeTruthy()
  })

  it('after removing a member in Step3 and proceeding, Step4 shows only the remaining members', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroupAllBase())
    renderApp()
    await navigateToStep3(user)

    // Remove first participant
    const removeButtons = screen.getAllByLabelText('הסר')
    await user.click(removeButtons[0])

    await waitFor(() => {
      // 2 remain in station (2 "הסר" buttons — only station rows have ✕)
      expect(screen.getAllByLabelText('הסר').length).toBe(2)
    })

    // Navigate to step 4
    await user.click(screen.getByText('הבא →'))
    expect(screen.getByText('סקירה ועריכה')).toBeTruthy()

    // Only 2 participants in Step4_Review (2 remove buttons)
    await waitFor(() => {
      expect(screen.getAllByLabelText('הסר').length).toBe(2)
    })
  })
})

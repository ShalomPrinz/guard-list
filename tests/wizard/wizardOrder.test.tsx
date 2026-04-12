/**
 * E2E tests for Step3_Order — participant distribution, lock/skip/remove.
 * Navigates through Step1 and Step2 first to establish session state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '@/context/WizardContext'
import Step1_Stations from '@/screens/Step1_Stations'
import Step2_Time from '@/screens/Step2_Time'
import Step3_Order from '@/screens/Step3_Order'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import { upsertGroup } from '@/storage/groups'
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

function renderApp() {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={['/schedule/new/step1']}>
        <Routes>
          <Route path="/schedule/new/step1" element={<Step1_Stations />} />
          <Route path="/schedule/new/step2" element={<Step2_Time />} />
          <Route path="/schedule/new/step3" element={<Step3_Order />} />
          <Route path="/schedule/new/step4" element={<div>שלב 4</div>} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

async function navigateToStep3(user: ReturnType<typeof userEvent.setup>) {
  // Step 1 → Step 2
  await user.click(screen.getByText('הבא →'))
  expect(screen.getByText('הגדרת זמנים')).toBeTruthy()

  // Step 2 → Step 3: select fixed-duration mode, enter duration
  await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
  await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
  await user.click(screen.getByText('הבא →'))
  expect(screen.getByText('סדר שומרים')).toBeTruthy()
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Step3_Order — participant distribution', () => {
  it('distributes all base members to the time-based station', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Charlie')).toBeTruthy()
  })

  it('shows step 3 of 4 indicator', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    expect(screen.getByText('שלב 3 מתוך 4')).toBeTruthy()
  })
})



describe('Step3_Order — availability toggle', () => {
  it('toggling Base → Home in station moves participant to לא משובצים', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    // 3 station participants shown by 3 "הסר" buttons
    expect(screen.getAllByLabelText('הסר').length).toBe(3)

    // Click first "בסיס" toggle to move participant to unassigned
    const baseButtons = screen.getAllByText('בסיס')
    await user.click(baseButtons[0])

    await waitFor(() => {
      // Now 2 station participants remain
      expect(screen.getAllByLabelText('הסר').length).toBe(2)
    })
  })

  it('toggling Home → Base in לא משובצים keeps participant in לא משובצים', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({
      members: [
        { id: 'm1', name: 'Alice', availability: 'base' },
        { id: 'm2', name: 'Bob', availability: 'home' },
      ],
    }))
    renderApp()
    await navigateToStep3(user)

    // Bob is in unassigned with 'בית' toggle
    expect(screen.getByText('בית')).toBeTruthy()
    await user.click(screen.getByText('בית'))

    // Bob stays in unassigned (no new הסר button added)
    await waitFor(() => {
      // Still only 1 station participant (Alice)
      expect(screen.getAllByLabelText('הסר').length).toBe(1)
      // Bob now shows 'בסיס' in unassigned
      expect(screen.getAllByText('בסיס').length).toBeGreaterThanOrEqual(1)
    })
  })
})

describe('Step3_Order — remove participant', () => {
  it('removes a participant from the station', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    // 3 station participants (3 "הסר" buttons — only station rows have ✕)
    expect(screen.getAllByLabelText('הסר').length).toBe(3)

    const removeButtons = screen.getAllByLabelText('הסר')
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect(screen.getAllByLabelText('הסר').length).toBe(2)
    })
  })
})

describe('Step3_Order — shuffle', () => {
  it('shuffle button does not remove participants', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    await user.click(screen.getByText('ערבב'))

    // All 3 participants should still be in station (3 "הסר" buttons)
    expect(screen.getAllByLabelText('הסר').length).toBe(3)
  })
})

describe('Step3_Order — navigation', () => {
  it('Next button navigates to step4', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    await user.click(screen.getByText('הבא →'))
    expect(screen.getByText('שלב 4')).toBeTruthy()
  })

  it('back button returns to step2', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    await user.click(screen.getByText('← חזרה'))
    expect(screen.getByText('הגדרת זמנים')).toBeTruthy()
  })
})

// ─── End-time mode navigation helper ─────────────────────────────────────────

async function navigateToStep3WithEndTime(
  user: ReturnType<typeof userEvent.setup>,
  endHour: string,
  roundingMode: 'nearest-minute' | 'round-up-10' | 'round-up-5' = 'nearest-minute',
) {
  // Step 1 → Step 2
  await user.click(screen.getByText('הבא →'))
  expect(screen.getByText('הגדרת זמנים')).toBeTruthy()

  // Stay in end-time mode (default); set end time via the second "שעות" spinner
  const hourInputs = screen.getAllByRole('textbox', { name: 'שעות' })
  const endHourInput = hourInputs[1] // index 1 = end time picker
  await user.click(endHourInput)
  await user.clear(endHourInput)
  await user.type(endHourInput, endHour)
  await user.tab()

  // Select rounding mode if needed
  if (roundingMode !== 'round-up-10') {
    const roundingValues = {
      'nearest-minute': 'round-nearest',
      'round-up-5': 'round-up-5',
    } as const
    const selectValue = roundingValues[roundingMode as 'nearest-minute' | 'round-up-5']
    await userEvent.selectOptions(screen.getByRole('combobox'), selectValue)
  }

  await user.click(screen.getByText('הבא →'))
  expect(screen.getByText('סדר שומרים')).toBeTruthy()
}

// ─── Duration label tests ─────────────────────────────────────────────────────

describe('Step3_Order — per-warrior duration label', () => {
  it('shows duration label with correct minutes in fixed-duration mode', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user) // fixed-duration 60 min, 3 participants

    expect(screen.getByText(/זמן שמירה לכל לוחם: 60 דקות/)).toBeTruthy()
  })

  it('label updates reactively when participant is removed in end-time mode', async () => {
    // 2 participants, start=20:00, end=22:00 → 120 min / 2 = 60 min each
    // Remove one → 1 participant → 120 min
    const user = userEvent.setup()
    upsertGroup(makeGroup({
      members: [
        { id: 'm1', name: 'Alice', availability: 'base' },
        { id: 'm2', name: 'Bob', availability: 'base' },
      ],
    }))
    renderApp()
    await navigateToStep3WithEndTime(user, '22')

    expect(screen.getByText(/זמן שמירה לכל לוחם: 60 דקות/)).toBeTruthy()

    // Remove one participant → station count drops to 1
    const removeButtons = screen.getAllByLabelText('הסר')
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect(screen.getByText(/זמן שמירה לכל לוחם: 120 דקות/)).toBeTruthy()
    })
  })

  it('shows correct duration label in end-time mode with a single participant', async () => {
    // 1 participant, 20:00→22:00 (120 min window) → 120 min per warrior
    const user = userEvent.setup()
    upsertGroup(makeGroup({
      members: [{ id: 'm1', name: 'Alice', availability: 'base' }],
    }))
    renderApp()
    await navigateToStep3WithEndTime(user, '22')

    expect(screen.getByText(/זמן שמירה לכל לוחם: 120 דקות/)).toBeTruthy()
  })
})

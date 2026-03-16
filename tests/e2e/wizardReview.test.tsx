/**
 * E2E tests for Step4_Review — schedule preview, editing, and creation.
 * Navigates through Steps 1–3 first to establish wizard session state.
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
import ResultScreen from '../../src/screens/ResultScreen'
import { createLocalStorageMock } from '../../src/tests/localStorageMock'
import { upsertGroup } from '../../src/storage/groups'
import { getSchedules } from '../../src/storage/schedules'
import type { Group } from '../../src/types'

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
          <Route path="/schedule/new/step4" element={<Step4_Review />} />
          <Route path="/schedule/:scheduleId/result" element={<ResultScreen />} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

async function navigateToStep4(user: ReturnType<typeof userEvent.setup>) {
  // Step 1 → 2
  await user.click(screen.getByText('הבא →'))
  // Step 2 → 3
  await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
  await user.click(screen.getByText('הבא →'))
  // Step 3 → 4
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

describe('Step4_Review — schedule preview', () => {
  it('shows computed start time for first participant (20:00)', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    // First participant starts at 20:00 (default start time)
    expect(screen.getByText(/20:00/)).toBeTruthy()
  })

  it('shows all participant names in the review', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Charlie')).toBeTruthy()
  })

  it('shows step 4 of 4 indicator', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    expect(screen.getByText('שלב 4 מתוך 4')).toBeTruthy()
  })
})

describe('Step4_Review — add participant', () => {
  it('adds a new participant to the station', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    const addInput = screen.getByPlaceholderText('הוסף משתתף...')
    await user.type(addInput, 'Dana')
    await user.click(screen.getByText('+'))

    await waitFor(() => {
      expect(screen.getByText('Dana')).toBeTruthy()
    })
  })
})

describe('Step4_Review — remove participant', () => {
  it('removes a participant from the station', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    // Initially 3 participants. Remove buttons have aria-label "הסר"
    const removeButtons = screen.getAllByLabelText('הסר')
    expect(removeButtons.length).toBe(3)
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect(screen.getAllByLabelText('הסר').length).toBe(2)
    })
  })
})

describe('Step4_Review — schedule creation', () => {
  it('creates a schedule and saves it to localStorage', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    await user.click(screen.getByText('צור לוח שמירה ✓'))

    await waitFor(() => {
      const schedules = getSchedules()
      expect(schedules).toHaveLength(1)
    })
  })

  it('navigates to result screen after creating schedule', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    await user.click(screen.getByText('צור לוח שמירה ✓'))

    await waitFor(() => {
      // Result screen shows the lock emoji and schedule name
      expect(screen.getByText(/🔒/)).toBeTruthy()
    })
  })

  it('shows error when station has no participants', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    // Remove all participants
    const removeButtons = screen.getAllByLabelText('הסר')
    for (const btn of removeButtons) {
      await user.click(btn)
    }

    await user.click(screen.getByText('צור לוח שמירה ✓'))

    expect(screen.getByText('יש להוסיף לפחות משתתף אחד')).toBeTruthy()
  })
})

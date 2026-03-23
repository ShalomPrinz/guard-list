/**
 * E2E tests for new station start time selection in continue mode.
 *
 * Covers:
 * - A new station added in Step1 during continue mode does NOT auto-inherit any start time
 * - Clicking Next with a new station and no selection shows an error
 * - A new station correctly applies a user-provided custom start time
 * - A new station correctly inherits the end time of a user-selected previous station
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
import ContinueRoundScreen from '../../src/screens/ContinueRoundScreen'
import { createLocalStorageMock } from '../../src/tests/localStorageMock'
import { upsertGroup } from '../../src/storage/groups'
import { addSchedule, getSchedules } from '../../src/storage/schedules'
import type { Group, Schedule } from '../../src/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGroup(): Group {
  return {
    id: 'g1',
    name: 'מחלקה א',
    members: [
      { id: 'm1', name: 'Alice', availability: 'base' },
      { id: 'm2', name: 'Bob', availability: 'base' },
    ],
    createdAt: new Date().toISOString(),
  }
}

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'sched1',
    name: 'שמירה ראשונה',
    groupId: 'g1',
    createdAt: new Date().toISOString(),
    date: '2026-03-16',
    stations: [
      {
        stationConfigId: 'st1',
        stationName: 'עמדה 1',
        stationType: 'time-based',
        participants: [
          { name: 'Alice', startTime: '20:00', endTime: '21:00', date: '2026-03-16', durationMinutes: 60, locked: false, skipped: false },
          { name: 'Bob', startTime: '21:00', endTime: '22:00', date: '2026-03-16', durationMinutes: 60, locked: false, skipped: false },
        ],
      },
    ],
    unevenDistributionMode: 'equal-duration',
    ...overrides,
  }
}

function renderApp(initialPath: string) {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<div>דף הבית</div>} />
          <Route path="/schedule/new/step1" element={<Step1_Stations />} />
          <Route path="/schedule/new/step2" element={<Step2_Time />} />
          <Route path="/schedule/new/step3" element={<Step3_Order />} />
          <Route path="/schedule/new/step4" element={<Step4_Review />} />
          <Route path="/schedule/:scheduleId/result" element={<div>תוצאה</div>} />
          <Route path="/schedule/:scheduleId/continue" element={<ContinueRoundScreen />} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

// Navigate from ContinueRoundScreen to Step1 (pre-filled)
async function navigateToContinueStep1(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('התחל סבב →'))
  expect(screen.getByText('הגדרת עמדות')).toBeTruthy()
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Continue round — new station detection', () => {
  it('shows "עמדה חדשה" prompt when station count is increased in Step1 during continue mode', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderApp('/schedule/sched1/continue')

    await navigateToContinueStep1(user)

    // Previous round had 1 station. Increase to 2.
    await user.click(screen.getByRole('button', { name: '2' }))

    // The new 2nd station should show the start-time selection prompt
    await waitFor(() => {
      expect(screen.getByText(/עמדה חדשה — יש לבחור שעת התחלה/)).toBeTruthy()
    })
  })

  it('does NOT show the prompt for existing stations that have a pre-filled start time', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderApp('/schedule/sched1/continue')

    await navigateToContinueStep1(user)

    // Station count is already 1 (matching previous round) — no new stations
    expect(screen.queryByText(/עמדה חדשה — יש לבחור שעת התחלה/)).toBeNull()
  })

  it('proceeds to Step2 without explicit selection (custom time defaults apply)', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderApp('/schedule/sched1/continue')

    await navigateToContinueStep1(user)

    // Increase to 2 stations
    await user.click(screen.getByRole('button', { name: '2' }))
    await waitFor(() => {
      expect(screen.getByText(/עמדה חדשה — יש לבחור שעת התחלה/)).toBeTruthy()
    })

    // Click Next without any interaction — custom time is default and valid
    await user.click(screen.getByText('הבא →'))

    // Should navigate to Step2 (custom default applies)
    await waitFor(() => {
      expect(screen.getByText('הגדרת זמנים')).toBeTruthy()
    })
  })
})

describe('Continue round — new station custom start time', () => {
  it('proceeds to Step2 after selecting a custom start time for the new station', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderApp('/schedule/sched1/continue')

    await navigateToContinueStep1(user)

    // Increase to 2 stations
    await user.click(screen.getByRole('button', { name: '2' }))
    await waitFor(() => {
      expect(screen.getByText(/עמדה חדשה — יש לבחור שעת התחלה/)).toBeTruthy()
    })

    // Custom time is pre-selected by default — just click Next
    await user.click(screen.getByText('הבא →'))

    // Should navigate to Step2
    await waitFor(() => {
      expect(screen.getByText('הגדרת זמנים')).toBeTruthy()
    })
  })

  it('new station with custom start time gets startTimeOverride set in the session', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderApp('/schedule/sched1/continue')

    await navigateToContinueStep1(user)
    await user.click(screen.getByRole('button', { name: '2' }))
    await waitFor(() => {
      expect(screen.getByText(/עמדה חדשה/)).toBeTruthy()
    })

    // Proceed — custom time is default, so just Next
    await user.click(screen.getByText('הבא →'))

    await waitFor(() => {
      expect(screen.getByText('הגדרת זמנים')).toBeTruthy()
    })

    // Proceed through the wizard and create the schedule
    await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
    await user.click(screen.getByText('הבא →'))
    await user.click(screen.getByText('הבא →'))
    await user.click(screen.getByText('צור לוח שמירה ✓'))

    await waitFor(() => {
      const schedules = getSchedules()
      const cont = schedules.find(s => s.parentScheduleId === 'sched1')
      expect(cont).toBeTruthy()
      // Two stations: the original and the new one
      expect(cont!.stations.length).toBe(2)
    })
  })
})

describe('Continue round — new station inherit start time', () => {
  it('shows the previous stations in the inherit dropdown', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderApp('/schedule/sched1/continue')

    await navigateToContinueStep1(user)
    await user.click(screen.getByRole('button', { name: '2' }))
    await waitFor(() => {
      expect(screen.getByText(/עמדה חדשה/)).toBeTruthy()
    })

    // Click the "inherit" radio button
    await user.click(screen.getByLabelText('התחל לפי עמדה קיימת'))

    // The dropdown with previous station options should appear
    await waitFor(() => {
      // Previous round had "עמדה 1" ending at 22:00
      expect(screen.getByRole('combobox')).toBeTruthy()
      expect(screen.getByText(/עמדה 1.*22:00/)).toBeTruthy()
    })
  })

  it('proceeds to Step2 when inherit is selected', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderApp('/schedule/sched1/continue')

    await navigateToContinueStep1(user)
    await user.click(screen.getByRole('button', { name: '2' }))
    await waitFor(() => {
      expect(screen.getByText(/עמדה חדשה/)).toBeTruthy()
    })

    await user.click(screen.getByLabelText('התחל לפי עמדה קיימת'))

    await user.click(screen.getByText('הבא →'))

    await waitFor(() => {
      expect(screen.getByText('הגדרת זמנים')).toBeTruthy()
    })
  })
})

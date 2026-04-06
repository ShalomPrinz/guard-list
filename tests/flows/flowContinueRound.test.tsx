/**
 * E2E flow test — Continue Round.
 * Seeds an existing schedule and verifies that the continuation flow
 * starts at Step1_Stations with pre-filled config and links the new schedule to the parent.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '@/context/WizardContext'
import Step1_Stations from '@/screens/Step1_Stations'
import Step2_Time from '@/screens/Step2_Time'
import Step3_Order from '@/screens/Step3_Order'
import Step4_Review from '@/screens/Step4_Review'
import ResultScreen from '@/screens/ResultScreen'
import ContinueRoundScreen from '@/screens/ContinueRoundScreen'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import { upsertGroup } from '@/storage/groups'
import { addSchedule, getSchedules } from '@/storage/schedules'
import type { Group, Schedule } from '@/types'

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
          {
            name: 'Alice',
            startTime: '20:00',
            endTime: '21:00',
            date: '2026-03-16',
            durationMinutes: 60,
            
          },
          {
            name: 'Bob',
            startTime: '21:00',
            endTime: '22:00',
            date: '2026-03-16',
            durationMinutes: 60,
            
          },
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
          <Route path="/schedule/:scheduleId/result" element={<ResultScreen />} />
          <Route path="/schedule/:scheduleId/continue" element={<ContinueRoundScreen />} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ContinueRoundScreen — renders correctly', () => {
  it('shows the continue round heading', () => {
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderApp('/schedule/sched1/continue')

    expect(screen.getByText('המשך סבב')).toBeTruthy()
  })

  it('shows round name input pre-filled with continuation name', () => {
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderApp('/schedule/sched1/continue')

    expect(screen.getByDisplayValue('המשך — שמירה ראשונה')).toBeTruthy()
  })

  it('shows "not found" message when schedule does not exist', () => {
    renderApp('/schedule/nonexistent/continue')
    expect(screen.getByText('לוח שמירה לא נמצא.')).toBeTruthy()
  })
})

describe('ContinueRoundScreen — start continuation', () => {
  it('navigates to Step1_Stations after clicking "התחל סבב"', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderApp('/schedule/sched1/continue')

    await user.click(screen.getByText('התחל סבב →'))

    // Should land on Step1 with station configuration
    expect(screen.getByText('הגדרת עמדות')).toBeTruthy()
  })

  it('pre-fills station names from the previous schedule in Step1', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderApp('/schedule/sched1/continue')

    await user.click(screen.getByText('התחל סבב →'))

    // Station name from previous schedule should be pre-filled
    expect(screen.getByDisplayValue('עמדה 1')).toBeTruthy()
  })
})

describe('Continuation schedule — parentScheduleId', () => {
  it('creates a continuation schedule with parentScheduleId set', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderApp('/schedule/sched1/continue')

    // Start continuation → Step1 (pre-filled stations)
    await user.click(screen.getByText('התחל סבב →'))
    expect(screen.getByText('הגדרת עמדות')).toBeTruthy()

    // Step1 → Step2
    await user.click(screen.getByText('הבא →'))
    expect(screen.getByText('הגדרת זמנים')).toBeTruthy()

    // Step 2: select fixed-duration mode, enter duration and proceed
    await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
    await user.click(screen.getByText('הבא →'))

    // Step 3: proceed with auto-distributed participants
    await user.click(screen.getByText('הבא →'))

    // Step 4: create
    await user.click(screen.getByText('צור לוח שמירה ✓'))

    await waitFor(() => {
      const schedules = getSchedules()
      const continuation = schedules.find(s => s.parentScheduleId === 'sched1')
      expect(continuation).toBeTruthy()
    })
  })

  it('result screen shows "← חזרה לעריכה" for continuation schedule', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderApp('/schedule/sched1/continue')

    await user.click(screen.getByText('התחל סבב →'))
    await user.click(screen.getByText('הבא →')) // Step1 → Step2
    await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
    await user.click(screen.getByText('הבא →'))
    await user.click(screen.getByText('הבא →'))
    await user.click(screen.getByText('צור לוח שמירה ✓'))

    await waitFor(() => {
      expect(screen.getByText('← חזרה לעריכה')).toBeTruthy()
    })
  })
})

describe('Continue Round — user start time override (E015)', () => {
  it('Step4 uses user-entered start time when user edits it in Step2, not the pre-filled value', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    // Schedule where Bob ends at 22:00 — so continuation pre-fills start time as 22:00
    addSchedule(makeSchedule())
    renderApp('/schedule/sched1/continue')

    // Start continuation → Step1 (pre-filled stations)
    await user.click(screen.getByText('התחל סבב →'))
    expect(screen.getByText('הגדרת עמדות')).toBeTruthy()

    // Step1 → Step2
    await user.click(screen.getByText('הבא →'))
    expect(screen.getByText('הגדרת זמנים')).toBeTruthy()

    // Start time is pre-filled as 22:00 — user changes hours to 23, then blurs to commit
    // getAllByLabelText because end-time mode also renders a second TimePicker for end time
    const hoursInput = screen.getAllByLabelText('שעות')[0]
    await user.clear(hoursInput)
    await user.type(hoursInput, '23')
    await user.tab()

    // Use fixed-duration mode so no end time is required
    await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
    await user.click(screen.getByText('הבא →'))

    // Step3 → Step4
    await user.click(screen.getByText('הבא →'))

    // Create the schedule
    await user.click(screen.getByText('צור לוח שמירה ✓'))

    await waitFor(() => {
      const schedules = getSchedules()
      const continuation = schedules.find(s => s.parentScheduleId === 'sched1')
      expect(continuation).toBeTruthy()
      // First participant must start at 23:00 (user-entered), not 22:00 (pre-filled override)
      const firstParticipant = continuation!.stations[0].participants[0]
      expect(firstParticipant.startTime).toBe('23:00')
    })
  })
})

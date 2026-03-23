/**
 * E2E tests for the global Header.
 *
 * Verifies:
 * - Header with app name renders on HomeScreen, each wizard step,
 *   ResultScreen, and StatisticsScreen
 * - Clicking the header from mid-wizard navigates to HomeScreen
 * - Wizard session is cleared after navigating home via the header
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '../../src/context/WizardContext'
import Layout from '../../src/components/Layout'
import HomeScreen from '../../src/screens/HomeScreen'
import Step1_Stations from '../../src/screens/Step1_Stations'
import Step2_Time from '../../src/screens/Step2_Time'
import Step3_Order from '../../src/screens/Step3_Order'
import Step4_Review from '../../src/screens/Step4_Review'
import ResultScreen from '../../src/screens/ResultScreen'
import StatisticsScreen from '../../src/screens/StatisticsScreen'
import { createLocalStorageMock } from '../../src/tests/localStorageMock'
import { upsertGroup } from '../../src/storage/groups'
import { addSchedule } from '../../src/storage/schedules'
import type { Group, Schedule } from '../../src/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeGroup(): Group {
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

function makeSchedule(): Schedule {
  return {
    id: 'sched1',
    name: 'שמירה',
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
        ],
      },
    ],
    unevenDistributionMode: 'equal-duration',
  }
}

// ─── App renderer ─────────────────────────────────────────────────────────────

function renderFullApp(initialPath = '/') {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/schedule/new/step1" element={<Step1_Stations />} />
            <Route path="/schedule/new/step2" element={<Step2_Time />} />
            <Route path="/schedule/new/step3" element={<Step3_Order />} />
            <Route path="/schedule/new/step4" element={<Step4_Review />} />
            <Route path="/schedule/:scheduleId/result" element={<ResultScreen />} />
            <Route path="/statistics" element={<StatisticsScreen />} />
          </Route>
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

describe('Header visibility across screens', () => {
  it('renders on HomeScreen', () => {
    upsertGroup(makeGroup())
    renderFullApp('/')
    expect(screen.getByText('רשימת שמירה')).toBeTruthy()
    expect(screen.getByRole('banner')).toBeTruthy()
  })

  it('renders on Step1 (wizard start)', () => {
    upsertGroup(makeGroup())
    renderFullApp('/schedule/new/step1')
    expect(screen.getByText('רשימת שמירה')).toBeTruthy()
  })

  it('renders on each subsequent wizard step', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderFullApp('/schedule/new/step1')

    // Step 2
    await user.click(screen.getByText('הבא →'))
    expect(screen.getByText('רשימת שמירה')).toBeTruthy()

    // Step 3
    await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
    await user.click(screen.getByText('הבא →'))
    expect(screen.getByText('רשימת שמירה')).toBeTruthy()

    // Step 4
    await user.click(screen.getByText('הבא →'))
    expect(screen.getByText('רשימת שמירה')).toBeTruthy()
  })

  it('renders on ResultScreen', async () => {
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderFullApp('/schedule/sched1/result')
    await waitFor(() => {
      expect(screen.getByText('רשימת שמירה')).toBeTruthy()
    })
  })

  it('renders on StatisticsScreen', () => {
    renderFullApp('/statistics')
    expect(screen.getByText('רשימת שמירה')).toBeTruthy()
  })
})

describe('Header home navigation', () => {
  it('clicking the header from Step3_Order navigates to HomeScreen', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderFullApp('/schedule/new/step1')

    // Navigate to step 3
    await user.click(screen.getByText('הבא →'))
    await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
    await user.click(screen.getByText('הבא →'))
    expect(screen.getByText('סדר שומרים')).toBeTruthy()

    // Click the header home button
    await user.click(screen.getByLabelText('חזרה לדף הבית'))

    // Should be on HomeScreen
    await waitFor(() => {
      expect(screen.getByText(/צור לוח שמירה/)).toBeTruthy()
    })
    expect(screen.queryByText('סדר שומרים')).toBeNull()
  })

  it('wizard session is cleared after navigating home via the header', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderFullApp('/schedule/new/step1')

    // Advance into the wizard (step 3 has an active session with stations)
    await user.click(screen.getByText('הבא →'))
    await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
    await user.click(screen.getByText('הבא →'))
    await user.click(screen.getByText('הבא →'))
    expect(screen.getByText('סקירה ועריכה')).toBeTruthy()

    // Click header → HomeScreen
    await user.click(screen.getByLabelText('חזרה לדף הבית'))
    await waitFor(() => {
      expect(screen.getByText(/צור לוח שמירה/)).toBeTruthy()
    })

    // Start a new wizard — step1 should load cleanly (session was cleared,
    // not restored from the previous abandoned wizard)
    await user.click(screen.getByText(/\+ צור לוח שמירה/))
    await waitFor(() => {
      expect(screen.getByText('הגדרת עמדות')).toBeTruthy()
    })
    // Step indicator shows step 1 — fresh start, not a continued session
    expect(screen.getByText(/שלב 1 מתוך 4/)).toBeTruthy()
  })

  it('header home button has accessible label', () => {
    renderFullApp('/')
    expect(screen.getByLabelText('חזרה לדף הבית')).toBeTruthy()
  })
})

describe('Header does not show duplicate branding on HomeScreen', () => {
  it('app name appears exactly once on normal HomeScreen (only in header, not in page content)', () => {
    // Seed a group so the normal HomeScreen renders (not the welcome state)
    upsertGroup(makeGroup())
    renderFullApp('/')
    const matches = screen.getAllByText('רשימת שמירה')
    expect(matches).toHaveLength(1)
  })
})

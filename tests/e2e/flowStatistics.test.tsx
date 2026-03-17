/**
 * E2E flow test — Statistics accumulation and reset.
 * Creates schedules and verifies the StatisticsScreen reflects the results.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '../../src/context/WizardContext'
import HomeScreen from '../../src/screens/HomeScreen'
import Step1_Stations from '../../src/screens/Step1_Stations'
import Step2_Time from '../../src/screens/Step2_Time'
import Step3_Order from '../../src/screens/Step3_Order'
import Step4_Review from '../../src/screens/Step4_Review'
import ResultScreen from '../../src/screens/ResultScreen'
import StatisticsScreen from '../../src/screens/StatisticsScreen'
import ParticipantHistoryScreen from '../../src/screens/ParticipantHistoryScreen'
import { createLocalStorageMock } from '../../src/tests/localStorageMock'
import { upsertGroup } from '../../src/storage/groups'
import { recordShift, getStatistics } from '../../src/storage/statistics'
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

function renderFullApp(initialPath = '/schedule/new/step1') {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/schedule/new/step1" element={<Step1_Stations />} />
          <Route path="/schedule/new/step2" element={<Step2_Time />} />
          <Route path="/schedule/new/step3" element={<Step3_Order />} />
          <Route path="/schedule/new/step4" element={<Step4_Review />} />
          <Route path="/schedule/:scheduleId/result" element={<ResultScreen />} />
          <Route path="/statistics" element={<StatisticsScreen />} />
          <Route path="/statistics/:participantName" element={<ParticipantHistoryScreen />} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

async function createScheduleViaWizard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('הבא →'))
  await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
  await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
  await user.click(screen.getByText('הבא →'))
  await user.click(screen.getByText('הבא →'))
  await user.click(screen.getByText('צור לוח שמירה ✓'))
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StatisticsScreen — display', () => {
  it('shows all participants with their shift counts', () => {
    // Seed statistics directly
    recordShift('Alice', {
      scheduleId: 's1', scheduleName: 'שמירה', stationName: 'עמדה 1',
      date: '2026-03-16', startTime: '20:00', endTime: '21:00', durationMinutes: 60,
    })
    recordShift('Bob', {
      scheduleId: 's1', scheduleName: 'שמירה', stationName: 'עמדה 1',
      date: '2026-03-16', startTime: '21:00', endTime: '22:00', durationMinutes: 60,
    })

    render(
      <MemoryRouter initialEntries={['/statistics']}>
        <Routes>
          <Route path="/statistics" element={<StatisticsScreen />} />
          <Route path="/" element={<div>דף הבית</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    // Each has 1 shift
    const shiftCounts = screen.getAllByText('1')
    expect(shiftCounts.length).toBeGreaterThanOrEqual(2)
  })

  it('shows total duration correctly for a participant', () => {
    recordShift('Alice', {
      scheduleId: 's1', scheduleName: 'שמירה', stationName: 'עמדה 1',
      date: '2026-03-16', startTime: '20:00', endTime: '21:00', durationMinutes: 60,
    })

    render(
      <MemoryRouter initialEntries={['/statistics']}>
        <Routes>
          <Route path="/statistics" element={<StatisticsScreen />} />
          <Route path="/" element={<div>דף הבית</div>} />
        </Routes>
      </MemoryRouter>,
    )

    // 60 minutes = 1 hour → displayed as "1ש׳" (Hebrew geresh)
    expect(screen.getByText(/1ש/)).toBeTruthy()
  })

  it('shows empty state message when no statistics', () => {
    render(
      <MemoryRouter initialEntries={['/statistics']}>
        <Routes>
          <Route path="/statistics" element={<StatisticsScreen />} />
          <Route path="/" element={<div>דף הבית</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('אין נתונים עדיין. צור לוח שמירה כדי לצבור סטטיסטיקות.')).toBeTruthy()
  })
})

describe('StatisticsScreen — history drill-down', () => {
  it('navigates to participant history screen on "היסטוריה" click', async () => {
    const user = userEvent.setup()
    recordShift('Alice', {
      scheduleId: 's1', scheduleName: 'שמירה ראשונה', stationName: 'עמדה 1',
      date: '2026-03-16', startTime: '20:00', endTime: '21:00', durationMinutes: 60,
    })

    render(
      <MemoryRouter initialEntries={['/statistics']}>
        <Routes>
          <Route path="/statistics" element={<StatisticsScreen />} />
          <Route path="/statistics/:participantName" element={<ParticipantHistoryScreen />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByText('היסטוריה'))

    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('שמירה ראשונה')).toBeTruthy()
  })
})

describe('StatisticsScreen — reset', () => {
  it('reset button clears all statistics', async () => {
    const user = userEvent.setup()
    recordShift('Alice', {
      scheduleId: 's1', scheduleName: 'שמירה', stationName: 'עמדה 1',
      date: '2026-03-16', startTime: '20:00', endTime: '21:00', durationMinutes: 60,
    })

    render(
      <MemoryRouter initialEntries={['/statistics']}>
        <Routes>
          <Route path="/statistics" element={<StatisticsScreen />} />
          <Route path="/" element={<div>דף הבית</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByText('איפוס כל הסטטיסטיקות'))
    // Confirm dialog appears — click the "מחיקה" confirmation button
    await user.click(screen.getByText('מחיקה'))

    await waitFor(() => {
      expect(getStatistics().participants).toEqual({})
    })
    expect(screen.getByText('אין נתונים עדיין. צור לוח שמירה כדי לצבור סטטיסטיקות.')).toBeTruthy()
  })
})

describe('Statistics via full wizard flow', () => {
  it('accumulates statistics after completing wizard', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderFullApp()

    await createScheduleViaWizard(user)

    await waitFor(() => {
      const stats = getStatistics()
      expect(Object.keys(stats.participants).length).toBe(3)
    })
  })
})

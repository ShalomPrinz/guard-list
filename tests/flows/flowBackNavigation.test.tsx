/**
 * E2E flow test — Back navigation regression guard.
 *
 * Verifies:
 * - Back from ResultScreen after a new schedule resets session and goes home
 * - Back from ResultScreen after continuation goes back to Step4 (not home)
 * - Session is preserved during Back navigation between wizard steps
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '@/context/WizardContext'
import HomeScreen from '@/screens/HomeScreen'
import Step1_Stations from '@/screens/Step1_Stations'
import Step2_Time from '@/screens/Step2_Time'
import Step3_Order from '@/screens/Step3_Order'
import Step4_Review from '@/screens/Step4_Review'
import ResultScreen from '@/screens/ResultScreen'
import ContinueRoundScreen from '@/screens/ContinueRoundScreen'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import { upsertGroup } from '@/storage/groups'
import { addSchedule } from '@/storage/schedules'
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

function makeSchedule(): Schedule {
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
            name: 'Alice', startTime: '20:00', endTime: '21:00',
            date: '2026-03-16', durationMinutes: 60,
          },
          {
            name: 'Bob', startTime: '21:00', endTime: '22:00',
            date: '2026-03-16', durationMinutes: 60,
          },
        ],
      },
    ],
    unevenDistributionMode: 'equal-duration',
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
          <Route path="/schedule/:scheduleId/continue" element={<ContinueRoundScreen />} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

async function runFullWizard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('הבא →'))
  await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
  await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
  await user.click(screen.getByText('הבא →'))
  await user.click(screen.getByText('הבא →'))
  await user.click(screen.getByText('צור לוח שמירה ✓'))
  // Wait for result screen
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /🔒/ })).toBeTruthy()
  })
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Back navigation — new schedule result screen', () => {
  it('shows "← חזרה לעריכה" button when session is active after creation', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderFullApp()
    await runFullWizard(user)

    expect(screen.getByText('← חזרה לעריכה')).toBeTruthy()
  })

  it('back from new schedule result returns to step4 (post-create editing)', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderFullApp()
    await runFullWizard(user)

    await user.click(screen.getByText('← חזרה לעריכה'))

    expect(screen.getByText('סקירה ועריכה')).toBeTruthy()
  })
})

describe('Back navigation — continuation result screen', () => {
  it('shows "← חזרה לעריכה" button for a continuation schedule', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderFullApp('/schedule/sched1/continue')

    // Complete the continuation wizard (now goes through Step1 first)
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

  it('back from continuation result navigates to step4, not home', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    addSchedule(makeSchedule())
    renderFullApp('/schedule/sched1/continue')

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

    await user.click(screen.getByText('← חזרה לעריכה'))

    // Should be at step4 (session is still alive)
    expect(screen.getByText('סקירה ועריכה')).toBeTruthy()
  })
})

describe('Back navigation — within wizard', () => {
  it('back from step2 to step1 shows step1 heading', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderFullApp()

    // Go to step2
    await user.click(screen.getByText('הבא →'))
    expect(screen.getByText('הגדרת זמנים')).toBeTruthy()

    // Back to step1
    await user.click(screen.getByText('← חזרה'))
    expect(screen.getByText('הגדרת עמדות')).toBeTruthy()
  })

  it('back from step3 to step2 shows step2 heading', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderFullApp()

    await user.click(screen.getByText('הבא →'))
    await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
    await user.click(screen.getByText('הבא →'))
    expect(screen.getByText('סדר שומרים')).toBeTruthy()

    await user.click(screen.getByText('← חזרה'))
    expect(screen.getByText('הגדרת זמנים')).toBeTruthy()
  })
})

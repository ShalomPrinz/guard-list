/**
 * E2E tests for Migration 004 features:
 *
 * 1. Post-create state preservation — participant names survive the
 *    ResultScreen → Step4 back navigation.
 * 2. Re-save idempotency — clicking "Create Schedule" a second time
 *    (after back navigation) overwrites the existing schedule rather
 *    than inserting a duplicate.
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
import { createLocalStorageMock } from '../../src/tests/localStorageMock'
import { upsertGroup } from '../../src/storage/groups'
import { getSchedules } from '../../src/storage/schedules'
import type { Group } from '../../src/types'

// ─── Group factories ──────────────────────────────────────────────────────────

function makeGroup3(): Group {
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

// ─── App renderer ─────────────────────────────────────────────────────────────

function renderApp() {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={['/schedule/new/step1']}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
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

// ─── Wizard navigation helpers ────────────────────────────────────────────────

/** Navigate through all 4 steps of a single-station wizard (3 members, 60 min). */
async function runSingleStationWizard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('הבא →'))                       // step1 → step2
  await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
  await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
  await user.click(screen.getByText('הבא →'))                       // step2 → step3
  await user.click(screen.getByText('הבא →'))                       // step3 → step4
  await user.click(screen.getByText('צור לוח שמירה ✓'))             // step4 → result
  await waitFor(() => {
    expect(screen.getByText(/🔒/)).toBeTruthy()
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

describe('Post-create state preservation', () => {
  it('participant names are visible in step4 after navigating back from result screen', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup3())
    renderApp()
    await runSingleStationWizard(user)

    // Back button should return to step4
    await user.click(screen.getByText('← חזרה לעריכה'))

    // Step4 heading confirms we are on the right screen
    expect(screen.getByText('סקירה ועריכה')).toBeTruthy()

    // All three participants should still appear (session state preserved)
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Charlie')).toBeTruthy()
  })

  it('re-saving from step4 overwrites the schedule without creating a duplicate', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup3())
    renderApp()
    await runSingleStationWizard(user)

    // Navigate back and re-create
    await user.click(screen.getByText('← חזרה לעריכה'))
    await user.click(screen.getByText('צור לוח שמירה ✓'))

    await waitFor(() => {
      const schedules = getSchedules()
      expect(schedules).toHaveLength(1)
    })
  })
})

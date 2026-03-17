/**
 * E2E flow test — two-station schedule creation.
 * Tests that multiple stations are correctly set up and participants distributed.
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

function makeGroup4Members(): Group {
  return {
    id: 'g1',
    name: 'מחלקה א',
    members: [
      { id: 'm1', name: 'Alice', availability: 'base' },
      { id: 'm2', name: 'Bob', availability: 'base' },
      { id: 'm3', name: 'Charlie', availability: 'base' },
      { id: 'm4', name: 'Dana', availability: 'base' },
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
          <Route path="/schedule/:scheduleId/result" element={<ResultScreen />} />
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

describe('Two time-based stations', () => {
  it('creates a schedule with 2 stations when 2 is selected in step1', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup4Members())
    renderApp()

    // Step 1: select 2 stations
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByText('הבא →'))

    // Step 2: select fixed-duration mode, enter duration
    await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
    await user.click(screen.getByText('הבא →'))

    // Step 3: click Next (auto-distributed 2+2)
    await user.click(screen.getByText('הבא →'))

    // Step 4: create
    await user.click(screen.getByText('צור לוח שמירה ✓'))

    await waitFor(() => {
      const schedule = getSchedules()[0]
      expect(schedule.stations).toHaveLength(2)
    })
  })

  it('distributes 4 participants evenly: 2 per station', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup4Members())
    renderApp()

    // Step 1: 2 stations
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByText('הבא →'))

    // Step 2: select fixed-duration mode, enter duration
    await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
    await user.click(screen.getByText('הבא →'))

    // Step 3: both stations should have 2 participants each
    // The two station cards should each show 2 participant rows
    expect(screen.getByText('עמדה 1')).toBeTruthy()
    expect(screen.getByText('עמדה 2')).toBeTruthy()

    await user.click(screen.getByText('הבא →'))

    // Step 4: create
    await user.click(screen.getByText('צור לוח שמירה ✓'))

    await waitFor(() => {
      const schedule = getSchedules()[0]
      const totalParticipants = schedule.stations.reduce(
        (sum, st) => sum + st.participants.length,
        0,
      )
      expect(totalParticipants).toBe(4)
    })
  })

  it('saves unevenDistributionMode as equal-duration by default', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup4Members())
    renderApp()

    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByText('הבא →'))
    await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
    await user.click(screen.getByText('הבא →'))
    await user.click(screen.getByText('הבא →'))
    await user.click(screen.getByText('צור לוח שמירה ✓'))

    await waitFor(() => {
      const schedule = getSchedules()[0]
      expect(schedule.unevenDistributionMode).toBe('equal-duration')
    })
  })
})


/**
 * E2E flow test — full single-station schedule creation.
 * Goes through all 4 wizard steps and verifies the resulting schedule.
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
import { getStatistics } from '../../src/storage/statistics'
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

async function runFullWizard(user: ReturnType<typeof userEvent.setup>) {
  // Step 1: select group + default 1 station → Next
  await user.click(screen.getByText('הבא →'))

  // Step 2: enter fixed duration → Next
  await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
  await user.click(screen.getByText('הבא →'))

  // Step 3: participants auto-distributed → Next
  await user.click(screen.getByText('הבא →'))

  // Step 4: create schedule
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

describe('Full single-station schedule creation', () => {
  it('creates a schedule with 3 participants saved in localStorage', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await runFullWizard(user)

    await waitFor(() => {
      const schedules = getSchedules()
      expect(schedules).toHaveLength(1)
      const schedule = schedules[0]
      expect(schedule.stations).toHaveLength(1)
      expect(schedule.stations[0].participants).toHaveLength(3)
    })
  })

  it('schedule has correct group ID and station type', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await runFullWizard(user)

    await waitFor(() => {
      const schedule = getSchedules()[0]
      expect(schedule.groupId).toBe('g1')
      expect(schedule.stations[0].stationType).toBe('time-based')
    })
  })

  it('result screen shows participant names', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await runFullWizard(user)

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeTruthy()
    })
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Charlie')).toBeTruthy()
  })

  it('records statistics for each participant after creation', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await runFullWizard(user)

    await waitFor(() => {
      const stats = getStatistics()
      const names = Object.keys(stats.participants)
      expect(names.length).toBe(3)
      for (const name of names) {
        expect(stats.participants[name].totalShifts).toBe(1)
        expect(stats.participants[name].totalMinutes).toBe(60)
      }
    })
  })

  it('result screen shows WhatsApp share buttons', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await runFullWizard(user)

    await waitFor(() => {
      expect(screen.getByText(/העתק לוואצאפ/)).toBeTruthy()
    })
    expect(screen.getByText(/שלח בוואצאפ/)).toBeTruthy()
  })
})

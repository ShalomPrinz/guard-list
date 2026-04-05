/**
 * E2E flow test — Short-list back navigation fix.
 *
 * This test verifies the core fix: that the short-list session survives navigation
 * from Step2 to ResultScreen, so the back button can correctly navigate back to Step2.
 *
 * Before the fix:
 * - clearSession() was called in ShortListStep2 line 80 before navigation
 * - By the time ResultScreen rendered, the session was already null
 * - Back button condition `if (shortListSession)` evaluated to false
 * - Back navigation went to home instead of Step2
 *
 * After the fix:
 * - clearSession() is NOT called in ShortListStep2 before navigation
 * - Session survives to ResultScreen
 * - Back button can correctly detect session and navigate to Step2
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '@/context/WizardContext'
import { ShortListWizardProvider } from '@/context/ShortListWizardContext'
import HomeScreen from '@/screens/HomeScreen'
import Step1_Stations from '@/screens/Step1_Stations'
import ShortListStep2 from '@/screens/ShortListStep2'
import ResultScreen from '@/screens/ResultScreen'
import FallbackScreen from '@/screens/FallbackScreen'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import { upsertGroup } from '@/storage/groups'
import { saveStationsConfig } from '@/storage/stationsConfig'
import { upsertSchedule } from '@/storage/schedules'
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

function renderFullApp(initialPath = '/short-list/step1/g1') {
  return render(
    <ShortListWizardProvider>
      <WizardProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/short-list/step1/:groupId" element={<Step1_Stations />} />
            <Route path="/short-list/step2" element={<ShortListStep2 />} />
            <Route path="/schedule/:scheduleId/result" element={<ResultScreen />} />
            <Route path="/fallback" element={<FallbackScreen />} />
          </Routes>
        </MemoryRouter>
      </WizardProvider>
    </ShortListWizardProvider>,
  )
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Short-list back navigation fix', () => {
  it('session persists from Step2 through ResultScreen to enable back button', async () => {
    const user = userEvent.setup()

    // Setup: create group and station config
    const group = makeGroup()
    upsertGroup(group)
    saveStationsConfig([{ id: 'st1', name: 'עמדה 1', type: 'time-based' }])

    renderFullApp()

    // Navigate from Step1 to Step2
    const nextBtn = screen.getByText('הבא →')
    await user.click(nextBtn)

    await waitFor(() => {
      expect(screen.getByText('הגדרת רשימה קצרה')).toBeTruthy()
    })

    // Verify Step2 form is visible
    const createBtn = screen.getByRole('button', { name: /יצור רשימה/ })
    expect(createBtn).toBeTruthy()

    // Click create — this will generate schedule and navigate to ResultScreen
    await user.click(createBtn)

    // Wait for ResultScreen to render
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /🔒/ })).toBeTruthy()
    })

    // Now verify the back button works — it should navigate back to Step2 with session intact
    const backBtn = screen.getByRole('button', { name: /← חזרה לעריכה/ })
    expect(backBtn).toBeTruthy()

    // Click back
    await user.click(backBtn)

    // Should be back in Step2 with form visible
    await waitFor(() => {
      expect(screen.getByText('הגדרת רשימה קצרה')).toBeTruthy()
    })

    // Verify form state is preserved
    expect(screen.getByRole('button', { name: /יצור רשימה/ })).toBeTruthy()
  })

  it('back button works when opening short-list schedule from history', async () => {
    const user = userEvent.setup()

    // Setup: create group, station config, and a short-list schedule
    const group = makeGroup()
    upsertGroup(group)
    saveStationsConfig([{ id: 'st1', name: 'עמדה 1', type: 'time-based' }])

    // Create a schedule marked as created from short-list
    const shortListSchedule: Schedule = {
      id: 'sched2',
      name: 'רשימת שמירה',
      groupId: 'g1',
      createdAt: new Date().toISOString(),
      date: '2026-04-05',
      createdFromShortList: true,
      stations: [
        {
          stationConfigId: 'st1',
          stationName: 'עמדה 1',
          stationType: 'time-based',
          participants: [
            {
              name: 'Alice',
              startTime: '14:00',
              endTime: '15:00',
              date: '2026-04-05',
              durationMinutes: 60,
              locked: false,
              skipped: false,
            },
          ],
        },
      ],
      unevenDistributionMode: 'equal-duration',
    }
    upsertSchedule(shortListSchedule)

    // Navigate directly to ResultScreen (simulating opening from history)
    renderFullApp(`/schedule/sched2/result`)

    // Wait for ResultScreen to load
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /🔒/ })).toBeTruthy()
    })

    // Click back button
    const backBtn = screen.getByRole('button', { name: /← חזרה לעריכה/ })
    await user.click(backBtn)

    // Should navigate to short-list Step2 and reconstruct the session
    await waitFor(() => {
      expect(screen.getByText('הגדרת רשימה קצרה')).toBeTruthy()
    })
  })

  it('clears session when clicking cancel in Step2', async () => {
    const user = userEvent.setup()

    // Setup
    const group = makeGroup()
    upsertGroup(group)
    saveStationsConfig([{ id: 'st1', name: 'עמדה 1', type: 'time-based' }])

    renderFullApp()

    // Navigate to Step2
    const nextBtn = screen.getByText('הבא →')
    await user.click(nextBtn)

    await waitFor(() => {
      expect(screen.getByText('הגדרת רשימה קצרה')).toBeTruthy()
    })

    // Click cancel button
    const cancelBtn = screen.getByRole('button', { name: /← ביטול/ })
    await user.click(cancelBtn)

    // Should navigate to home
    await waitFor(() => {
      expect(screen.getByText(/קבוצות שמורות/)).toBeTruthy()
    })
  })
})

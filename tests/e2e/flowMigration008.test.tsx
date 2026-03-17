/**
 * E2E tests for Migration 008 — Review/HomeScreen fixes.
 * Covers: quote persistence, default name, clickable cards, text corrections, back from history.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '../../src/context/WizardContext'
import HomeScreen from '../../src/screens/HomeScreen'
import GroupEditScreen from '../../src/screens/GroupEditScreen'
import Step1_Stations from '../../src/screens/Step1_Stations'
import Step2_Time from '../../src/screens/Step2_Time'
import Step3_Order from '../../src/screens/Step3_Order'
import Step4_Review from '../../src/screens/Step4_Review'
import ResultScreen from '../../src/screens/ResultScreen'
import { createLocalStorageMock } from '../../src/tests/localStorageMock'
import { upsertGroup } from '../../src/storage/groups'
import { upsertSchedule, getSchedules } from '../../src/storage/schedules'
import type { Group, Schedule } from '../../src/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    name: 'לוח שמירה לדוגמה',
    groupId: 'g1',
    createdAt: new Date().toISOString(),
    date: '2026-03-16',
    stations: [
      {
        stationConfigId: 'st1',
        stationName: 'עמדה ראשית',
        stationType: 'time-based',
        participants: [
          { name: 'Alice', startTime: '20:00', endTime: '21:00', date: '2026-03-16', durationMinutes: 60, locked: false, skipped: false },
          { name: 'Bob', startTime: '21:00', endTime: '22:00', date: '2026-03-16', durationMinutes: 60, locked: false, skipped: false },
        ],
      },
    ],
    unevenDistributionMode: 'equal-duration',
  }
}

function renderWizardApp() {
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

function renderHomeApp(initialPath = '/') {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/group/:groupId/edit" element={<GroupEditScreen />} />
          <Route path="/schedule/new/step1" element={<div>שלב 1</div>} />
          <Route path="/schedule/new/step4" element={<Step4_Review />} />
          <Route path="/schedule/:scheduleId/result" element={<ResultScreen />} />
          <Route path="/schedule/:scheduleId/continue" element={<div>המשך סבב</div>} />
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

describe('Step4_Review — default schedule name', () => {
  it('shows "רשימת שמירה" as the default name', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderWizardApp()

    await user.click(screen.getByText('הבא →'))
    await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
    await user.click(screen.getByText('הבא →'))
    await user.click(screen.getByText('הבא →'))

    const nameInput = screen.getByDisplayValue('רשימת שמירה')
    expect(nameInput).toBeTruthy()
  })
})

describe('Step4_Review — quote and author persistence', () => {
  async function goToStep4WithQuote(user: ReturnType<typeof userEvent.setup>) {
    upsertGroup(makeGroup())
    renderWizardApp()

    await user.click(screen.getByText('הבא →'))
    await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
    await user.click(screen.getByText('הבא →'))
    await user.click(screen.getByText('הבא →'))

    const quoteTextarea = screen.getByPlaceholderText('הוסף ציטוט...')
    await user.type(quoteTextarea, 'ציטוט לדוגמה')

    await waitFor(() => {
      expect(screen.getByPlaceholderText('שם המחבר...')).toBeTruthy()
    })
    await user.type(screen.getByPlaceholderText('שם המחבר...'), 'מחבר לדוגמה')
  }

  it('saves quote and author to the schedule', async () => {
    const user = userEvent.setup()
    await goToStep4WithQuote(user)

    await user.click(screen.getByText('צור לוח שמירה ✓'))

    await waitFor(() => {
      const schedules = getSchedules()
      expect(schedules[0].quote).toBe('ציטוט לדוגמה')
      expect(schedules[0].quoteAuthor).toBe('מחבר לדוגמה')
    })
  })

  it('restores quote and author when navigating back from result to step4', async () => {
    const user = userEvent.setup()
    await goToStep4WithQuote(user)

    await user.click(screen.getByText('צור לוח שמירה ✓'))

    await waitFor(() => {
      expect(screen.getByText(/חזרה לעריכה/)).toBeTruthy()
    })

    await user.click(screen.getByText(/חזרה לעריכה/))

    await waitFor(() => {
      expect(screen.getByDisplayValue('ציטוט לדוגמה')).toBeTruthy()
    })
    expect(screen.getByDisplayValue('מחבר לדוגמה')).toBeTruthy()
  })
})

describe('HomeScreen — clickable group cards', () => {
  it('clicking group card body navigates to group edit screen', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderHomeApp()

    // Click on group name text (inside the card)
    await user.click(screen.getByText('מחלקה א'))

    await waitFor(() => {
      // GroupEditScreen shows member names as clickable buttons
      expect(screen.getByText('Alice')).toBeTruthy()
    })
  })

  it('delete button in group card does not navigate away', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderHomeApp()

    await user.click(screen.getByRole('button', { name: 'מחיקה' }))

    // Confirm dialog should appear (still on home)
    await waitFor(() => {
      expect(screen.getByText(/למחוק/)).toBeTruthy()
    })
  })
})

describe('HomeScreen — clickable schedule cards', () => {
  it('clicking schedule card body navigates to result screen', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    upsertSchedule(makeSchedule())
    renderHomeApp()

    await user.click(screen.getByText('לוח שמירה לדוגמה'))

    await waitFor(() => {
      expect(screen.getByText(/חזרה לעריכה/)).toBeTruthy()
    })
  })

  it('shows "עמדות" (not "תחנות") in schedule card', () => {
    upsertGroup(makeGroup())
    upsertSchedule(makeSchedule())
    renderHomeApp()

    expect(screen.getByText(/עמדות/)).toBeTruthy()
    expect(screen.queryByText(/תחנות/)).toBeNull()
  })
})

describe('ResultScreen — back button behavior', () => {
  it('always shows "חזרה לעריכה" button', async () => {
    upsertGroup(makeGroup())
    upsertSchedule(makeSchedule())
    renderHomeApp('/schedule/sched1/result')

    await waitFor(() => {
      expect(screen.getByText(/חזרה לעריכה/)).toBeTruthy()
    })
  })

  it('back from history schedule navigates to step4', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    upsertSchedule(makeSchedule())
    renderHomeApp('/schedule/sched1/result')

    await waitFor(() => {
      expect(screen.getByText(/חזרה לעריכה/)).toBeTruthy()
    })

    await user.click(screen.getByText(/חזרה לעריכה/))

    await waitFor(() => {
      // Should land on Step4 showing the schedule name
      expect(screen.getByDisplayValue('לוח שמירה לדוגמה')).toBeTruthy()
    })
  })

  it('re-saving from history schedule overwrites the same schedule', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    upsertSchedule(makeSchedule())
    renderHomeApp('/schedule/sched1/result')

    await waitFor(() => {
      expect(screen.getByText(/חזרה לעריכה/)).toBeTruthy()
    })
    await user.click(screen.getByText(/חזרה לעריכה/))

    await waitFor(() => {
      expect(screen.getByText('צור לוח שמירה ✓')).toBeTruthy()
    })
    await user.click(screen.getByText('צור לוח שמירה ✓'))

    await waitFor(() => {
      // Should still be only 1 schedule (overwrite, not new)
      expect(getSchedules()).toHaveLength(1)
      expect(getSchedules()[0].id).toBe('sched1')
    })
  })
})

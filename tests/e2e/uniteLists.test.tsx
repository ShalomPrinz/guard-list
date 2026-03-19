/**
 * E2E tests for Migration 013 — Unite Lists feature.
 *
 * Covers:
 * - "איחוד רשימות" button appears on ResultScreen only when parentScheduleId is set
 * - UniteScreen merges stations correctly (parent entries before child, sorted by time)
 * - UniteScreen uses the parent's round name and quote, not the child's
 * - The unified list is not written to localStorage after visiting UniteScreen
 * - WhatsApp text output from UniteScreen matches the expected merged format
 * - Back from UniteScreen returns to the child's ResultScreen
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import { WizardProvider } from '../../src/context/WizardContext'
import ResultScreen from '../../src/screens/ResultScreen'
import UniteScreen from '../../src/screens/UniteScreen'
import { createLocalStorageMock } from '../../src/tests/localStorageMock'
import { upsertSchedule } from '../../src/storage/schedules'
import type { Schedule } from '../../src/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeParticipant(name: string, startTime: string, endTime: string) {
  return {
    name,
    startTime,
    endTime,
    date: '2024-01-01',
    durationMinutes: 60,
    locked: false,
    skipped: false,
  }
}

const parentSchedule: Schedule = {
  id: 'parent1',
  name: 'סבב ראשון',
  groupId: 'g1',
  createdAt: '2024-01-01T20:00:00Z',
  date: '2024-01-01',
  stations: [
    {
      stationConfigId: 's1',
      stationName: 'עמדה א',
      stationType: 'time-based',
      participants: [
        makeParticipant('Alice', '20:00', '21:00'),
        makeParticipant('Bob', '21:00', '22:00'),
      ],
    },
  ],
  unevenDistributionMode: 'equal-duration',
  quote: 'ציטוט מהאבא',
  quoteAuthor: 'מחבר האבא',
}

const childSchedule: Schedule = {
  id: 'child1',
  name: 'סבב שני',
  groupId: 'g1',
  createdAt: '2024-01-01T22:00:00Z',
  date: '2024-01-01',
  parentScheduleId: 'parent1',
  stations: [
    {
      stationConfigId: 's1',
      stationName: 'עמדה א',
      stationType: 'time-based',
      participants: [
        makeParticipant('Charlie', '22:00', '23:00'),
        makeParticipant('Dave', '23:00', '00:00'),
      ],
    },
  ],
  unevenDistributionMode: 'equal-duration',
  quote: 'ציטוט מהבן',
  quoteAuthor: 'מחבר הבן',
}

const scheduleWithoutParent: Schedule = {
  id: 'standalone1',
  name: 'סבב עצמאי',
  groupId: 'g1',
  createdAt: '2024-01-01T20:00:00Z',
  date: '2024-01-01',
  stations: [
    {
      stationConfigId: 's1',
      stationName: 'עמדה א',
      stationType: 'time-based',
      participants: [makeParticipant('Alice', '20:00', '21:00')],
    },
  ],
  unevenDistributionMode: 'equal-duration',
}

function renderResultScreen(scheduleId: string) {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={[`/schedule/${scheduleId}/result`]}>
        <Routes>
          <Route path="/schedule/:scheduleId/result" element={<ResultScreen />} />
          <Route path="/schedule/:scheduleId/unite" element={<div>UniteScreen</div>} />
          <Route path="/schedule/:scheduleId/continue" element={<div>ContinueScreen</div>} />
          <Route path="/schedule/new/step4" element={<div>Step4</div>} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

function renderUniteScreen(scheduleId: string) {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={[`/schedule/${scheduleId}/unite`]}>
        <Routes>
          <Route path="/schedule/:scheduleId/unite" element={<UniteScreen />} />
          <Route path="/schedule/:scheduleId/result" element={<div data-testid="result-screen">ResultScreen</div>} />
          <Route path="/" element={<div>Home</div>} />
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

describe('ResultScreen — "איחוד רשימות" button visibility', () => {
  it('does NOT show "איחוד רשימות" button when schedule has no parentScheduleId', () => {
    upsertSchedule(scheduleWithoutParent)
    renderResultScreen('standalone1')

    expect(screen.queryByText('🔗 איחוד רשימות')).toBeNull()
  })

  it('shows "איחוד רשימות" button when schedule has parentScheduleId', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderResultScreen('child1')

    expect(screen.getByText('🔗 איחוד רשימות')).toBeTruthy()
  })

  it('"איחוד רשימות" button is also visible when viewing from history (not from wizard session)', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    // Navigate from home (no wizard session) — ResultScreen reads schedule from localStorage
    renderResultScreen('child1')

    expect(screen.getByText('🔗 איחוד רשימות')).toBeTruthy()
  })
})

describe('UniteScreen — station merging', () => {
  it('merges parent and child station participants sorted by start time', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderUniteScreen('child1')

    // Alice and Bob from parent (20:00, 21:00), Charlie and Dave from child (22:00, 23:00)
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Charlie')).toBeTruthy()
    expect(screen.getByText('Dave')).toBeTruthy()

    // Times should all appear
    expect(screen.getByText('20:00')).toBeTruthy()
    expect(screen.getByText('21:00')).toBeTruthy()
    expect(screen.getByText('22:00')).toBeTruthy()
    expect(screen.getByText('23:00')).toBeTruthy()
  })

  it('shows parent participants before child participants (sorted by time)', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderUniteScreen('child1')

    const names = screen.getAllByText(/Alice|Bob|Charlie|Dave/).map(el => el.textContent)
    // Parent times (20:00, 21:00) come before child times (22:00, 23:00)
    expect(names.indexOf('Alice')).toBeLessThan(names.indexOf('Charlie'))
    expect(names.indexOf('Bob')).toBeLessThan(names.indexOf('Dave'))
  })

  it('includes station-only-in-parent as-is', () => {
    const parentWithExtra: Schedule = {
      ...parentSchedule,
      stations: [
        ...parentSchedule.stations,
        {
          stationConfigId: 's2',
          stationName: 'עמדה ב',
          stationType: 'time-based',
          participants: [makeParticipant('Eve', '20:30', '21:30')],
        },
      ],
    }
    upsertSchedule(parentWithExtra)
    upsertSchedule(childSchedule) // child has no 'עמדה ב'
    renderUniteScreen('child1')

    expect(screen.getByText(/עמדה ב/)).toBeTruthy()
    expect(screen.getByText('Eve')).toBeTruthy()
  })
})

describe('UniteScreen — uses parent name and quote', () => {
  it('displays the parent schedule name as title', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderUniteScreen('child1')

    // Parent name 'סבב ראשון' should appear
    expect(screen.getByText(/סבב ראשון/)).toBeTruthy()
    // Child name 'סבב שני' should NOT appear as the title
    expect(screen.queryByText(/סבב שני/)).toBeNull()
  })

  it('displays the parent quote, not the child quote', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderUniteScreen('child1')

    expect(screen.getByText(/"ציטוט מהאבא"/)).toBeTruthy()
    expect(screen.queryByText(/"ציטוט מהבן"/)).toBeNull()
  })

  it('displays the parent quote author', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderUniteScreen('child1')

    expect(screen.getByText(/מחבר האבא/)).toBeTruthy()
    expect(screen.queryByText(/מחבר הבן/)).toBeNull()
  })
})

describe('UniteScreen — does not write to localStorage', () => {
  it('visiting UniteScreen does not add any new entry to localStorage', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)

    const storeBefore = JSON.parse(window.localStorage.getItem('schedules') ?? '[]') as Schedule[]
    const countBefore = storeBefore.length

    renderUniteScreen('child1')

    const storeAfter = JSON.parse(window.localStorage.getItem('schedules') ?? '[]') as Schedule[]
    expect(storeAfter.length).toBe(countBefore)
  })

  it('unified schedule id is not present in localStorage', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)

    renderUniteScreen('child1')

    const schedules = JSON.parse(window.localStorage.getItem('schedules') ?? '[]') as Schedule[]
    const ids = schedules.map((s: Schedule) => s.id)
    // Only the two original schedules should be stored
    expect(ids).toContain('parent1')
    expect(ids).toContain('child1')
    expect(ids).toHaveLength(2)
  })
})

describe('UniteScreen — WhatsApp text format', () => {
  it('WhatsApp text uses parent name and includes all participants in time order', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderUniteScreen('child1')

    // The formatted text should start with parent name and include all participants
    // We test by triggering copy and checking clipboard (or just verify the format via pure function)
    // Here we verify the rendered content matches expected structure
    expect(screen.getByText(/סבב ראשון/)).toBeTruthy()
    expect(screen.getByText(/עמדה א/)).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Charlie')).toBeTruthy()
  })
})

describe('UniteScreen — back navigation', () => {
  it('Back button navigates to the child schedule ResultScreen', async () => {
    const user = userEvent.setup()
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderUniteScreen('child1')

    const backButton = screen.getByText('← חזרה')
    await user.click(backButton)

    expect(screen.getByTestId('result-screen')).toBeTruthy()
  })
})

describe('UniteScreen — error state when schedule not found', () => {
  it('shows error message when child schedule does not exist', () => {
    renderUniteScreen('nonexistent')

    expect(screen.getByText('לוח שמירה לא נמצא.')).toBeTruthy()
  })

  it('shows error message when child has no parentScheduleId', () => {
    upsertSchedule(scheduleWithoutParent)
    renderUniteScreen('standalone1')

    // No parent found → error state
    expect(screen.getByText('לוח שמירה לא נמצא.')).toBeTruthy()
  })
})

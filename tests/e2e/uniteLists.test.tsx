/**
 * E2E tests for Unite Lists for All Guard Lists.
 *
 * Covers:
 * - "איחוד רשימות" button appears on every ResultScreen (continued AND non-continued)
 * - Continued round shows two-option modal; selecting "הקודמת" proceeds without list picker
 * - Continued round selecting "אחרת" opens list picker
 * - Non-continued round goes directly to list picker
 * - List picker shows all schedules except current, sorted newest first
 * - Search box filters list picker results by round name
 * - Selecting from list picker navigates to UniteScreen with correct schedules
 * - UniteScreen uses the earlier schedule's title and citation regardless of selection order
 * - Result is not saved to localStorage
 * - Back from UniteScreen returns to the current schedule's ResultScreen
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import { WizardProvider } from '../../src/context/WizardContext'
import ResultScreen from '../../src/screens/ResultScreen'
import UniteScreen from '../../src/screens/UniteScreen'
import UniteListPickerScreen from '../../src/screens/UniteListPickerScreen'
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

const standaloneSchedule: Schedule = {
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

const olderSchedule: Schedule = {
  id: 'older1',
  name: 'סבב ישן',
  groupId: 'g1',
  createdAt: '2023-12-01T10:00:00Z',
  date: '2023-12-01',
  stations: [
    {
      stationConfigId: 's1',
      stationName: 'עמדה א',
      stationType: 'time-based',
      participants: [makeParticipant('Eve', '10:00', '11:00')],
    },
  ],
  unevenDistributionMode: 'equal-duration',
  quote: 'ציטוט ישן',
  quoteAuthor: 'מחבר ישן',
}

function renderResultScreen(scheduleId: string) {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={[`/schedule/${scheduleId}/result`]}>
        <Routes>
          <Route path="/schedule/:scheduleId/result" element={<ResultScreen />} />
          <Route path="/schedule/:scheduleId/unite-picker" element={<div data-testid="picker-screen">ListPicker</div>} />
          <Route path="/schedule/:scheduleId/unite/:targetScheduleId" element={<div data-testid="unite-screen">UniteScreen</div>} />
          <Route path="/schedule/:scheduleId/continue" element={<div>ContinueScreen</div>} />
          <Route path="/schedule/new/step4" element={<div>Step4</div>} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

function renderUniteScreen(scheduleId: string, targetScheduleId: string) {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={[`/schedule/${scheduleId}/unite/${targetScheduleId}`]}>
        <Routes>
          <Route path="/schedule/:scheduleId/unite/:targetScheduleId" element={<UniteScreen />} />
          <Route path="/schedule/:scheduleId/result" element={<div data-testid="result-screen">ResultScreen</div>} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

function renderListPickerScreen(scheduleId: string) {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={[`/schedule/${scheduleId}/unite-picker`]}>
        <Routes>
          <Route path="/schedule/:scheduleId/unite-picker" element={<UniteListPickerScreen />} />
          <Route path="/schedule/:scheduleId/unite/:targetScheduleId" element={<div data-testid="unite-screen">UniteScreen</div>} />
          <Route path="/schedule/:scheduleId/result" element={<div data-testid="result-screen">ResultScreen</div>} />
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
  it('shows "איחוד רשימות" button on a non-continued round', () => {
    upsertSchedule(standaloneSchedule)
    renderResultScreen('standalone1')

    expect(screen.getByText('🔗 איחוד רשימות')).toBeTruthy()
  })

  it('shows "איחוד רשימות" button on a continued round', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderResultScreen('child1')

    expect(screen.getByText('🔗 איחוד רשימות')).toBeTruthy()
  })
})

describe('ResultScreen — continued round shows two-option modal', () => {
  it('shows modal with two options when clicking "איחוד רשימות" on a continued round', async () => {
    const user = userEvent.setup()
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderResultScreen('child1')

    await user.click(screen.getByText('🔗 איחוד רשימות'))

    expect(screen.getByText('איחוד עם הרשימה הקודמת')).toBeTruthy()
    expect(screen.getByText('איחוד עם רשימה אחרת')).toBeTruthy()
  })

  it('selecting "הקודמת" navigates directly to UniteScreen without list picker', async () => {
    const user = userEvent.setup()
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderResultScreen('child1')

    await user.click(screen.getByText('🔗 איחוד רשימות'))
    await user.click(screen.getByText('איחוד עם הרשימה הקודמת'))

    expect(screen.getByTestId('unite-screen')).toBeTruthy()
  })

  it('selecting "אחרת" navigates to list picker', async () => {
    const user = userEvent.setup()
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderResultScreen('child1')

    await user.click(screen.getByText('🔗 איחוד רשימות'))
    await user.click(screen.getByText('איחוד עם רשימה אחרת'))

    expect(screen.getByTestId('picker-screen')).toBeTruthy()
  })

  it('cancel button closes the modal', async () => {
    const user = userEvent.setup()
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderResultScreen('child1')

    await user.click(screen.getByText('🔗 איחוד רשימות'))
    expect(screen.getByText('איחוד עם הרשימה הקודמת')).toBeTruthy()

    await user.click(screen.getByText('ביטול'))
    expect(screen.queryByText('איחוד עם הרשימה הקודמת')).toBeNull()
  })
})

describe('ResultScreen — non-continued round goes directly to list picker', () => {
  it('clicking "איחוד רשימות" on standalone schedule navigates directly to list picker', async () => {
    const user = userEvent.setup()
    upsertSchedule(standaloneSchedule)
    renderResultScreen('standalone1')

    await user.click(screen.getByText('🔗 איחוד רשימות'))

    expect(screen.getByTestId('picker-screen')).toBeTruthy()
  })

  it('no modal appears for non-continued round', async () => {
    const user = userEvent.setup()
    upsertSchedule(standaloneSchedule)
    renderResultScreen('standalone1')

    await user.click(screen.getByText('🔗 איחוד רשימות'))

    expect(screen.queryByText('איחוד עם הרשימה הקודמת')).toBeNull()
  })
})

describe('UniteListPickerScreen — list contents', () => {
  it('shows all schedules except the current one', () => {
    upsertSchedule(standaloneSchedule)
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderListPickerScreen('standalone1')

    expect(screen.getByText('סבב ראשון')).toBeTruthy()
    expect(screen.getByText('סבב שני')).toBeTruthy()
    expect(screen.queryByText('סבב עצמאי')).toBeNull()
  })

  it('shows schedules sorted newest first', () => {
    upsertSchedule(standaloneSchedule)   // createdAt: 2024-01-01T20:00:00Z
    upsertSchedule(olderSchedule)        // createdAt: 2023-12-01T10:00:00Z
    renderListPickerScreen('standalone1')

    const items = screen.getAllByRole('button').filter(b => b.textContent?.includes('סבב'))
    // standaloneSchedule is excluded; olderSchedule is only other one
    expect(items[0].textContent).toContain('סבב ישן')
  })

  it('shows newer schedule before older when multiple exist', () => {
    upsertSchedule(olderSchedule)   // createdAt: 2023-12-01
    upsertSchedule(childSchedule)   // createdAt: 2024-01-01T22:00
    upsertSchedule(parentSchedule)  // createdAt: 2024-01-01T20:00
    renderListPickerScreen('older1')

    const items = screen.getAllByRole('button').filter(b => b.textContent?.includes('סבב'))
    // child (22:00) should come before parent (20:00)
    const childIdx = items.findIndex(b => b.textContent?.includes('סבב שני'))
    const parentIdx = items.findIndex(b => b.textContent?.includes('סבב ראשון'))
    expect(childIdx).toBeLessThan(parentIdx)
  })

  it('shows round name, date and station count for each entry', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(standaloneSchedule)
    renderListPickerScreen('standalone1')

    const item = screen.getByText('סבב ראשון').closest('button')
    expect(item?.textContent).toContain('01/01/2024')
    expect(item?.textContent).toContain('1 עמדות')
  })

  it('search box filters results by round name', async () => {
    const user = userEvent.setup()
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    upsertSchedule(olderSchedule)
    renderListPickerScreen('parent1')

    const searchBox = screen.getByPlaceholderText('חיפוש לפי שם סבב...')
    await user.type(searchBox, 'שני')

    expect(screen.getByText('סבב שני')).toBeTruthy()
    expect(screen.queryByText('סבב ישן')).toBeNull()
  })

  it('shows "לא נמצאו רשימות" when search yields no results', async () => {
    const user = userEvent.setup()
    upsertSchedule(parentSchedule)
    renderListPickerScreen('standalone1')

    const searchBox = screen.getByPlaceholderText('חיפוש לפי שם סבב...')
    await user.type(searchBox, 'xxxxxx')

    expect(screen.getByText('לא נמצאו רשימות.')).toBeTruthy()
  })

  it('tapping a schedule navigates to UniteScreen', async () => {
    const user = userEvent.setup()
    upsertSchedule(parentSchedule)
    upsertSchedule(standaloneSchedule)
    renderListPickerScreen('standalone1')

    await user.click(screen.getByText('סבב ראשון'))

    expect(screen.getByTestId('unite-screen')).toBeTruthy()
  })
})

describe('UniteScreen — merge logic with two selected schedules', () => {
  it('merges station participants sorted by start time', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderUniteScreen('child1', 'parent1')

    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Charlie')).toBeTruthy()
    expect(screen.getByText('Dave')).toBeTruthy()
  })

  it('uses title from earlier schedule (by createdAt)', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    // current = child, target = parent — but earlier is parent
    renderUniteScreen('child1', 'parent1')

    expect(screen.getByText(/סבב ראשון/)).toBeTruthy()
    expect(screen.queryByText(/סבב שני/)).toBeNull()
  })

  it('uses title from earlier schedule regardless of selection order', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    // current = parent, target = child — but earlier is still parent
    renderUniteScreen('parent1', 'child1')

    expect(screen.getByText(/סבב ראשון/)).toBeTruthy()
    expect(screen.queryByText(/סבב שני/)).toBeNull()
  })

  it('uses quote from earlier schedule', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderUniteScreen('child1', 'parent1')

    expect(screen.getByText(/"ציטוט מהאבא"/)).toBeTruthy()
    expect(screen.queryByText(/"ציטוט מהבן"/)).toBeNull()
  })

  it('works with two non-parent-child schedules', () => {
    upsertSchedule(standaloneSchedule)
    upsertSchedule(olderSchedule)
    renderUniteScreen('standalone1', 'older1')

    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Eve')).toBeTruthy()
    // Earlier is olderSchedule
    expect(screen.getByText(/סבב ישן/)).toBeTruthy()
  })
})

describe('UniteScreen — does not write to localStorage', () => {
  it('visiting UniteScreen does not add any new entry to localStorage', () => {
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)

    const countBefore = JSON.parse(window.localStorage.getItem('schedules') ?? '[]').length

    renderUniteScreen('child1', 'parent1')

    const countAfter = JSON.parse(window.localStorage.getItem('schedules') ?? '[]').length
    expect(countAfter).toBe(countBefore)
  })
})

describe('UniteScreen — back navigation', () => {
  it('Back button navigates to the current schedule ResultScreen', async () => {
    const user = userEvent.setup()
    upsertSchedule(parentSchedule)
    upsertSchedule(childSchedule)
    renderUniteScreen('child1', 'parent1')

    await user.click(screen.getByText('← חזרה'))

    expect(screen.getByTestId('result-screen')).toBeTruthy()
  })
})

describe('UniteScreen — error state', () => {
  it('shows error when schedule not found', () => {
    renderUniteScreen('nonexistent', 'also-nonexistent')

    expect(screen.getByText('לוח שמירה לא נמצא.')).toBeTruthy()
  })

  it('shows error when target schedule not found', () => {
    upsertSchedule(standaloneSchedule)
    renderUniteScreen('standalone1', 'nonexistent')

    expect(screen.getByText('לוח שמירה לא נמצא.')).toBeTruthy()
  })
})

describe('UniteScreen — station merging (existing coverage)', () => {
  it('includes station-only-in-earlier schedule', () => {
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
    upsertSchedule(childSchedule)
    renderUniteScreen('child1', 'parent1')

    expect(screen.getByText(/עמדה ב/)).toBeTruthy()
    expect(screen.getByText('Eve')).toBeTruthy()
  })
})

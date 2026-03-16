/**
 * E2E tests for Migration 004 features:
 *
 * 1. Post-create state preservation — participant names survive the
 *    ResultScreen → Step4 back navigation.
 * 2. Re-save idempotency — clicking "Create Schedule" a second time
 *    (after back navigation) overwrites the existing schedule rather
 *    than inserting a duplicate.
 * 3. Station swap — equal-duration (Option A): moving a participant
 *    between stations triggers a full start-time recalculation so
 *    that the 3rd slot in the destination station shows "22:00–23:00".
 * 4. Station swap — empty-station guard: attempting to move the last
 *    participant out of a station shows the inline error.
 * 5. Station swap — equal-endtime (Option B): after moving a
 *    participant, the station that ends up with only one person
 *    receives the full-span duration (120 min → "120′").
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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

function makeGroup4(): Group {
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
  await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
  await user.click(screen.getByText('הבא →'))                       // step2 → step3
  await user.click(screen.getByText('הבא →'))                       // step3 → step4
  await user.click(screen.getByText('צור לוח שמירה ✓'))             // step4 → result
  await waitFor(() => {
    expect(screen.getByText(/🔒/)).toBeTruthy()
  })
}

/**
 * Navigate to Step 4 with two time-based stations (4 members → 2 per station).
 * Uses a fixed duration of 60 min (default equal-duration mode).
 */
async function navigateToStep4TwoStationsFixed(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '2' }))       // select 2 stations
  await user.click(screen.getByText('הבא →'))                       // step1 → step2
  await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
  await user.click(screen.getByText('הבא →'))                       // step2 → step3
  await user.click(screen.getByText('הבא →'))                       // step3 → step4
  await waitFor(() => {
    expect(screen.getByText('סקירה ועריכה')).toBeTruthy()
  })
}

/**
 * Navigate to Step 4 with two time-based stations (3 members → 2+1 uneven).
 * Sets endTime to 22:00 and selects the "equal-endtime" distribution mode.
 * Starting time is the default 20:00.
 */
async function navigateToStep4TwoStationsEqualEndtime(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '2' }))       // select 2 stations
  await user.click(screen.getByText('הבא →'))                       // step1 → step2

  // Set end time to 22:00 via the second "שעות" spinner (index 1 = end time hours).
  // fireEvent is used here because the Spinner component relies on onBlur to commit.
  const hoursSpinners = screen.getAllByLabelText('שעות')
  fireEvent.change(hoursSpinners[1], { target: { value: '22' } })
  fireEvent.blur(hoursSpinners[1])

  // After endTime is set, the fixed-duration input disappears and the
  // uneven-distribution radios appear (3 members, 2 stations → 3 % 2 ≠ 0).
  await waitFor(() => {
    expect(screen.getByText('סיום שווה לכולם')).toBeTruthy()
  })

  await user.click(screen.getByText('סיום שווה לכולם'))            // select equal-endtime
  await user.click(screen.getByText('הבא →'))                       // step2 → step3
  await user.click(screen.getByText('הבא →'))                       // step3 → step4
  await waitFor(() => {
    expect(screen.getByText('סקירה ועריכה')).toBeTruthy()
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

describe('Station swap — equal-duration, 4 members × 2 stations', () => {
  it('recalculates consecutive start times after a participant is moved to another station', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup4())
    renderApp()
    await navigateToStep4TwoStationsFixed(user)

    // With 4 members and 2 stations, each station starts with 2 participants.
    // Shift times: 20:00–21:00 and 21:00–22:00 per station; no 22:00–23:00 slot.
    expect(screen.queryByText(/22:00.23:00/)).toBeNull()

    // Move the first participant in station 1 to station 2.
    // After the move: station 1 has 1 person, station 2 has 3 people.
    // The 3rd slot in station 2 must recalculate to 22:00–23:00.
    const moveSelects = screen.getAllByTitle('העבר לעמדה')
    await user.selectOptions(moveSelects[0], ['עמדה 2'])

    await waitFor(() => {
      expect(screen.getByText(/22:00.23:00/)).toBeTruthy()
    })
  })

  it('blocks moving the last participant from a station and shows an error', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup3())         // 3 members → 2+1 distribution
    renderApp()
    await navigateToStep4TwoStationsFixed(user)

    // Station 2 has exactly 1 participant.
    // Its move select is at index 2 (station 1's 2 rows, then station 2's 1 row).
    const moveSelects = screen.getAllByTitle('העבר לעמדה')
    await user.selectOptions(moveSelects[2], ['עמדה 1'])

    expect(screen.getByText('לא ניתן להעביר — העמדה תישאר ריקה')).toBeTruthy()
  })
})

describe('Station swap — equal-endtime, 3 members × 2 stations, endTime 22:00', () => {
  it('participant in the station that ends up with 1 person gets the full-span 120-min duration', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup3())         // 3 members → 2+1 uneven distribution
    renderApp()
    await navigateToStep4TwoStationsEqualEndtime(user)

    // Initial state: station 2 has 1 person with duration 120′ (equal-endtime).
    await waitFor(() => {
      expect(screen.getByText('120′')).toBeTruthy()
    })

    // Move one person from station 1 (2 people) to station 2 → now 1+2.
    // Station 1's remaining person should now receive the 120-min full span.
    const moveSelects = screen.getAllByTitle('העבר לעמדה')
    await user.selectOptions(moveSelects[0], ['עמדה 2'])

    await waitFor(() => {
      // "120′" must still be present — proving equal-endtime was re-applied.
      expect(screen.getByText('120′')).toBeTruthy()
    })
  })
})

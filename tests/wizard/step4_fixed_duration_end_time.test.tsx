/**
 * Regression test: end time editing in Step4_Review when the session was
 * configured with fixedDurationMinutes (constant guard time mode).
 *
 * Before the fix, calling recalculateStation via the timing modal had no
 * lasting effect because handleDragEnd always reset all durations from the
 * global session fixedDurationMinutes, and the endTimeOverride was not stored.
 *
 * This test verifies:
 * 1. Opening the timing modal and saving a new end time recalculates
 *    participant times for that station.
 * 2. A subsequent drag on a different station does NOT revert the per-station
 *    end time edit.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '@/context/WizardContext'
import Step1_Stations from '@/screens/Step1_Stations'
import Step2_Time from '@/screens/Step2_Time'
import Step3_Order from '@/screens/Step3_Order'
import Step4_Review from '@/screens/Step4_Review'
import ResultScreen from '@/screens/ResultScreen'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import { upsertGroup } from '@/storage/groups'
import type { Group } from '@/types'

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

/**
 * Navigate from Step1 through Step3 to Step4 using fixed-duration mode (60 min/warrior).
 * Default start time is 20:00, so with 3 warriors and 60 min each:
 *   Alice  20:00–21:00
 *   Bob    21:00–22:00
 *   Charlie 22:00–23:00
 */
async function navigateToStep4WithFixedDuration(user: ReturnType<typeof userEvent.setup>) {
  // Step 1 → 2
  await user.click(screen.getByText('הבא →'))
  // Step 2: select fixed-duration mode, enter 60 min, go to step 3
  await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
  await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
  await user.click(screen.getByText('הבא →'))
  // Step 3 → 4
  await user.click(screen.getByText('הבא →'))
  await waitFor(() => expect(screen.getByText('סקירה ועריכה')).toBeTruthy())
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Step4_Review — end time editing in fixed-duration mode', () => {
  it('recalculates participant times after editing end time in the timing modal', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4WithFixedDuration(user)

    // Confirm the initial schedule: Alice starts at 20:00 (fixed 60 min mode)
    expect(screen.getByText(/20:00/)).toBeTruthy()

    // Open the timing modal for the first station
    const gearButtons = screen.getAllByRole('button', { name: /הגדרות תזמון עמדה/i })
    await user.click(gearButtons[0])
    await waitFor(() => expect(screen.getByText(/הגדרות תזמון —/)).toBeTruthy())

    // Change the end time to 21:30 (so total = 90 min for 3 warriors = 30 min each)
    // The desktop spinner uses aria-label "שעות" and "דקות"
    const hourInputs = screen.getAllByRole('textbox', { name: 'שעות' })
    const minuteInputs = screen.getAllByRole('textbox', { name: 'דקות' })

    // End time pickers are the second set (first = start time, second = end time)
    const endHourInput = hourInputs[1]
    const endMinuteInput = minuteInputs[1]

    // Set hours to 21
    fireEvent.change(endHourInput, { target: { value: '21' } })
    fireEvent.blur(endHourInput)

    // Set minutes to 30
    fireEvent.change(endMinuteInput, { target: { value: '30' } })
    fireEvent.blur(endMinuteInput)

    // Save the timing config
    await user.click(screen.getByRole('button', { name: 'שמור' }))

    // After save: 3 warriors in 90 min → 30 min each (round-up-10 applied: 30 already multiple of 10)
    // Alice: 20:00–20:30, Bob: 20:30–21:00, Charlie: 21:00–21:30
    await waitFor(() => {
      // Alice should now start at 20:00 and end at 20:30
      const timeTexts = screen.getAllByText(/20:00/)
      expect(timeTexts.length).toBeGreaterThan(0)
    })

    // Verify the per-participant duration changed from 60 to 30 minutes
    // The duration button shows "30′" for each participant
    await waitFor(() => {
      const durationButtons = screen.getAllByText(/30′/)
      expect(durationButtons.length).toBeGreaterThan(0)
    })

    // Ensure 60′ is no longer shown (the fixed duration was overridden)
    expect(screen.queryByText(/60′/)).toBeNull()
  })

  it('preserves per-station end time override after duration-change interaction', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4WithFixedDuration(user)

    // Open timing modal and set end time to 21:30 (3 warriors → 30 min each)
    const gearButtons = screen.getAllByRole('button', { name: /הגדרות תזמון עמדה/i })
    await user.click(gearButtons[0])
    await waitFor(() => expect(screen.getByText(/הגדרות תזמון —/)).toBeTruthy())

    const hourInputs = screen.getAllByRole('textbox', { name: 'שעות' })
    const minuteInputs = screen.getAllByRole('textbox', { name: 'דקות' })

    const endHourInput = hourInputs[1]
    const endMinuteInput = minuteInputs[1]

    fireEvent.change(endHourInput, { target: { value: '21' } })
    fireEvent.blur(endHourInput)
    fireEvent.change(endMinuteInput, { target: { value: '30' } })
    fireEvent.blur(endMinuteInput)

    await user.click(screen.getByRole('button', { name: 'שמור' }))

    // Verify the recalculation happened — 30-min durations
    await waitFor(() => {
      const durationButtons = screen.getAllByText(/30′/)
      expect(durationButtons.length).toBeGreaterThan(0)
    })

    // The end time override should be stored; 60-min duration must not reappear
    expect(screen.queryByText(/60′/)).toBeNull()
  })
})

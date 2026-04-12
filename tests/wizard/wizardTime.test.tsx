/**
 * E2E tests for Step2_Time — validation, duration preview, rounding selection.
 * Navigates through Step1 first to establish a valid wizard session.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '@/context/WizardContext'
import Step1_Stations from '@/screens/Step1_Stations'
import Step2_Time from '@/screens/Step2_Time'
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
          <Route path="/schedule/new/step3" element={<div>שלב 3</div>} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

async function navigateToStep2(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('הבא →'))
  // Now at Step2
  expect(screen.getByText('הגדרת זמנים')).toBeTruthy()
}

async function switchToFixedDurationMode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Step2_Time — step indicator', () => {
  it('shows step 2 of 4 indicator', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    expect(screen.getByText('שלב 2 מתוך 4')).toBeTruthy()
  })
})

describe('Step2_Time — validation', () => {
  it('shows error when end time not set in end-time mode', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    // Default mode is 'end-time'; click Next without setting end time
    await user.click(screen.getByText('הבא →'))

    expect(screen.getByText('יש להזין שעת סיום')).toBeTruthy()
  })

  it('shows error when fixed duration not set in fixed-duration mode', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    await switchToFixedDurationMode(user)
    await user.click(screen.getByText('הבא →'))

    expect(screen.getByText('יש להזין משך קבוע')).toBeTruthy()
  })

  it('shows error when fixed duration is zero', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    await switchToFixedDurationMode(user)
    const durationInput = screen.getByPlaceholderText('למשל: 90')
    await user.clear(durationInput)
    await user.type(durationInput, '0')
    await user.click(screen.getByText('הבא →'))

    expect(screen.getByText('משך חייב להיות מספר חיובי')).toBeTruthy()
  })
})

describe('Step2_Time — duration preview', () => {
  it('shows preview with correct participant count after entering fixed duration', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup()) // 3 base members
    renderApp()
    await navigateToStep2(user)

    await switchToFixedDurationMode(user)
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')

    // Preview should show "× 3 שומרים"
    expect(screen.getByText(/3 שומרים/)).toBeTruthy()
  })

  it('shows "1 ש\'" in preview for 60-minute fixed duration', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    await switchToFixedDurationMode(user)
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')

    // 60 minutes = 1 hour → displayed as "1 ש'"
    expect(screen.getByText("1 ש'")).toBeTruthy()
  })
})

describe('Step2_Time — rounding algorithm', () => {
  it('round-up-5 option can be selected via dropdown', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    const select = screen.getByRole('combobox') as HTMLSelectElement
    await userEvent.selectOptions(select, 'round-up-5')

    expect(select.value).toBe('round-up-5')
  })
})

describe('Step2_Time — navigation', () => {
  it('clicking Next with valid fixed duration navigates to step3', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    await switchToFixedDurationMode(user)
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
    await user.click(screen.getByText('הבא →'))

    expect(screen.getByText('שלב 3')).toBeTruthy()
  })

  it('back button returns to step1', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    await user.click(screen.getByText('← חזרה'))

    expect(screen.getByText('הגדרת עמדות')).toBeTruthy()
  })
})

describe('Step2_Time — time mode toggle', () => {
  it('switching from end-time to fixed-duration mode shows the fixed duration input', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    // By default the fixed duration input should NOT be visible
    expect(screen.queryByPlaceholderText('למשל: 90')).toBeNull()

    await switchToFixedDurationMode(user)

    // Now it should be visible
    expect(screen.getByPlaceholderText('למשל: 90')).toBeTruthy()
  })

  it('switching from end-time to fixed-duration clears end time but preserves start time', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    // Start time is 20:00 by default. Switch to fixed-duration mode.
    await switchToFixedDurationMode(user)
    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
    await user.click(screen.getByText('הבא →'))

    // Navigate to step3 — start time must have been preserved
    expect(screen.getByText('שלב 3')).toBeTruthy()
  })

  it('switching back from fixed-duration to end-time hides fixed duration and shows end time input', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    await switchToFixedDurationMode(user)
    expect(screen.getByPlaceholderText('למשל: 90')).toBeTruthy()

    // Switch back to end-time mode
    await user.click(screen.getByRole('button', { name: 'שעת סיום' }))

    // Fixed duration input should be gone
    expect(screen.queryByPlaceholderText('למשל: 90')).toBeNull()
  })

  it('switching to end-time mode and clicking Next without end time shows error', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    // Already in end-time mode; click Next without entering end time
    await user.click(screen.getByText('הבא →'))
    expect(screen.getByText('יש להזין שעת סיום')).toBeTruthy()
  })
})

describe('TimePicker — desktop spinner zero-padding', () => {
  it('zero-pads single-digit hours on blur', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    // Find the hours spinner for the start time (aria-label="שעות")
    const hourInputs = screen.getAllByRole('textbox', { name: 'שעות' })
    const startHourInput = hourInputs[0]

    // click triggers onFocus which selects all; then type replaces the selection
    await user.click(startHourInput)
    await user.clear(startHourInput)
    await user.type(startHourInput, '9')
    await user.tab()

    // After blur the spinner should show "09"
    expect((startHourInput as HTMLInputElement).value).toBe('09')
  })

  it('zero-pads single-digit minutes on blur', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    const minuteInputs = screen.getAllByRole('textbox', { name: 'דקות' })
    const startMinuteInput = minuteInputs[0]

    await user.click(startMinuteInput)
    await user.clear(startMinuteInput)
    await user.type(startMinuteInput, '5')
    await user.tab()

    expect((startMinuteInput as HTMLInputElement).value).toBe('05')
  })
})

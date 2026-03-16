/**
 * E2E tests for Step2_Time — validation, duration preview, rounding selection.
 * Navigates through Step1 first to establish a valid wizard session.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '../../src/context/WizardContext'
import Step1_Stations from '../../src/screens/Step1_Stations'
import Step2_Time from '../../src/screens/Step2_Time'
import { createLocalStorageMock } from '../../src/tests/localStorageMock'
import { upsertGroup } from '../../src/storage/groups'
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
  it('shows error when neither end time nor fixed duration set', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    // Click Next without setting any time config (endTime spinner shows "00:00"
    // but state is still '' — just click next without interacting with spinners)
    await user.click(screen.getByText('הבא →'))

    expect(screen.getByText('יש להזין שעת סיום או משך קבוע')).toBeTruthy()
  })

  it('shows error when fixed duration is zero', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

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

    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')

    // Preview should show "× 3 שומרים"
    expect(screen.getByText(/3 שומרים/)).toBeTruthy()
  })

  it('shows "1 ש\'" in preview for 60-minute fixed duration', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    await user.type(screen.getByPlaceholderText('למשל: 90'), '60')

    // 60 minutes = 1 hour → displayed as "1 ש'"
    expect(screen.getByText("1 ש'")).toBeTruthy()
  })
})

describe('Step2_Time — rounding algorithm', () => {
  it('round-up-5 radio can be selected', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

    await user.click(screen.getByLabelText('עיגול למעלה ל-5 דקות'))

    const radio = screen.getByLabelText('עיגול למעלה ל-5 דקות') as HTMLInputElement
    expect(radio.checked).toBe(true)
  })
})

describe('Step2_Time — navigation', () => {
  it('clicking Next with valid fixed duration navigates to step3', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep2(user)

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

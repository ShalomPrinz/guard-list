/**
 * E2E tests for Step3_Order — participant distribution, lock/skip/remove.
 * Navigates through Step1 and Step2 first to establish session state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '../../src/context/WizardContext'
import Step1_Stations from '../../src/screens/Step1_Stations'
import Step2_Time from '../../src/screens/Step2_Time'
import Step3_Order from '../../src/screens/Step3_Order'
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
          <Route path="/schedule/new/step3" element={<Step3_Order />} />
          <Route path="/schedule/new/step4" element={<div>שלב 4</div>} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

async function navigateToStep3(user: ReturnType<typeof userEvent.setup>) {
  // Step 1 → Step 2
  await user.click(screen.getByText('הבא →'))
  expect(screen.getByText('הגדרת זמנים')).toBeTruthy()

  // Step 2 → Step 3: select fixed-duration mode, enter duration
  await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
  await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
  await user.click(screen.getByText('הבא →'))
  expect(screen.getByText('סדר שומרים')).toBeTruthy()
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Step3_Order — participant distribution', () => {
  it('distributes all base members to the time-based station', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Charlie')).toBeTruthy()
  })

  it('shows step 3 of 4 indicator', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    expect(screen.getByText('שלב 3 מתוך 4')).toBeTruthy()
  })
})

describe('Step3_Order — lock toggle', () => {
  it('locks a participant by clicking the lock button', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    // Each participant row has a lock/unlock button
    const lockButtons = screen.getAllByText('🔓')
    await user.click(lockButtons[0])

    // Should now show a locked icon for that participant
    expect(screen.getAllByText('🔒').length).toBeGreaterThanOrEqual(1)
  })
})

describe('Step3_Order — skip toggle', () => {
  it('marks a participant as skipped', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    const skipButtons = screen.getAllByText('דלג')
    await user.click(skipButtons[0])

    expect(screen.getAllByText('מדולג').length).toBeGreaterThanOrEqual(1)
  })

  it('can re-include a skipped participant', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    const skipButtons = screen.getAllByText('דלג')
    await user.click(skipButtons[0])
    // Now click "מדולג" to re-include
    await user.click(screen.getAllByText('מדולג')[0])

    // Should be back to "דלג" with 3 buttons
    expect(screen.getAllByText('דלג').length).toBe(3)
  })
})

describe('Step3_Order — remove participant', () => {
  it('removes a participant from the station', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    // Count participants before remove
    expect(screen.getAllByText('דלג').length).toBe(3)

    const removeButtons = screen.getAllByLabelText('הסר')
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect(screen.getAllByText('דלג').length).toBe(2)
    })
  })
})

describe('Step3_Order — shuffle', () => {
  it('shuffle button does not remove participants', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    await user.click(screen.getByText('ערבב'))

    // All participants should still be present
    expect(screen.getAllByText('דלג').length).toBe(3)
  })
})

describe('Step3_Order — navigation', () => {
  it('Next button navigates to step4', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    await user.click(screen.getByText('הבא →'))
    expect(screen.getByText('שלב 4')).toBeTruthy()
  })

  it('back button returns to step2', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    await user.click(screen.getByText('← חזרה'))
    expect(screen.getByText('הגדרת זמנים')).toBeTruthy()
  })
})

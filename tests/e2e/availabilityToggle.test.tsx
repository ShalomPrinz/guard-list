/**
 * E2E tests for availability toggle in Step3_Order and StandbyScreen.
 * All tests use an in-memory localStorage mock; no real DOM storage is touched.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '../../src/context/WizardContext'
import Step1_Stations from '../../src/screens/Step1_Stations'
import Step2_Time from '../../src/screens/Step2_Time'
import Step3_Order from '../../src/screens/Step3_Order'
import StandbyScreen from '../../src/screens/StandbyScreen'
import { createLocalStorageMock } from '../../src/tests/localStorageMock'
import { upsertGroup, getGroups } from '../../src/storage/groups'
import type { Group } from '../../src/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'מחלקה א',
    members: [
      { id: 'm1', name: 'Alice', availability: 'base' },
      { id: 'm2', name: 'Bob', availability: 'base' },
      { id: 'm3', name: 'Charlie', availability: 'home' },
    ],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function renderWizard() {
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

function renderStandby() {
  return render(
    <MemoryRouter initialEntries={['/standby']}>
      <Routes>
        <Route path="/" element={<div>בית</div>} />
        <Route path="/standby" element={<StandbyScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function navigateToStep3(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('הבא →'))
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

// ─── Step3_Order availability toggle ──────────────────────────────────────────

describe('Step3_Order — availability toggle (Base → Home in station)', () => {
  it('toggling Base → Home in station list moves warrior to לא משובצים', async () => {
    const user = userEvent.setup()
    // Group with one station to ensure Alice is assigned
    upsertGroup(makeGroup({ members: [{ id: 'm1', name: 'Alice', availability: 'base' }] }))
    renderWizard()
    await navigateToStep3(user)

    // Alice should be in the station (not in unassigned)
    expect(screen.getByText('סדר שומרים')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()

    // Find the availability toggle button for Alice (shows 'בסיס')
    // There may be multiple — find the one in the station section
    const baseButtons = screen.getAllByText('בסיס')
    expect(baseButtons.length).toBeGreaterThan(0)

    // Click the first 'בסיס' toggle (Alice's toggle in the station)
    await user.click(baseButtons[0])

    // Alice should now be in לא משובצים with 'בית' status
    await waitFor(() => {
      expect(screen.getByText('בית')).toBeTruthy()
    })
  })

  it('does not modify the saved group in localStorage when toggling in station', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({ members: [{ id: 'm1', name: 'Alice', availability: 'base' }] }))
    renderWizard()
    await navigateToStep3(user)

    const baseButtons = screen.getAllByText('בסיס')
    await user.click(baseButtons[0])

    // Group in localStorage should be unchanged
    const savedGroup = getGroups()[0]
    const alice = savedGroup.members.find(m => m.name === 'Alice')
    expect(alice?.availability).toBe('base')
  })
})

describe('Step3_Order — availability toggle (Home → Base in לא משובצים)', () => {
  it('toggling Home → Base in לא משובצים keeps warrior in unassigned with updated status', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({
      members: [
        { id: 'm1', name: 'Alice', availability: 'base' },
        { id: 'm2', name: 'Bob', availability: 'home' },
      ],
    }))
    renderWizard()
    await navigateToStep3(user)

    // Bob is home — appears in לא משובצים with 'בית' toggle
    expect(screen.getByText('Bob')).toBeTruthy()
    const homeButton = screen.getByText('בית')
    await user.click(homeButton)

    // Bob stays in לא משובצים but now shows 'בסיס'
    await waitFor(() => {
      expect(screen.getAllByText('בסיס').length).toBeGreaterThan(0)
    })
    // Bob should still be visible (not moved to a station)
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('does not modify the saved group when toggling in לא משובצים', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({
      members: [
        { id: 'm1', name: 'Alice', availability: 'base' },
        { id: 'm2', name: 'Bob', availability: 'home' },
      ],
    }))
    renderWizard()
    await navigateToStep3(user)

    const homeButton = screen.getByText('בית')
    await user.click(homeButton)

    const savedGroup = getGroups()[0]
    const bob = savedGroup.members.find(m => m.name === 'Bob')
    expect(bob?.availability).toBe('home')
  })
})

describe('Step3_Order — availability toggle (Base → Home in לא משובצים)', () => {
  it('toggling Base → Home in לא משובצים keeps warrior in unassigned with home status', async () => {
    const user = userEvent.setup()
    // Alice is base and gets assigned to station. Move her to unassigned via toggle.
    upsertGroup(makeGroup({ members: [{ id: 'm1', name: 'Alice', availability: 'base' }] }))
    renderWizard()
    await navigateToStep3(user)

    // Toggle Alice to home (moves her to unassigned)
    const baseButtons = screen.getAllByText('בסיס')
    await user.click(baseButtons[0])

    // Now Alice is in unassigned with 'בית' status — she stays there
    await waitFor(() => {
      expect(screen.getByText('בית')).toBeTruthy()
    })
    expect(screen.getByText('Alice')).toBeTruthy()
  })
})

// ─── StandbyScreen availability toggle ────────────────────────────────────────

describe('StandbyScreen — availability toggle (Base → Home)', () => {
  it('toggling Base → Home deselects and disables the warrior checkbox', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({
      members: [
        { id: 'm1', name: 'Alice', availability: 'base' },
        { id: 'm2', name: 'Bob', availability: 'base' },
      ],
    }))
    renderStandby()

    // Alice checkbox should be checked initially
    const aliceCheckbox = screen.getByRole('checkbox', { name: 'Alice' })
    expect((aliceCheckbox as HTMLInputElement).checked).toBe(true)

    // Find Alice's 'בסיס' toggle — click it
    const baseButtons = screen.getAllByText('בסיס')
    await user.click(baseButtons[0])

    // Alice should no longer have a checkbox (or it should be disabled/unchecked)
    await waitFor(() => {
      // After toggling to home, the checkbox is removed (home members have no checkbox)
      const aliceCheckboxAfter = screen.queryByRole('checkbox', { name: 'Alice' })
      expect(aliceCheckboxAfter).toBeNull()
    })
  })

  it('toggling Home → Base in StandbyScreen re-enables the checkbox unchecked', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({
      members: [
        { id: 'm1', name: 'Alice', availability: 'home' },
        { id: 'm2', name: 'Bob', availability: 'base' },
      ],
    }))
    renderStandby()

    // Alice starts as home — no checkbox
    expect(screen.queryByRole('checkbox', { name: 'Alice' })).toBeNull()

    // Find Alice's 'בית' toggle
    const homeButton = screen.getByText('בית')
    await user.click(homeButton)

    // Alice should now have an unchecked checkbox
    await waitFor(() => {
      const aliceCheckbox = screen.getByRole('checkbox', { name: 'Alice' })
      expect((aliceCheckbox as HTMLInputElement).checked).toBe(false)
    })
  })

  it('does not modify the saved group in localStorage when toggling in StandbyScreen', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({
      members: [{ id: 'm1', name: 'Alice', availability: 'base' }],
    }))
    renderStandby()

    const baseButton = screen.getByText('בסיס')
    await user.click(baseButton)

    // localStorage group should be unchanged
    const savedGroup = getGroups()[0]
    const alice = savedGroup.members.find(m => m.name === 'Alice')
    expect(alice?.availability).toBe('base')
  })
})

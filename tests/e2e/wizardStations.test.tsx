/**
 * E2E tests for Step1_Stations — group selection, station setup, validation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '../../src/context/WizardContext'
import Step1_Stations from '../../src/screens/Step1_Stations'
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

function renderApp(initialPath = '/schedule/new/step1') {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<div>דף הבית</div>} />
          <Route path="/schedule/new/step1" element={<Step1_Stations />} />
          <Route path="/schedule/new/step2" element={<div>שלב 2</div>} />
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

describe('Step1_Stations — no groups', () => {
  it('shows message and back button when no groups exist', () => {
    renderApp()
    expect(screen.getByText('אין קבוצות שמורות. צור קבוצה לפני יצירת לוח שמירה.')).toBeTruthy()
    expect(screen.getByText('→ חזרה לדף הבית')).toBeTruthy()
  })

  it('back button navigates to home when no groups', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByText('→ חזרה לדף הבית'))
    expect(screen.getByText('דף הבית')).toBeTruthy()
  })
})

describe('Step1_Stations — with groups', () => {
  it('shows the group name when one group exists', () => {
    upsertGroup(makeGroup())
    renderApp()
    expect(screen.getByText(/מחלקה א/)).toBeTruthy()
  })

  it('shows error when group has all-home members', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup({
      members: [
        { id: 'm1', name: 'Alice', availability: 'home' },
        { id: 'm2', name: 'Bob', availability: 'home' },
      ],
    }))
    renderApp()

    await user.click(screen.getByText('הבא →'))
    expect(screen.getByText(/כל חברי הקבוצה מסומנים כ"בית"/)).toBeTruthy()
  })

  it('clicking Next with valid group navigates to step2', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()

    await user.click(screen.getByText('הבא →'))
    expect(screen.getByText('שלב 2')).toBeTruthy()
  })

  it('back button navigates to home screen', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()

    await user.click(screen.getByText('← חזרה'))
    expect(screen.getByText('דף הבית')).toBeTruthy()
  })
})

describe('Step1_Stations — station count', () => {
  it('clicking station count button 2 shows two station cards', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()

    await user.click(screen.getByRole('button', { name: '2' }))

    expect(screen.getByText('עמדה 1')).toBeTruthy()
    expect(screen.getByText('עמדה 2')).toBeTruthy()
  })

  it('clicking station count button 1 shows one station card', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()

    // First set 2 stations, then back to 1
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: '1' }))

    expect(screen.getByText('עמדה 1')).toBeTruthy()
    expect(screen.queryByText('עמדה 2')).toBeNull()
  })
})

describe('Step1_Stations — custom count', () => {
  it('clicking "אחר.." shows a custom number input', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()

    await user.click(screen.getByRole('button', { name: 'אחר..' }))

    expect(screen.getByPlaceholderText('מספר עמדות')).toBeTruthy()
  })

  it('entering a custom count greater than 4 shows that many station cards', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()

    await user.click(screen.getByRole('button', { name: 'אחר..' }))
    const input = screen.getByPlaceholderText('מספר עמדות')
    await user.clear(input)
    await user.type(input, '5')

    expect(screen.getByText('עמדה 5')).toBeTruthy()
  })
})

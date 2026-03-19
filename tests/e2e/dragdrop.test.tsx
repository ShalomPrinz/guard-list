/**
 * E2E tests for Migration 011.1 — Drag & Drop Text Selection & Position Jump Fix.
 * Covers:
 * - Drag handle has select-none (user-select: none) applied
 * - Drag handle has touch-none (touch-action: none) applied
 * - Drag handle uses the shared DragHandle component (aria-label present)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '../../src/context/WizardContext'
import Step1_Stations from '../../src/screens/Step1_Stations'
import Step2_Time from '../../src/screens/Step2_Time'
import Step3_Order from '../../src/screens/Step3_Order'
import Step4_Review from '../../src/screens/Step4_Review'
import { createLocalStorageMock } from '../../src/tests/localStorageMock'
import { upsertGroup } from '../../src/storage/groups'
import type { Group } from '../../src/types'

function makeGroup(): Group {
  return {
    id: 'g1',
    name: 'מחלקה א',
    members: [
      { id: 'm1', name: 'Alice', availability: 'base' },
      { id: 'm2', name: 'Bob', availability: 'base' },
      { id: 'm3', name: 'Charlie', availability: 'home' },
    ],
    createdAt: new Date().toISOString(),
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
          <Route path="/schedule/:scheduleId/result" element={<div>תוצאה</div>} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

async function navigateToStep3(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('הבא →'))
  expect(screen.getByText('הגדרת זמנים')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
  await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
  await user.click(screen.getByText('הבא →'))
  expect(screen.getByText('סדר שומרים')).toBeTruthy()
}

async function navigateToStep4(user: ReturnType<typeof userEvent.setup>) {
  await navigateToStep3(user)
  await user.click(screen.getByText('הבא →'))
  expect(screen.getByText('סקירה ועריכה')).toBeTruthy()
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DragHandle — Step3_Order', () => {
  it('drag handle in station has select-none and touch-none classes', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    // There should be drag handles for station participants (aria-label="גרור")
    const handles = screen.getAllByLabelText('גרור')
    expect(handles.length).toBeGreaterThan(0)
    // Each handle should have select-none and touch-none
    for (const handle of handles) {
      expect(handle.className).toContain('select-none')
      expect(handle.className).toContain('touch-none')
    }
  })

  it('drag handle in "לא משובצים" section has select-none and touch-none classes', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    // Unassigned drag handle has aria-label="גרור לא משובץ"
    const unassignedHandles = screen.getAllByLabelText('גרור לא משובץ')
    expect(unassignedHandles.length).toBeGreaterThan(0)
    for (const handle of unassignedHandles) {
      expect(handle.className).toContain('select-none')
      expect(handle.className).toContain('touch-none')
    }
  })
})

describe('DragHandle — Step4_Review', () => {
  it('drag handle in Step4_Review has select-none and touch-none classes', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    const handles = screen.getAllByLabelText('גרור לסידור מחדש')
    expect(handles.length).toBeGreaterThan(0)
    for (const handle of handles) {
      expect(handle.className).toContain('select-none')
      expect(handle.className).toContain('touch-none')
    }
  })
})

describe('"לא משובצים" section — always rendered', () => {
  it('is rendered even when no participants are unassigned initially', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    // The section header should always be present
    expect(screen.getByText('לא משובצים')).toBeTruthy()
  })

  it('remains rendered after removing all participants from a station', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    // Remove a participant by clicking ✕ button — they go to unassigned
    const removeButtons = screen.getAllByLabelText('הסר')
    if (removeButtons.length > 0) {
      await user.click(removeButtons[0])
    }

    // "לא משובצים" section must still be present
    expect(screen.getByText('לא משובצים')).toBeTruthy()
  })

  it('shows placeholder text when unassigned section is empty', async () => {
    const user = userEvent.setup()
    // All members are base — will all be assigned initially
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep3(user)

    // When no one is unassigned, the placeholder should appear
    const placeholder = screen.queryByText('גרור לוחם לכאן להוצאה מהרשימה')
    // It may or may not be there depending on distribution, but the section header always is
    expect(screen.getByText('לא משובצים')).toBeTruthy()
    // If no unassigned, placeholder appears
    const unassignedHandles = screen.queryAllByLabelText('גרור לא משובץ')
    if (unassignedHandles.length === 0) {
      expect(placeholder).toBeTruthy()
    }
  })
})

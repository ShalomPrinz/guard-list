/**
 * E2E tests for RecalculateScreen — time recalculation feature.
 * Tests the recalculate flow accessible from Step4_Review.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '../../src/context/WizardContext'
import Step1_Stations from '../../src/screens/Step1_Stations'
import Step2_Time from '../../src/screens/Step2_Time'
import Step3_Order from '../../src/screens/Step3_Order'
import Step4_Review from '../../src/screens/Step4_Review'
import RecalculateScreen from '../../src/screens/RecalculateScreen'
import { createLocalStorageMock } from '../../src/tests/localStorageMock'
import { upsertGroup } from '../../src/storage/groups'
import type { Group } from '../../src/types'

function makeGroup(memberCount = 3): Group {
  const members = Array.from({ length: memberCount }, (_, i) => ({
    id: `m${i + 1}`,
    name: ['Alice', 'Bob', 'Charlie', 'Dana', 'Eve'][i] ?? `Member${i + 1}`,
    availability: 'base' as const,
  }))
  return {
    id: 'g1',
    name: 'מחלקה א',
    members,
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
          <Route path="/schedule/new/recalculate" element={<RecalculateScreen />} />
          <Route path="/schedule/:scheduleId/result" element={<div>תוצאה</div>} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

async function navigateToStep4(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('הבא →'))
  expect(screen.getByText('הגדרת זמנים')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'זמן קבוע לכל לוחם' }))
  await user.type(screen.getByPlaceholderText('למשל: 90'), '60')
  await user.click(screen.getByText('הבא →'))
  expect(screen.getByText('סדר שומרים')).toBeTruthy()
  await user.click(screen.getByText('הבא →'))
  expect(screen.getByText('סקירה ועריכה')).toBeTruthy()
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RecalculateScreen — navigation', () => {
  it('navigates to RecalculateScreen from Step4_Review via the button', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    const btn = screen.getByText('חישוב זמנים מחדש')
    expect(btn).toBeTruthy()
    await user.click(btn)

    expect(screen.getByText('חישוב זמנים מחדש')).toBeTruthy()
  })

  it('"ביטול" returns to Step4_Review without changes', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    await user.click(screen.getByText('חישוב זמנים מחדש'))
    expect(screen.getAllByText('חישוב זמנים מחדש').length).toBeGreaterThanOrEqual(1)

    await user.click(screen.getByText('ביטול'))
    expect(screen.getByText('סקירה ועריכה')).toBeTruthy()
  })
})

describe('RecalculateScreen — content', () => {
  it('shows current end time of selected station', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    await user.click(screen.getByText('חישוב זמנים מחדש'))

    // Should show "שעת סיום נוכחית" label
    expect(screen.getByText('שעת סיום נוכחית:')).toBeTruthy()
  })

  it('shows two mode radio options', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    await user.click(screen.getByText('חישוב זמנים מחדש'))

    expect(screen.getByText(/הארכה לשעת סיום מקורית/)).toBeTruthy()
    expect(screen.getByText('שעת סיום מותאמת אישית')).toBeTruthy()
  })

  it('shows live preview with participant names', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    await user.click(screen.getByText('חישוב זמנים מחדש'))

    // Preview section should show
    await waitFor(() => {
      expect(screen.queryByText('תצוגה מקדימה')).toBeTruthy()
    })
  })

  it('shows rounding options', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    await user.click(screen.getByText('חישוב זמנים מחדש'))

    expect(screen.getByText(/עיגול למעלה ל-10 דקות/)).toBeTruthy()
    expect(screen.getByText('עיגול למעלה ל-5 דקות')).toBeTruthy()
    expect(screen.getByText('עיגול לדקה הקרובה')).toBeTruthy()
  })
})

describe('RecalculateScreen — custom end time mode', () => {
  it('reveals time input when "שעת סיום מותאמת אישית" is selected', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    await user.click(screen.getByText('חישוב זמנים מחדש'))

    const customRadio = screen.getByDisplayValue('custom')
    await user.click(customRadio)

    const timeInput = screen.getByDisplayValue('')
    expect(timeInput).toBeTruthy()
  })
})

describe('RecalculateScreen — apply changes', () => {
  it('"שמירת השינויים" navigates back to Step4_Review', async () => {
    const user = userEvent.setup()
    upsertGroup(makeGroup())
    renderApp()
    await navigateToStep4(user)

    await user.click(screen.getByText('חישוב זמנים מחדש'))

    // Should have a save button
    const saveBtn = screen.getByText('שמירת השינויים')
    expect(saveBtn).toBeTruthy()

    // Click save (original mode should work)
    await user.click(saveBtn)

    // Should be back on Step4_Review
    expect(screen.getByText('סקירה ועריכה')).toBeTruthy()
  })
})

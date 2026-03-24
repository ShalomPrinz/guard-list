/**
 * Tests for FallbackScreen and wizard step guard redirects.
 * Verifies that navigating directly to Step2/Step3/Step4 without a session
 * redirects to /fallback, and that FallbackScreen renders and navigates home on click.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '@/context/WizardContext'
import Step2_Time from '@/screens/Step2_Time'
import Step3_Order from '@/screens/Step3_Order'
import Step4_Review from '@/screens/Step4_Review'
import FallbackScreen from '@/screens/FallbackScreen'
import { createLocalStorageMock } from '@/tests/localStorageMock'

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderAtStep(stepPath: string) {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={[stepPath]}>
        <Routes>
          <Route path="/schedule/new/step2" element={<Step2_Time />} />
          <Route path="/schedule/new/step3" element={<Step3_Order />} />
          <Route path="/schedule/new/step4" element={<Step4_Review />} />
          <Route path="/fallback" element={<FallbackScreen />} />
          <Route path="/" element={<div>דף הבית</div>} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

// ─── Guard Redirect Tests ──────────────────────────────────────────────────────

describe('wizard step guards — redirect to /fallback without session', () => {
  it('Step2_Time redirects to /fallback when there is no session', async () => {
    renderAtStep('/schedule/new/step2')
    await waitFor(() => expect(screen.getByText(/לא ברור איך הגעת לפה/)).toBeTruthy())
  })

  it('Step3_Order redirects to /fallback when there is no session', async () => {
    renderAtStep('/schedule/new/step3')
    await waitFor(() => expect(screen.getByText(/לא ברור איך הגעת לפה/)).toBeTruthy())
  })

  it('Step4_Review redirects to /fallback when there is no session', async () => {
    renderAtStep('/schedule/new/step4')
    await waitFor(() => expect(screen.getByText(/לא ברור איך הגעת לפה/)).toBeTruthy())
  })
})

// ─── FallbackScreen Tests ──────────────────────────────────────────────────────

describe('FallbackScreen', () => {
  function renderFallback() {
    return render(
      <MemoryRouter initialEntries={['/fallback']}>
        <Routes>
          <Route path="/fallback" element={<FallbackScreen />} />
          <Route path="/" element={<div>דף הבית</div>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('renders the Hebrew message', () => {
    renderFallback()
    expect(screen.getByText(/לא ברור איך הגעת לפה/)).toBeTruthy()
  })

  it('renders the app icon with correct src', () => {
    renderFallback()
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/app-icon.png')
  })

  it('navigates to home when the screen is clicked', async () => {
    const user = userEvent.setup()
    renderFallback()
    await user.click(screen.getByText(/לא ברור איך הגעת לפה/))
    expect(screen.getByText('דף הבית')).toBeTruthy()
  })
})

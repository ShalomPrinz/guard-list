/**
 * E2E tests for Migration 006:
 * - Welcome state when no groups exist
 * - Dark/light mode toggle in Header
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '../../src/context/WizardContext'
import Layout from '../../src/components/Layout'
import HomeScreen from '../../src/screens/HomeScreen'
import GroupEditScreen from '../../src/screens/GroupEditScreen'
import { createLocalStorageMock } from '../../src/tests/localStorageMock'
import { upsertGroup } from '../../src/storage/groups'
import type { Group } from '../../src/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeGroup(): Group {
  return {
    id: 'g1',
    name: 'מחלקה א',
    members: [{ id: 'm1', name: 'Alice', availability: 'base' }],
    createdAt: new Date().toISOString(),
  }
}

// ─── App renderer ─────────────────────────────────────────────────────────────

function renderApp(initialPath = '/') {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/group/:groupId/edit" element={<GroupEditScreen />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
  // Start in dark mode (default app state)
  document.documentElement.classList.add('dark')
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark')
})

// ─── Welcome state tests ───────────────────────────────────────────────────────

describe('Welcome state (empty groups)', () => {
  it('renders welcome state instead of normal HomeScreen when no groups exist', () => {
    renderApp('/')
    expect(screen.getByText('ברוך הבא! כדי להתחיל, צור קבוצת לוחמים שמורה')).toBeTruthy()
    expect(screen.getByText('צור קבוצה')).toBeTruthy()
    // Normal HomeScreen sections must be absent
    expect(screen.queryByText('+ צור לוח שמירה')).toBeNull()
    expect(screen.queryByText('קבוצות שמורות')).toBeNull()
    expect(screen.queryByText(/סטטיסטיקות/)).toBeNull()
  })

  it('clicking "צור קבוצה" opens the group creation modal', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByText('צור קבוצה'))
    // CreateGroupModal should be visible
    expect(screen.getByText('קבוצה חדשה')).toBeTruthy()
    expect(screen.getByPlaceholderText("למשל: מחלקה א'")).toBeTruthy()
  })

  it('normal HomeScreen renders after a group has been saved', () => {
    upsertGroup(makeGroup())
    renderApp('/')
    // Normal sections should be present
    expect(screen.getByText('+ צור לוח שמירה')).toBeTruthy()
    expect(screen.getByText('קבוצות שמורות')).toBeTruthy()
    // Welcome message must be absent
    expect(screen.queryByText('ברוך הבא! כדי להתחיל, צור קבוצת לוחמים שמורה')).toBeNull()
  })
})

// ─── Dark mode toggle tests ────────────────────────────────────────────────────

describe('Dark mode toggle in Header', () => {
  it('shows sun icon when app is in dark mode', () => {
    document.documentElement.classList.add('dark')
    renderApp('/')
    expect(screen.getByLabelText('עבור למצב בהיר')).toBeTruthy()
  })

  it('shows moon icon when app is in light mode', () => {
    document.documentElement.classList.remove('dark')
    renderApp('/')
    expect(screen.getByLabelText('עבור למצב כהה')).toBeTruthy()
  })

  it('clicking toggle in dark mode removes dark class and persists "light" to localStorage', async () => {
    const user = userEvent.setup()
    document.documentElement.classList.add('dark')
    renderApp('/')

    await user.click(screen.getByLabelText('עבור למצב בהיר'))

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('clicking toggle in light mode adds dark class and persists "dark" to localStorage', async () => {
    const user = userEvent.setup()
    document.documentElement.classList.remove('dark')
    renderApp('/')

    await user.click(screen.getByLabelText('עבור למצב כהה'))

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('on load with theme:"dark" in localStorage, dark class is on <html> and sun icon shows', () => {
    // Simulate what the inline script in index.html does on page load:
    // theme is 'dark' → keep the dark class on <html>
    localStorage.setItem('theme', 'dark')
    document.documentElement.classList.add('dark')

    renderApp('/')

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(screen.getByLabelText('עבור למצב בהיר')).toBeTruthy()
  })

  it('toggling twice returns to original state', async () => {
    const user = userEvent.setup()
    document.documentElement.classList.add('dark')
    renderApp('/')

    await user.click(screen.getByLabelText('עבור למצב בהיר')) // dark → light
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    await user.click(screen.getByLabelText('עבור למצב כהה')) // light → dark
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('theme')).toBe('dark')
  })
})

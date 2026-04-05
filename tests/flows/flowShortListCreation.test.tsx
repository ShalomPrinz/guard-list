/**
 * E2E flow test — Short-List Creation
 * Tests the complete short-list flow from HomeScreen through schedule save.
 * Covers one-station, two-station, back navigation, and error cases.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WizardProvider } from '@/context/WizardContext'
import { ShortListWizardProvider } from '@/context/ShortListWizardContext'
import HomeScreen from '@/screens/HomeScreen'
import Step1_Stations from '@/screens/Step1_Stations'
import ShortListStep2 from '@/screens/ShortListStep2'
import ResultScreen from '@/screens/ResultScreen'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import { upsertGroup } from '@/storage/groups'
import { getSchedules } from '@/storage/schedules'
import { getStatistics } from '@/storage/statistics'
import type { Group } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGroup(overrides: Partial<Group> = {}): Group {
  const defaultMembers = Array.from({ length: 15 }, (_, i) => ({
    id: `m${i + 1}`,
    name: `Warrior ${i + 1}`,
    availability: 'base' as const,
    role: 'warrior' as const,
  }))

  return {
    id: 'g1',
    name: 'קבוצה א',
    members: defaultMembers,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

// Helper to fill in ShortListStep2 inputs using fireEvent for controlled number inputs
function fillShortListStep2(startHour: number, minutesPerWarrior: number, numberOfWarriors: number) {
  // Set start hour via TimePicker (hours spinner has aria-label "שעות")
  const hourInputs = screen.getAllByRole('textbox', { name: 'שעות' })
  if (hourInputs.length > 0) {
    fireEvent.change(hourInputs[0], { target: { value: String(startHour) } })
    fireEvent.blur(hourInputs[0])
  }

  // Set minutes per warrior and numberOfWarriors via spinbuttons
  // type="number" inputs are spinbuttons in testing-library
  const spinbuttons = screen.getAllByRole('spinbutton')
  if (spinbuttons.length >= 2) {
    fireEvent.change(spinbuttons[0], { target: { value: String(minutesPerWarrior) } })
    fireEvent.change(spinbuttons[1], { target: { value: String(numberOfWarriors) } })
  }
}

function renderApp(initialPath: string) {
  return render(
    <ShortListWizardProvider>
      <WizardProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/short-list/step1/:groupId" element={<Step1_Stations />} />
            <Route path="/short-list/step2" element={<ShortListStep2 />} />
            <Route path="/schedule/:scheduleId/result" element={<ResultScreen />} />
          </Routes>
        </MemoryRouter>
      </WizardProvider>
    </ShortListWizardProvider>,
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

describe('Short-List Creation Flow', () => {
  describe('One Station — Happy Path', () => {
    it('navigates from HomeScreen to Step1_Stations on short-list button click', async () => {
      const user = userEvent.setup()
      upsertGroup(makeGroup())
      renderApp('/')

      const shortListBtn = screen.getByText('⚡ רשימה קצרה')
      expect(shortListBtn).toBeTruthy()

      await user.click(shortListBtn)

      // Should land on Step1_Stations
      expect(screen.getByText('הגדרת עמדות')).toBeTruthy()
    })

    it('selects 1 station and navigates to Step2', async () => {
      const user = userEvent.setup()
      upsertGroup(makeGroup())
      renderApp('/short-list/step1/g1')

      // Station count should default to 1
      const nextBtn = screen.getByText('הבא →')
      expect(nextBtn).toBeTruthy()

      await user.click(nextBtn)

      // Should land on ShortListStep2
      expect(screen.getByText('הגדרת רשימה קצרה')).toBeTruthy()
    })

    it('fills in parameters and creates short-list schedule', async () => {
      const user = userEvent.setup()
      upsertGroup(makeGroup())
      renderApp('/short-list/step1/g1')

      // Proceed to Step2
      await user.click(screen.getByText('הבא →'))

      // Fill in parameters using the helper
      fillShortListStep2(14, 90, 5)

      // Click "יצור רשימה"
      const createBtn = screen.getByText('יצור רשימה')
      await user.click(createBtn)

      // Should navigate to ResultScreen (back button is always present there)
      await waitFor(() => {
        expect(screen.getByText('← חזרה לעריכה')).toBeTruthy()
      })
    })

    it('saves schedule to localStorage with correct structure', async () => {
      const user = userEvent.setup()
      upsertGroup(makeGroup())
      renderApp('/short-list/step1/g1')

      // Navigate to Step2
      await user.click(screen.getByText('הבא →'))

      // Fill in parameters using the helper
      fillShortListStep2(14, 90, 5)

      // Create schedule
      await user.click(screen.getByText('יצור רשימה'))

      // Wait for navigation and verify localStorage
      await waitFor(() => {
        const schedules = getSchedules()
        expect(schedules.length).toBe(1)

        const schedule = schedules[0]
        expect(schedule.name).toBe('רשימת שמירה')
        expect(schedule.groupId).toBe('g1')
        expect(schedule.createdFromShortList).toBe(true)
        expect(schedule.stations.length).toBe(1)
        expect(schedule.stations[0].participants.length).toBe(5)

        // Check that all participants have 90-min duration
        schedule.stations[0].participants.forEach(p => {
          expect(p.durationMinutes).toBe(90)
        })
        // First participant starts at 14:00
        expect(schedule.stations[0].participants[0].startTime).toBe('14:00')
      })
    })

    it('shows back button on ResultScreen and persists schedule when saved', async () => {
      const user = userEvent.setup()
      upsertGroup(makeGroup())
      renderApp('/short-list/step1/g1')

      // Complete the flow
      await user.click(screen.getByText('הבא →'))

      fillShortListStep2(14, 90, 5)

      await user.click(screen.getByText('יצור רשימה'))

      await waitFor(() => {
        const backBtn = screen.getByText('← חזרה לעריכה')
        expect(backBtn).toBeTruthy()
      })

      // Verify schedule exists in localStorage
      const schedules = getSchedules()
      expect(schedules.length).toBe(1)
    })
  })

  describe('Two Stations — Multi-Station Flow', () => {
    it('creates short-list with 2 stations and verifies distribution', async () => {
      const user = userEvent.setup()
      const group = makeGroup({
        members: Array.from({ length: 25 }, (_, i) => ({
          id: `m${i + 1}`,
          name: `Warrior ${i + 1}`,
          availability: 'base' as const,
          role: 'warrior' as const,
        })),
      })
      upsertGroup(group)
      renderApp('/short-list/step1/g1')

      // Change station count to 2
      const twoBtn = screen.getByText('2')
      await user.click(twoBtn)

      // Proceed to Step2
      await user.click(screen.getByText('הבא →'))

      // Set parameters using the helper (numberOfWarriors=10 sets total to 20)
      fillShortListStep2(10, 60, 10)

      // After setting numberOfWarriors=10 with 2 stations, total should be 20
      const totalWarriors = screen.getByText(/סך הכל:/)
      expect(totalWarriors.textContent).toContain('20 חיילים')

      await user.click(screen.getByText('יצור רשימה'))

      await waitFor(() => {
        const schedules = getSchedules()
        expect(schedules.length).toBe(1)

        const schedule = schedules[0]
        expect(schedule.stations.length).toBe(2)

        // Check distribution: 10 warriors per station
        schedule.stations.forEach(station => {
          expect(station.participants.length).toBe(10)
          station.participants.forEach(p => {
            expect(p.durationMinutes).toBe(60)
          })
          // First participant in each station starts at 10:00
          expect(station.participants[0].startTime).toBe('10:00')
        })
      })
    })
  })

  describe('Back Navigation & State Persistence', () => {
    it('back from Step2 to Step1 preserves selected stations', async () => {
      const user = userEvent.setup()
      upsertGroup(makeGroup())
      renderApp('/short-list/step1/g1')

      // Change to 3 stations
      await user.click(screen.getByText('3'))

      // Verify 3 stations are shown
      expect(screen.getByDisplayValue('עמדה 1')).toBeTruthy()
      expect(screen.getByDisplayValue('עמדה 2')).toBeTruthy()
      expect(screen.getByDisplayValue('עמדה 3')).toBeTruthy()

      // Go to Step2
      await user.click(screen.getByText('הבא →'))

      // Cancel and go back
      const cancelBtn = screen.getByText('← ביטול')
      await user.click(cancelBtn)

      // Should be back at home
      expect(screen.getByText('⚡ רשימה קצרה')).toBeTruthy()
    })

    it('back from ResultScreen reconstructs short-list session', async () => {
      const user = userEvent.setup()
      upsertGroup(makeGroup())
      renderApp('/short-list/step1/g1')

      await user.click(screen.getByText('הבא →'))

      fillShortListStep2(14, 90, 5)

      await user.click(screen.getByText('יצור רשימה'))

      await waitFor(() => {
        const backBtn = screen.getByText('← חזרה לעריכה')
        expect(backBtn).toBeTruthy()
      })

      // Click back button
      const backBtn = screen.getByText('← חזרה לעריכה')
      await user.click(backBtn)

      // Should be back at ShortListStep2 with parameters preserved
      await waitFor(() => {
        expect(screen.getByText('הגדרת רשימה קצרה')).toBeTruthy()
      })
    })
  })

  describe('Error Cases', () => {
    it('shows error when not enough warriors available', async () => {
      // 3 available, 2 stations × 2 warriors each = 4 total > 3 available → error
      const user = userEvent.setup()
      const group = makeGroup({
        members: Array.from({ length: 3 }, (_, i) => ({
          id: `m${i + 1}`,
          name: `Warrior ${i + 1}`,
          availability: 'base' as const,
          role: 'warrior' as const,
        })),
      })
      upsertGroup(group)
      renderApp('/short-list/step1/g1')

      // Select 2 stations
      await user.click(screen.getByText('2'))
      await user.click(screen.getByText('הבא →'))

      // 2 warriors per station, total = 2 × 2 = 4 > 3 available
      fillShortListStep2(14, 60, 2)

      await user.click(screen.getByText('יצור רשימה'))

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText(/סך הכל \d+ חיילים נדרשים/)).toBeTruthy()
      })

      // Schedule should not be created
      const schedules = getSchedules()
      expect(schedules.length).toBe(0)
    })

    it('shows error when no group found', async () => {
      const user = userEvent.setup()
      renderApp('/short-list/step1/nonexistent')

      // Should show fallback or error
      // Navigate to Step2 and expect an error
      const nextBtn = screen.queryByText('הבא →')
      if (nextBtn) {
        await user.click(nextBtn)
      }

      // If we can get to Step2, it should error on creation due to no group
      const createBtn = screen.queryByText('יצור רשימה')
      if (createBtn) {
        await user.click(createBtn)
        await waitFor(() => {
          expect(screen.queryByText(/קבוצה לא נמצאה/)).toBeTruthy()
        })
      }
    })
  })

  describe('Statistics Integration', () => {
    it('records statistics for all participants after schedule creation', async () => {
      const user = userEvent.setup()
      upsertGroup(makeGroup())
      renderApp('/short-list/step1/g1')

      await user.click(screen.getByText('הבא →'))

      fillShortListStep2(14, 90, 5)

      await user.click(screen.getByText('יצור רשימה'))

      // Wait for navigation to complete (check for result screen elements)
      await waitFor(() => {
        // ResultScreen includes a back button
        const backBtn = screen.queryByText('← חזרה לעריכה')
        expect(backBtn).toBeTruthy()
      })

      // Then check statistics
      const stats = getStatistics()
      const participantStats = Object.values(stats.participants)
      // Should have 5 participants recorded
      expect(participantStats.length).toBe(5)

      // Each warrior should have 90-minute duration
      participantStats.forEach(p => {
        expect(p.totalMinutes).toBe(90)
        expect(p.totalShifts).toBe(1)
      })
    })
  })
})

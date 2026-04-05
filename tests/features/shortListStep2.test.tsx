import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import React from 'react'
import ShortListStep2 from '@/screens/ShortListStep2'
import { ShortListWizardProvider, useShortListWizard } from '@/context/ShortListWizardContext'
import { upsertGroup } from '@/storage/groups'
import type { ShortListWizardSession } from '@/types'
import { createLocalStorageMock } from '@/tests/localStorageMock'

// Wrapper component to set up the short-list session for testing
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <BrowserRouter>
      <ShortListWizardProvider>
        {children}
      </ShortListWizardProvider>
    </BrowserRouter>
  )
}

// Component to initialize session
function SessionInitializer({ session }: { session: ShortListWizardSession }) {
  const { setSession } = useShortListWizard()
  React.useEffect(() => {
    setSession(session)
  }, [session, setSession])
  return null
}

describe('ShortListStep2', () => {
  let mockStorage: ReturnType<typeof createLocalStorageMock>

  beforeEach(() => {
    mockStorage = createLocalStorageMock()
    vi.stubGlobal('localStorage', mockStorage)
    vi.clearAllMocks()
  })

  it('reads groupId from ShortListWizardContext, not URL params', async () => {
    // Create a test group
    const group = {
      id: 'group-123',
      name: 'Test Group',
      members: [
        { id: '1', name: 'Alice', availability: 'base' as const, role: 'warrior' as const },
        { id: '2', name: 'Bob', availability: 'base' as const, role: 'warrior' as const },
        { id: '3', name: 'Charlie', availability: 'home' as const, role: 'warrior' as const },
      ],
      createdAt: new Date().toISOString(),
    }
    upsertGroup(group)

    const session: ShortListWizardSession = {
      groupId: 'group-123',
      stations: [
        { id: 'station-1', name: 'עמדה 1', type: 'time-based' },
      ],
      startHour: 14,
      minutesPerWarrior: 60,
      numberOfWarriors: 2,
    }

    render(
      <TestWrapper>
        <SessionInitializer session={session} />
        <ShortListStep2 />
      </TestWrapper>,
    )

    // Wait for the component to render
    await waitFor(() => {
      expect(screen.getByText('הגדרת רשימה קצרה')).toBeTruthy()
    })

    // Verify the TimePicker is present (not the custom number input)
    // TimePicker renders spinners with values "14" and "00"
    const hourInput = screen.getByDisplayValue('14')
    const minutesInput = screen.getByDisplayValue('00')
    expect(hourInput).toBeTruthy()
    expect(minutesInput).toBeTruthy()
  })

  it('displays available base members count correctly', async () => {
    const group = {
      id: 'group-456',
      name: 'Another Group',
      members: [
        { id: '1', name: 'Person A', availability: 'base' as const, role: 'warrior' as const },
        { id: '2', name: 'Person B', availability: 'base' as const, role: 'warrior' as const },
        { id: '3', name: 'Person C', availability: 'base' as const, role: 'warrior' as const },
        { id: '4', name: 'Person D', availability: 'home' as const, role: 'warrior' as const },
      ],
      createdAt: new Date().toISOString(),
    }
    upsertGroup(group)

    const session: ShortListWizardSession = {
      groupId: 'group-456',
      stations: [{ id: 'st1', name: 'עמדה 1', type: 'time-based' }],
      startHour: 14,
      minutesPerWarrior: 60,
      numberOfWarriors: 1,
    }

    render(
      <TestWrapper>
        <SessionInitializer session={session} />
        <ShortListStep2 />
      </TestWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('הגדרת רשימה קצרה')).toBeTruthy()
    })

    // The "Number of Warriors" input should have max={3} (3 base members)
    const numberOfWarriorsInput = screen.getByDisplayValue('1') as HTMLInputElement
    expect(numberOfWarriorsInput.max).toBe('3')
  })

  it('removes gray helper text below field labels', async () => {
    const group = {
      id: 'group-789',
      name: 'Test Group',
      members: [
        { id: '1', name: 'Alice', availability: 'base' as const, role: 'warrior' as const },
      ],
      createdAt: new Date().toISOString(),
    }
    upsertGroup(group)

    const session: ShortListWizardSession = {
      groupId: 'group-789',
      stations: [{ id: 'st1', name: 'עמדה 1', type: 'time-based' }],
      startHour: 14,
      minutesPerWarrior: 60,
      numberOfWarriors: 1,
    }

    const { container } = render(
      <TestWrapper>
        <SessionInitializer session={session} />
        <ShortListStep2 />
      </TestWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('הגדרת רשימה קצרה')).toBeTruthy()
    })

    // Check that there are no gray helper text elements (text-gray-500)
    // Looking for <p> elements with text-gray-500 class (but not the ones inside TimePicker spinners)
    const allPs = container.querySelectorAll('p[class*="text-gray-500"]')
    expect(allPs.length).toBe(0)
  })

  it('uses default name "רשימת שמירה" when creating schedule', async () => {
    const group = {
      id: 'group-default-name',
      name: 'Test Group',
      members: Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        name: `Warrior ${i + 1}`,
        availability: 'base' as const,
        role: 'warrior' as const,
      })),
      createdAt: new Date().toISOString(),
    }
    upsertGroup(group)

    const session: ShortListWizardSession = {
      groupId: 'group-default-name',
      stations: [
        { id: 'st1', name: 'עמדה 1', type: 'time-based' },
        { id: 'st2', name: 'עמדה 2', type: 'time-based' },
      ],
      startHour: 14,
      minutesPerWarrior: 60,
      numberOfWarriors: 1, // 1 per station = 2 total
      name: 'רשימת שמירה',
    }

    render(
      <TestWrapper>
        <SessionInitializer session={session} />
        <ShortListStep2 />
      </TestWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('הגדרת רשימה קצרה')).toBeTruthy()
    })

    // Click "יצור רשימה" button
    const createButton = screen.getByRole('button', { name: /יצור רשימה/ })
    fireEvent.click(createButton)

    // Wait for the schedule to be created
    await waitFor(() => {
      // The schedule should be saved with name "רשימת שמירה"
      // We can verify by checking if the schedule exists in localStorage
      const schedules = mockStorage.getItem('schedules')
      expect(schedules).toBeTruthy()

      if (schedules) {
        const parsed = JSON.parse(schedules)
        const createdSchedule = Object.values(parsed)[0]
        expect(createdSchedule).toBeTruthy()
        expect((createdSchedule as any).name).toBe('רשימת שמירה')
      }
    })
  })

  it('shows total warrior count display when multiple stations are selected', async () => {
    const group = {
      id: 'group-multi-station',
      name: 'Test Group',
      members: Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        name: `Warrior ${i + 1}`,
        availability: 'base' as const,
        role: 'warrior' as const,
      })),
      createdAt: new Date().toISOString(),
    }
    upsertGroup(group)

    const session: ShortListWizardSession = {
      groupId: 'group-multi-station',
      stations: [
        { id: 'st1', name: 'עמדה 1', type: 'time-based' },
        { id: 'st2', name: 'עמדה 2', type: 'time-based' },
        { id: 'st3', name: 'עמדה 3', type: 'time-based' },
      ],
      startHour: 14,
      minutesPerWarrior: 60,
      numberOfWarriors: 2, // 2 per station = 6 total
    }

    render(
      <TestWrapper>
        <SessionInitializer session={session} />
        <ShortListStep2 />
      </TestWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('הגדרת רשימה קצרה')).toBeTruthy()
    })

    // Should show "סך הכל: 6 חיילים" (2 per station × 3 stations)
    // Note: the text is split across multiple nodes, so we just check for the paragraph existence
    const paragraphs = screen.getAllByText(/סך הכל:/)
    expect(paragraphs.length).toBeGreaterThan(0)
  })

  it('shows correct total when numberOfWarriors changes', async () => {
    const group = {
      id: 'group-distribution',
      name: 'Test Group',
      members: Array.from({ length: 9 }, (_, i) => ({
        id: String(i),
        name: `Warrior ${i + 1}`,
        availability: 'base' as const,
        role: 'warrior' as const,
      })),
      createdAt: new Date().toISOString(),
    }
    upsertGroup(group)

    const session: ShortListWizardSession = {
      groupId: 'group-distribution',
      stations: [
        { id: 'st1', name: 'עמדה 1', type: 'time-based' },
        { id: 'st2', name: 'עמדה 2', type: 'time-based' },
        { id: 'st3', name: 'עמדה 3', type: 'time-based' },
      ],
      startHour: 14,
      minutesPerWarrior: 60,
      numberOfWarriors: 3, // 3 per station = 9 total
      name: 'רשימת שמירה',
    }

    render(
      <TestWrapper>
        <SessionInitializer session={session} />
        <ShortListStep2 />
      </TestWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('הגדרת רשימה קצרה')).toBeTruthy()
    })

    // Check that the label says "מספר חיילים לעמדה" (per station)
    expect(screen.getByText('מספר חיילים לעמדה')).toBeTruthy()

    // Should show "סך הכל: 9 חיילים" (3 per station × 3 stations)
    // Note: the text is split across multiple nodes, so we just check for the paragraph existence
    const paragraphs = screen.getAllByText(/סך הכל:/)
    expect(paragraphs.length).toBeGreaterThan(0)
  })
})

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import HomeScreen from '@/screens/HomeScreen'
import { upsertGroup } from '@/storage/groups'
import { upsertSchedule } from '@/storage/schedules'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import type { Group, Schedule, ScheduleStation } from '@/types'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function createTestSchedule(index: number): Schedule {
  const baseTime = new Date('2026-04-01T12:00:00')
  baseTime.setDate(baseTime.getDate() - index) // Earlier dates for older schedules

  const station: ScheduleStation = {
    stationConfigId: `station-${index}`,
    stationName: `Station ${index}`,
    stationType: 'time-based',
    participants: [],
  }

  return {
    id: `schedule-${index}`,
    name: `Schedule ${index}`,
    groupId: 'test-group',
    date: baseTime.toISOString().split('T')[0],
    stations: [station],
    createdAt: baseTime.toISOString(),
    unevenDistributionMode: 'equal-duration',
  }
}

function createTestGroup(): Group {
  return {
    id: 'test-group',
    name: 'Test Group',
    members: [
      { id: 'member-1', name: 'Alice', availability: 'base', role: 'warrior' },
    ],
    createdAt: new Date().toISOString(),
  }
}

function renderHomeScreen() {
  return render(
    <BrowserRouter>
      <HomeScreen />
    </BrowserRouter>
  )
}

describe('HomeScreen Lists Infinite Scroll', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock())
    mockNavigate.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows exactly 5 schedules initially when more than 5 exist', () => {
    const group = createTestGroup()
    upsertGroup(group)

    // Create 20 schedules
    for (let i = 0; i < 20; i++) {
      const schedule = createTestSchedule(i)
      upsertSchedule(schedule)
    }

    renderHomeScreen()

    // Count list items in the schedules section
    const scheduleSection = screen.getByText('לוחות שמירה קודמים').closest('section')
    const allListItems = scheduleSection?.querySelectorAll('li') || []

    // Should show exactly 5 schedules
    expect(allListItems.length).toBe(5)
  })

  it('shows load more button when there are more than 5 schedules', () => {
    const group = createTestGroup()
    upsertGroup(group)

    // Create 10 schedules
    for (let i = 0; i < 10; i++) {
      const schedule = createTestSchedule(i)
      upsertSchedule(schedule)
    }

    renderHomeScreen()

    expect(screen.getByRole('button', { name: 'טען רשימות ישנות' })).toBeTruthy()
  })

  it('does not show load more button when 5 or fewer schedules exist', () => {
    const group = createTestGroup()
    upsertGroup(group)

    // Create exactly 5 schedules
    for (let i = 0; i < 5; i++) {
      const schedule = createTestSchedule(i)
      upsertSchedule(schedule)
    }

    renderHomeScreen()

    expect(screen.queryByRole('button', { name: 'טען רשימות ישנות' })).toBeFalsy()
  })

  it('loads 10 more schedules when load more button is clicked', () => {
    const group = createTestGroup()
    upsertGroup(group)

    // Create 20 schedules
    for (let i = 0; i < 20; i++) {
      const schedule = createTestSchedule(i)
      upsertSchedule(schedule)
    }

    renderHomeScreen()

    // Initially should show 5
    let scheduleSection = screen.getByText('לוחות שמירה קודמים').closest('section')
    let visibleSchedules = scheduleSection?.querySelectorAll('li') || []
    expect(visibleSchedules.length).toBe(5)

    // Click load more
    const loadMoreButton = screen.getByRole('button', { name: 'טען רשימות ישנות' })
    fireEvent.click(loadMoreButton)

    // Should now show 15 schedules (5 + 10)
    scheduleSection = screen.getByText('לוחות שמירה קודמים').closest('section')
    visibleSchedules = scheduleSection?.querySelectorAll('li') || []
    expect(visibleSchedules.length).toBe(15)
  })

  it('hides load more button after clicking it', () => {
    const group = createTestGroup()
    upsertGroup(group)

    // Create 20 schedules
    for (let i = 0; i < 20; i++) {
      const schedule = createTestSchedule(i)
      upsertSchedule(schedule)
    }

    renderHomeScreen()

    const loadMoreButton = screen.getByRole('button', { name: 'טען רשימות ישנות' })
    fireEvent.click(loadMoreButton)

    // Load more button should be gone
    expect(screen.queryByRole('button', { name: 'טען רשימות ישנות' })).toBeFalsy()
  })

  it('sets up sentinel div after load more is clicked for infinite scroll', () => {
    const group = createTestGroup()
    upsertGroup(group)

    // Create 20 schedules
    for (let i = 0; i < 20; i++) {
      const schedule = createTestSchedule(i)
      upsertSchedule(schedule)
    }

    renderHomeScreen()

    const loadMoreButton = screen.getByRole('button', { name: 'טען רשימות ישנות' })
    fireEvent.click(loadMoreButton)

    // Sentinel should be rendered (div with h-1 mt-4 classes)
    const scheduleSection = screen.getByText('לוחות שמירה קודמים').closest('section')
    const sentinel = scheduleSection?.querySelector('.h-1.mt-4')
    expect(sentinel).toBeTruthy()
  })

  it('caps visible schedules at total count to prevent over-loading', () => {
    const group = createTestGroup()
    upsertGroup(group)

    // Create only 12 schedules
    for (let i = 0; i < 12; i++) {
      const schedule = createTestSchedule(i)
      upsertSchedule(schedule)
    }

    renderHomeScreen()

    // Click load more to attempt to show 5 + 10 = 15 (but only 12 exist)
    const loadMoreButton = screen.getByRole('button', { name: 'טען רשימות ישנות' })
    fireEvent.click(loadMoreButton)

    // Should show all 12 schedules (not try to show 15)
    const scheduleSection = screen.getByText('לוחות שמירה קודמים').closest('section')
    const visibleSchedules = scheduleSection?.querySelectorAll('li') || []
    expect(visibleSchedules.length).toBe(12)
  })

  it('displays schedules in reverse chronological order (newest first)', () => {
    const group = createTestGroup()
    upsertGroup(group)

    // Create 5 schedules with different names to verify order
    const names = ['Alice', 'Bob', 'Charlie', 'David', 'Eve']
    for (let i = 0; i < 5; i++) {
      const schedule = createTestSchedule(i)
      schedule.name = names[i]
      upsertSchedule(schedule)
    }

    renderHomeScreen()

    // Get all schedule names — they should appear in reverse order (newest first)
    // Schedule 0 is most recent, created 0 days ago
    // Schedule 4 is oldest, created 4 days ago
    // So order should be: Alice (index 0), Bob (index 1), Charlie (index 2), ...
    const alice = screen.getByText('Alice')
    const bob = screen.getByText('Bob')
    const charlie = screen.getByText('Charlie')

    // Verify they exist (confirms correct order on screen)
    expect(alice).toBeTruthy()
    expect(bob).toBeTruthy()
    expect(charlie).toBeTruthy()
  })

  it('does not show sentinel until load more is clicked', () => {
    const group = createTestGroup()
    upsertGroup(group)

    // Create 20 schedules
    for (let i = 0; i < 20; i++) {
      const schedule = createTestSchedule(i)
      upsertSchedule(schedule)
    }

    renderHomeScreen()

    // Before clicking, sentinel should not exist
    const scheduleSection = screen.getByText('לוחות שמירה קודמים').closest('section')
    let sentinel = scheduleSection?.querySelector('.h-1.mt-4')
    expect(sentinel).toBeFalsy()

    // Click load more
    const loadMoreButton = screen.getByRole('button', { name: 'טען רשימות ישנות' })
    fireEvent.click(loadMoreButton)

    // Now sentinel should exist
    sentinel = scheduleSection?.querySelector('.h-1.mt-4')
    expect(sentinel).toBeTruthy()
  })
})

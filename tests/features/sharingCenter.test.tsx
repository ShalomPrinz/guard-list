/**
 * Tests for SharingCenterScreen and loadSharingCenterUpdates.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import SharingCenterScreen from '@/screens/SharingCenterScreen'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import {
  setLocalGroup,
  setLocalGroupInvitation,
  setOutgoingInvitation,
  getLocalGroup,
  getOutgoingInvitation,
  loadSharingCenterUpdates,
} from '@/storage/citationShare'
import { setUsername } from '@/storage/userStorage'
import type { SharingGroup, GroupInvitation } from '@/types'

// ─── Cloud storage mock ───────────────────────────────────────────────────────

const mockKvGet = vi.fn()
const mockKvDel = vi.fn()
const mockKvGroupGetMembers = vi.fn()

vi.mock('@/storage/cloudStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/storage/cloudStorage')>()
  return {
    ...actual,
    kvGet: (...args: unknown[]) => mockKvGet(...args),
    kvDel: (...args: unknown[]) => mockKvDel(...args),
    kvGroupGetMembers: (...args: unknown[]) => mockKvGroupGetMembers(...args),
    kvGroupLeave: vi.fn().mockResolvedValue(undefined),
    kvCrossSet: vi.fn().mockResolvedValue('ok'),
    kvGroupJoin: vi.fn().mockResolvedValue('ok'),
    kvGroupCreate: vi.fn().mockResolvedValue({ groupId: 'new-group' }),
    kvCrossReadGroupMember: vi.fn().mockResolvedValue(null),
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGroup(overrides: Partial<SharingGroup> = {}): SharingGroup {
  return { groupId: 'group-1', members: ['alice', 'bob'], joinedAt: Date.now(), ...overrides }
}

function makeInvitation(overrides: Partial<GroupInvitation> = {}): GroupInvitation {
  return { groupId: 'group-1', fromUsername: 'alice', sentAt: Date.now(), ...overrides }
}

function renderSharingCenter() {
  return render(
    <MemoryRouter initialEntries={['/sharing-center']}>
      <Routes>
        <Route path="/sharing-center" element={<SharingCenterScreen />} />
        <Route path="/citations" element={<div data-testid="citations-screen">Citations</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
  setUsername('currentuser')
  mockKvGet.mockResolvedValue(null)
  mockKvDel.mockResolvedValue(undefined)
  mockKvGroupGetMembers.mockResolvedValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// ─── Not in a group ───────────────────────────────────────────────────────────

describe('SharingCenterScreen — not in a group', () => {
  it('shows "אינך חלק מקבוצת שיתוף" message', async () => {
    renderSharingCenter()
    await waitFor(() => {
      expect(screen.getByText('אינך חלק מקבוצת שיתוף')).toBeTruthy()
    })
  })

  it('shows invite button in not-in-group state', async () => {
    renderSharingCenter()
    await waitFor(() => {
      expect(screen.getByText('הזמן משתמש')).toBeTruthy()
    })
  })
})

// ─── Pending invitation on mount ─────────────────────────────────────────────

describe('SharingCenterScreen — pending invitation on mount', () => {
  it('shows pending invitation card when invitation exists in localStorage', async () => {
    setLocalGroupInvitation(makeInvitation({ fromUsername: 'alice' }))
    renderSharingCenter()

    await waitFor(() => {
      expect(screen.getByText(/alice/)).toBeTruthy()
      expect(screen.getByText('אשר')).toBeTruthy()
      expect(screen.getByText('דחה')).toBeTruthy()
    })
  })

  it('does not show invitation card when no invitation in localStorage', async () => {
    renderSharingCenter()
    await waitFor(() => {
      expect(screen.queryByText('אשר')).toBeNull()
    })
  })
})

// ─── In a group ───────────────────────────────────────────────────────────────

describe('SharingCenterScreen — in a group', () => {
  it('shows group members list', async () => {
    setLocalGroup(makeGroup({ members: ['currentuser', 'bob'] }))
    renderSharingCenter()

    await waitFor(() => {
      expect(screen.getByText('currentuser')).toBeTruthy()
      expect(screen.getByText('bob')).toBeTruthy()
    })
  })

  it('marks current user with "(אתה)"', async () => {
    setLocalGroup(makeGroup({ members: ['currentuser', 'bob'] }))
    renderSharingCenter()

    await waitFor(() => {
      expect(screen.getByText('(אתה)')).toBeTruthy()
    })
  })

  it('shows outgoing invitation status', async () => {
    setLocalGroup(makeGroup())
    setOutgoingInvitation({ toUsername: 'charlie', groupId: 'group-1', sentAt: Date.now() })
    renderSharingCenter()

    await waitFor(() => {
      expect(screen.getByText(/charlie/)).toBeTruthy()
    })
  })

  it('shows "עזוב קבוצה" button', async () => {
    setLocalGroup(makeGroup())
    renderSharingCenter()

    await waitFor(() => {
      expect(screen.getByText('עזוב קבוצה')).toBeTruthy()
    })
  })
})

// ─── Notification banners ─────────────────────────────────────────────────────

describe('SharingCenterScreen — notifications', () => {
  it('shows accept notification banner when someone joined', async () => {
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:acceptNotification') return Promise.resolve({ byUsername: 'david', groupId: 'group-1', at: Date.now() })
      return Promise.resolve(null)
    })
    mockKvGroupGetMembers.mockResolvedValue(['currentuser', 'david'])
    setLocalGroup(makeGroup({ members: ['currentuser'] }))

    renderSharingCenter()

    await waitFor(() => {
      expect(screen.getByText(/david.*הצטרף/)).toBeTruthy()
    })
  })

  it('shows rejection notification banner when invitation was declined', async () => {
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:rejectionNotification') return Promise.resolve({ byUsername: 'eve', groupId: 'group-1', at: Date.now() })
      return Promise.resolve(null)
    })

    renderSharingCenter()

    await waitFor(() => {
      expect(screen.getByText(/eve.*דחה/)).toBeTruthy()
    })
  })

  it('dismisses notification banner on ✕ click', async () => {
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:rejectionNotification') return Promise.resolve({ byUsername: 'eve', groupId: 'group-1', at: Date.now() })
      return Promise.resolve(null)
    })

    const user = userEvent.setup()
    renderSharingCenter()

    await waitFor(() => screen.getByText(/eve.*דחה/))
    await user.click(screen.getByText('✕'))

    expect(screen.queryByText(/eve.*דחה/)).toBeNull()
  })
})

// ─── Leave group ──────────────────────────────────────────────────────────────

describe('SharingCenterScreen — leave group', () => {
  it('shows ConfirmDialog when "עזוב קבוצה" is clicked', async () => {
    const user = userEvent.setup()
    setLocalGroup(makeGroup())
    renderSharingCenter()

    await waitFor(() => screen.getByText('עזוב קבוצה'))
    await user.click(screen.getByText('עזוב קבוצה'))

    expect(screen.getByText(/לעזוב את קבוצת השיתוף/)).toBeTruthy()
  })

  it('navigates to /citations after confirming leave', async () => {
    const user = userEvent.setup()
    setLocalGroup(makeGroup())
    renderSharingCenter()

    await waitFor(() => screen.getByText('עזוב קבוצה'))
    await user.click(screen.getByText('עזוב קבוצה'))

    // ConfirmDialog confirm button is always "מחיקה"
    await user.click(screen.getByRole('button', { name: 'מחיקה' }))

    await waitFor(() => {
      expect(screen.getByTestId('citations-screen')).toBeTruthy()
    })
  })
})

// ─── loadSharingCenterUpdates unit tests ─────────────────────────────────────

describe('loadSharingCenterUpdates', () => {
  it('returns empty object when no notifications and no group', async () => {
    const result = await loadSharingCenterUpdates()
    expect(result).toEqual({})
  })

  it('returns acceptedBy and clears outgoing invitation when accept notification found', async () => {
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:acceptNotification') return Promise.resolve({ byUsername: 'frank', groupId: 'g1', at: Date.now() })
      return Promise.resolve(null)
    })
    mockKvGroupGetMembers.mockResolvedValue(['currentuser', 'frank'])
    setLocalGroup(makeGroup({ groupId: 'g1', members: ['currentuser'] }))
    setOutgoingInvitation({ toUsername: 'frank', groupId: 'g1', sentAt: Date.now() })

    const result = await loadSharingCenterUpdates()

    expect(result.acceptedBy).toBe('frank')
    expect(getOutgoingInvitation()).toBeNull()
    // Group members refreshed
    expect(getLocalGroup()?.members).toContain('frank')
  })

  it('returns rejectedBy and clears outgoing invitation when rejection notification found', async () => {
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:rejectionNotification') return Promise.resolve({ byUsername: 'grace', groupId: 'g1', at: Date.now() })
      return Promise.resolve(null)
    })
    setOutgoingInvitation({ toUsername: 'grace', groupId: 'g1', sentAt: Date.now() })

    const result = await loadSharingCenterUpdates()

    expect(result.rejectedBy).toBe('grace')
    expect(getOutgoingInvitation()).toBeNull()
  })

  it('refreshes member list when in a group', async () => {
    setLocalGroup(makeGroup({ groupId: 'g1', members: ['currentuser'] }))
    mockKvGroupGetMembers.mockResolvedValue(['currentuser', 'henry'])

    const result = await loadSharingCenterUpdates()

    expect(result.freshMembers).toContain('henry')
    expect(getLocalGroup()?.members).toContain('henry')
  })

  it('does not set freshMembers when not in a group', async () => {
    const result = await loadSharingCenterUpdates()
    expect(result.freshMembers).toBeUndefined()
  })
})

// ─── Regression: invitation visible on mount (bug fix) ───────────────────────

describe('SharingCenterScreen — invitation visible on mount (regression)', () => {
  it('shows invitation immediately on mount without user action', async () => {
    // This was the bug: invitation state was never populated from localStorage on mount
    setLocalGroupInvitation(makeInvitation({ fromUsername: 'inviter' }))
    renderSharingCenter()

    // Must appear after loading completes, not require any user interaction
    await waitFor(() => {
      expect(screen.queryByText('טוען...')).toBeNull()
      expect(screen.getByText(/inviter/)).toBeTruthy()
    })
  })
})

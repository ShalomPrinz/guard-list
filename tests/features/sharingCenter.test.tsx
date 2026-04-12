/**
 * Tests for SharingCenterScreen and loadSharingCenterUpdates.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { toast } from 'react-toastify'
import SharingCenterScreen from '@/screens/SharingCenterScreen'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import {
  setLocalGroup,
  setLocalGroupInvitation,
  setOutgoingInvitation,
  getLocalGroup,
  getLocalGroupInvitation,
  getOutgoingInvitation,
  loadSharingCenterUpdates,
  acceptGroupInvitation,
} from '@/storage/citationShare'
import { getCitations } from '@/storage/citations'
import { getCitationAuthorLinks } from '@/storage/citationAuthorLinks'
import { upsertGroup } from '@/storage/groups'
import { setUsername } from '@/storage/userStorage'
import type { SharingGroup, GroupInvitation, GuestCitationSubmission } from '@/types'

// ─── react-toastify mock ─────────────────────────────────────────────────────

vi.mock('react-toastify', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
  ToastContainer: () => null,
}))

// ─── Cloud storage mock ───────────────────────────────────────────────────────

const mockKvGet = vi.fn()
const mockKvDel = vi.fn()
const mockKvGroupGetMembers = vi.fn()
const mockKvGroupJoin = vi.fn()
const mockKvListGuestCitationsLatest = vi.fn<(limit?: number) => Promise<GuestCitationSubmission[]>>()
const mockKvDeleteGuestCitation = vi.fn<(id: string) => Promise<void>>()
const mockKvInvitationCancel = vi.fn<(targetUsername: string) => Promise<void>>()

vi.mock('@/storage/cloudStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/storage/cloudStorage')>()
  return {
    ...actual,
    kvGet: (...args: unknown[]) => mockKvGet(...args),
    kvDel: (...args: unknown[]) => mockKvDel(...args),
    kvGroupGetMembers: (...args: unknown[]) => mockKvGroupGetMembers(...args),
    kvGroupJoin: (...args: unknown[]) => mockKvGroupJoin(...args),
    kvListGuestCitationsLatest: (...args: unknown[]) => mockKvListGuestCitationsLatest(...(args as [number | undefined])),
    kvDeleteGuestCitation: (...args: unknown[]) => mockKvDeleteGuestCitation(...(args as [string])),
    kvInvitationCancel: (...args: unknown[]) => mockKvInvitationCancel(...(args as [string])),
    kvGroupLeave: vi.fn().mockResolvedValue(undefined),
    kvCrossSet: vi.fn().mockResolvedValue('ok'),
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
  mockKvGroupJoin.mockResolvedValue('ok')
  mockKvListGuestCitationsLatest.mockResolvedValue([])
  mockKvDeleteGuestCitation.mockResolvedValue(undefined)
  mockKvInvitationCancel.mockResolvedValue(undefined)
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
      expect(screen.getByText('אינך חלק מקבוצת שיתוף ציטוטים')).toBeTruthy()
    })
  })

  it('shows invite button in not-in-group state', async () => {
    renderSharingCenter()
    await waitFor(() => {
      expect(screen.getByText('הזמן חבר לשיתוף אוסף ציטוטים')).toBeTruthy()
    })
  })
})

// ─── Pending invitation on mount ─────────────────────────────────────────────

describe('SharingCenterScreen — pending invitation on mount', () => {
  it('shows pending invitation card when invitation exists in localStorage and KV', async () => {
    const inv = makeInvitation({ fromUsername: 'alice' })
    setLocalGroupInvitation(inv)
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:groupInvitation') return Promise.resolve(inv)
      return Promise.resolve(null)
    })
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

    // ConfirmDialog confirm button is "עזיבה" for leave group action
    await user.click(screen.getByRole('button', { name: 'עזיבה' }))

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

  it('returns autoLeftLoneGroup and clears local group when user is the sole remaining member', async () => {
    setLocalGroup(makeGroup({ groupId: 'g1', members: ['currentuser', 'bob'] }))
    // KV shows only currentuser remains
    mockKvGroupGetMembers.mockResolvedValue(['currentuser'])

    const result = await loadSharingCenterUpdates()

    expect(result.autoLeftLoneGroup).toBe(true)
    expect(getLocalGroup()).toBeNull()
  })
})

// ─── Auto-left lone group ─────────────────────────────────────────────────────

describe('SharingCenterScreen — auto-left lone group', () => {
  it('shows "מצטערים, נשארת לבד" banner when user is the last member', async () => {
    setLocalGroup(makeGroup({ groupId: 'g1', members: ['currentuser', 'bob'] }))
    // KV returns only current user — everyone else left
    mockKvGroupGetMembers.mockResolvedValue(['currentuser'])
    renderSharingCenter()

    await waitFor(() => {
      expect(screen.getByText(/נשארת לבד בקבוצת השיתוף/)).toBeTruthy()
    })
  })

  it('does not show group section after auto-leave', async () => {
    setLocalGroup(makeGroup({ groupId: 'g1', members: ['currentuser', 'bob'] }))
    mockKvGroupGetMembers.mockResolvedValue(['currentuser'])
    renderSharingCenter()

    await waitFor(() => {
      expect(screen.queryByText('עזוב קבוצה')).toBeNull()
    })
  })
})

// ─── Regression: invitation visible on mount (bug fix) ───────────────────────

describe('SharingCenterScreen — invitation visible on mount (regression)', () => {
  it('shows invitation immediately on mount without user action', async () => {
    // This was the bug: invitation state was never populated from localStorage on mount
    const inv = makeInvitation({ fromUsername: 'inviter' })
    setLocalGroupInvitation(inv)
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:groupInvitation') return Promise.resolve(inv)
      return Promise.resolve(null)
    })
    renderSharingCenter()

    // Must appear after loading completes, not require any user interaction
    await waitFor(() => {
      expect(screen.queryByText('טוען...')).toBeNull()
      expect(screen.getByText(/inviter/)).toBeTruthy()
    })
  })
})

// ─── Fix: Invitation acceptance state sync (bug fix) ──────────────────────────

describe('SharingCenterScreen — invitation acceptance state sync (bug fix)', () => {
  it('button always shows "אשר" (no "מעבד..." message) — does not render loading text', async () => {
    const inv = makeInvitation({ fromUsername: 'alice' })
    setLocalGroupInvitation(inv)
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:groupInvitation') return Promise.resolve(inv)
      return Promise.resolve(null)
    })
    mockKvGroupGetMembers.mockResolvedValue(['currentuser', 'alice'])

    renderSharingCenter()

    await waitFor(() => screen.getByText(/alice/))
    const acceptButton = screen.getByRole('button', { name: 'אשר' })

    // Button text should be exactly "אשר", never "מעבד..."
    expect(acceptButton.textContent).toBe('אשר')
  })

  it('invitation card disappears and group card appears with fresh members after acceptance', async () => {
    const user = userEvent.setup()
    const inv = makeInvitation({ fromUsername: 'alice' })
    setLocalGroupInvitation(inv)

    // kvGet('share:groupInvitation') is called 3 times total:
    //   call #1 — mount loadSharingCenterUpdates (local + remote both exist → no action)
    //   call #2 — acceptGroupInvitation guard (remote exists → proceed with join)
    //   call #3 — post-accept loadSharingCenterUpdates (local is now null, remote null → no cancellation)
    let groupInvCallCount = 0
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:groupInvitation') {
        groupInvCallCount++
        return Promise.resolve(groupInvCallCount <= 2 ? inv : null)
      }
      return Promise.resolve(null)
    })
    mockKvGroupGetMembers.mockResolvedValue(['currentuser', 'alice'])

    renderSharingCenter()

    await waitFor(() => screen.getByRole('button', { name: 'אשר' }))
    await user.click(screen.getByRole('button', { name: 'אשר' }))

    await waitFor(() => {
      // Invitation card must be gone
      expect(screen.queryByRole('button', { name: 'דחה' })).toBeNull()
      // Group card must appear with fresh members
      expect(screen.getByText('קבוצת שיתוף ציטוטים')).toBeTruthy()
      expect(screen.getByText('alice')).toBeTruthy()
    })
  })
})

// ─── Decline invitation immediately updates UI ────────────────────────────────

describe('SharingCenterScreen — decline invitation immediately updates UI', () => {
  it('invitation card disappears and not-in-group section appears after declining', async () => {
    // Regression: accept showed nothing because loadSharingCenterUpdates re-added the invitation.
    // Decline must also immediately update the UI without requiring any extra KV round-trip.
    const user = userEvent.setup()
    const inv = makeInvitation({ fromUsername: 'inviter' })
    setLocalGroupInvitation(inv)
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:groupInvitation') return Promise.resolve(inv)
      return Promise.resolve(null)
    })

    renderSharingCenter()

    await waitFor(() => screen.getByRole('button', { name: 'דחה' }))
    await user.click(screen.getByRole('button', { name: 'דחה' }))

    await waitFor(() => {
      // Invitation card must be gone
      expect(screen.queryByRole('button', { name: 'דחה' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'אשר' })).toBeNull()
      // Not-in-group section must appear
      expect(screen.getByText('אינך חלק מקבוצת שיתוף ציטוטים')).toBeTruthy()
    })
  })
})

// ─── Guest link section ───────────────────────────────────────────────────────

function makeSubmission(id: string, overrides: Partial<GuestCitationSubmission> = {}): GuestCitationSubmission {
  return { id, text: `submission-text-${id}`, author: `מחבר-${id}`, submittedAt: 1700000000000, ...overrides }
}

describe('SharingCenterScreen — guest link section', () => {
  it('shows "העתק קישור" and "שתף בוואטסאפ" buttons', async () => {
    renderSharingCenter()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '📋 העתק קישור' })).toBeTruthy()
      expect(screen.getByRole('button', { name: '📤 שתף בוואטסאפ' })).toBeTruthy()
    })
  })

  it('"העתק קישור" calls clipboard.writeText with correct URL', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderSharingCenter()

    await waitFor(() => screen.getByRole('button', { name: '📋 העתק קישור' }))
    await user.click(screen.getByRole('button', { name: '📋 העתק קישור' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('/guest/currentuser'),
      )
    })
  })

  it('"העתק קישור" shows "הועתק!" after clipboard write', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    renderSharingCenter()

    await waitFor(() => screen.getByRole('button', { name: '📋 העתק קישור' }))
    await user.click(screen.getByRole('button', { name: '📋 העתק קישור' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '✓ הועתק!' })).toBeTruthy()
    })
  })
})

// ─── Guest citations inbox ────────────────────────────────────────────────────

describe('SharingCenterScreen — guest inbox', () => {
  it('shows "ציטוטים ממבקרים" button', async () => {
    renderSharingCenter()
    await waitFor(() => {
      expect(screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס')).toBeTruthy()
    })
  })

  it('opens inbox modal and shows loading state', async () => {
    const user = userEvent.setup()
    let resolve!: (v: GuestCitationSubmission[]) => void
    // openInbox call stays pending to observe loading state
    mockKvListGuestCitationsLatest.mockReturnValueOnce(new Promise(r => { resolve = r }))
    renderSharingCenter()

    await waitFor(() => screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))
    await user.click(screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))

    expect(screen.getByText('טוען...')).toBeTruthy()
    resolve([])
  })

  it('shows "אין ציטוטים ממתינים" when inbox is empty', async () => {
    const user = userEvent.setup()
    renderSharingCenter()

    await waitFor(() => screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))
    await user.click(screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))

    await waitFor(() => {
      expect(screen.getByText('אין ציטוטים ממתינים')).toBeTruthy()
    })
  })

  it('shows pending submissions in the inbox', async () => {
    const user = userEvent.setup()
    mockKvListGuestCitationsLatest.mockResolvedValue([
      makeSubmission('s1', { text: 'ציטוט מהמבקר', author: 'אורח' }),
    ])
    renderSharingCenter()

    await waitFor(() => screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))
    await user.click(screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))

    await waitFor(() => {
      expect(screen.getByText('ציטוט מהמבקר')).toBeTruthy()
      expect(screen.getByText('— אורח')).toBeTruthy()
    })
  })

  it('shows "קבל הכל" only when more than one submission', async () => {
    const user = userEvent.setup()
    mockKvListGuestCitationsLatest.mockResolvedValue([
      makeSubmission('s1'),
      makeSubmission('s2'),
    ])
    renderSharingCenter()

    await waitFor(() => screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))
    await user.click(screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))

    await waitFor(() => {
      expect(screen.getByText('קבל הכל')).toBeTruthy()
    })
  })

  it('does not show "קבל הכל" when only one submission', async () => {
    const user = userEvent.setup()
    mockKvListGuestCitationsLatest.mockResolvedValue([makeSubmission('s1')])
    renderSharingCenter()

    await waitFor(() => screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))
    await user.click(screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))

    await waitFor(() => {
      expect(screen.queryByText('קבל הכל')).toBeNull()
    })
  })

  it('reject removes submission from list and calls kvDeleteGuestCitation', async () => {
    const user = userEvent.setup()
    mockKvListGuestCitationsLatest.mockResolvedValue([
      makeSubmission('s1', { text: 'ציטוט לדחייה' }),
    ])
    renderSharingCenter()

    await waitFor(() => screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))
    await user.click(screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))

    await waitFor(() => screen.getByText('ציטוט לדחייה'))
    await user.click(screen.getByText('דחה'))

    await waitFor(() => {
      expect(screen.queryByText('ציטוט לדחייה')).toBeNull()
      expect(screen.getByText('אין ציטוטים ממתינים')).toBeTruthy()
    })
    expect(mockKvDeleteGuestCitation).toHaveBeenCalledWith('s1')
  })

  it('accept shows accept panel with אשר and ביטול buttons', async () => {
    const user = userEvent.setup()
    mockKvListGuestCitationsLatest.mockResolvedValue([makeSubmission('s1')])
    renderSharingCenter()

    await waitFor(() => screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))
    await user.click(screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))

    await waitFor(() => screen.getByText('קבל'))
    await user.click(screen.getByText('קבל'))

    expect(screen.getByText('אשר')).toBeTruthy()
    expect(screen.getByText('ביטול')).toBeTruthy()
  })

  it('ביטול in accept panel collapses without changes', async () => {
    const user = userEvent.setup()
    mockKvListGuestCitationsLatest.mockResolvedValue([makeSubmission('s1', { text: 'test-text' })])
    renderSharingCenter()

    await waitFor(() => screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))
    await user.click(screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))

    await waitFor(() => screen.getByText('קבל'))
    await user.click(screen.getByText('קבל'))
    await user.click(screen.getByText('ביטול'))

    await waitFor(() => {
      expect(screen.getByText('test-text')).toBeTruthy()
      expect(screen.queryByText('אשר')).toBeNull()
    })
    expect(getCitations()).toHaveLength(0)
  })

  it('אשר saves citation to localStorage and removes from inbox', async () => {
    const user = userEvent.setup()
    mockKvListGuestCitationsLatest.mockResolvedValue([
      makeSubmission('s1', { text: 'ציטוט שהתקבל', author: 'מחבר א' }),
    ])
    renderSharingCenter()

    await waitFor(() => screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))
    await user.click(screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))

    await waitFor(() => screen.getByText('קבל'))
    await user.click(screen.getByText('קבל'))
    await user.click(screen.getByText('אשר'))

    await waitFor(() => {
      const saved = getCitations()
      expect(saved).toHaveLength(1)
      expect(saved[0].text).toBe('ציטוט שהתקבל')
      expect(saved[0].author).toBe('מחבר א')
      expect(screen.getByText('אין ציטוטים ממתינים')).toBeTruthy()
    })
    expect(mockKvDeleteGuestCitation).toHaveBeenCalledWith('s1')
  })

  it('אשר with member link saves author link', async () => {
    const user = userEvent.setup()
    upsertGroup({
      id: 'g1', name: 'מחלקה', createdAt: new Date().toISOString(),
      members: [{ id: 'm1', name: 'יוסי ישראלי', availability: 'base' }],
    })
    mockKvListGuestCitationsLatest.mockResolvedValue([
      makeSubmission('s1', { text: 'ציטוט', author: 'מחבר' }),
    ])
    renderSharingCenter()

    await waitFor(() => screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))
    await user.click(screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))

    await waitFor(() => screen.getByText('קבל'))
    await user.click(screen.getByText('קבל'))

    const select = screen.getByRole('combobox')
    await user.selectOptions(select, 'm1')
    await user.click(screen.getByText('אשר'))

    await waitFor(() => {
      const links = getCitationAuthorLinks()
      expect(links['מחבר']).toBe('m1')
    })
  })

  it('קבל הכל accepts all submissions and clears inbox', async () => {
    const user = userEvent.setup()
    mockKvListGuestCitationsLatest.mockResolvedValue([
      makeSubmission('s1', { text: 'ציטוט 1' }),
      makeSubmission('s2', { text: 'ציטוט 2' }),
    ])
    renderSharingCenter()

    await waitFor(() => screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))
    await user.click(screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))

    await waitFor(() => screen.getByText('קבל הכל'))
    await user.click(screen.getByText('קבל הכל'))

    await waitFor(() => {
      expect(getCitations()).toHaveLength(2)
      expect(screen.getByText('אין ציטוטים ממתינים')).toBeTruthy()
    })
    expect(mockKvDeleteGuestCitation).toHaveBeenCalledWith('s1')
    expect(mockKvDeleteGuestCitation).toHaveBeenCalledWith('s2')
  })

  it('badge count shows pending submissions count after opening inbox', async () => {
    const user = userEvent.setup()
    mockKvListGuestCitationsLatest.mockResolvedValue([
      makeSubmission('s1'),
      makeSubmission('s2'),
      makeSubmission('s3'),
    ])
    renderSharingCenter()

    await waitFor(() => screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))
    // Badge does not show before inbox is opened (lazy load)
    expect(screen.queryByText('3')).toBeNull()

    await user.click(screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))

    await waitFor(() => {
      expect(screen.getByText('3')).toBeTruthy()
    })
  })
})

// ─── loadSharingCenterUpdates — invitation delivery and cancellation ───────────

describe('loadSharingCenterUpdates — invitation delivery', () => {
  it('saves invitation to localStorage when local is empty but KV has one', async () => {
    const inv = makeInvitation({ fromUsername: 'inviter' })
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:groupInvitation') return Promise.resolve(inv)
      return Promise.resolve(null)
    })

    await loadSharingCenterUpdates()

    expect(getLocalGroupInvitation()).toEqual(inv)
  })

  it('does not overwrite existing local invitation when KV also has one', async () => {
    const localInv = makeInvitation({ fromUsername: 'inviter', sentAt: 1000 })
    setLocalGroupInvitation(localInv)
    const kvInv = makeInvitation({ fromUsername: 'inviter', sentAt: 2000 })
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:groupInvitation') return Promise.resolve(kvInv)
      return Promise.resolve(null)
    })

    await loadSharingCenterUpdates()

    // Local invitation unchanged — no overwrite when both exist
    expect(getLocalGroupInvitation()?.sentAt).toBe(1000)
  })

  it('clears local invitation and returns invitationCancelledBy when KV key is gone', async () => {
    setLocalGroupInvitation(makeInvitation({ fromUsername: 'inviter' }))
    mockKvGet.mockResolvedValue(null) // KV returns null — invitation was cancelled

    const result = await loadSharingCenterUpdates()

    expect(getLocalGroupInvitation()).toBeNull()
    expect(result.invitationCancelledBy).toBe('inviter')
  })

  it('does not set invitationCancelledBy when no local invitation and KV is also empty', async () => {
    mockKvGet.mockResolvedValue(null)

    const result = await loadSharingCenterUpdates()

    expect(result.invitationCancelledBy).toBeUndefined()
  })
})

// ─── acceptGroupInvitation — stale invitation guard ──────────────────────────

describe('acceptGroupInvitation — stale guard', () => {
  it('returns "cancelled" and clears local invitation when KV key is already gone', async () => {
    setLocalGroupInvitation(makeInvitation({ fromUsername: 'inviter' }))
    mockKvGet.mockResolvedValue(null) // KV invitation gone

    const result = await acceptGroupInvitation(makeInvitation())

    expect(result).toBe('cancelled')
    expect(getLocalGroupInvitation()).toBeNull()
  })

  it('returns "ok" when KV invitation exists and join succeeds', async () => {
    const inv = makeInvitation()
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:groupInvitation') return Promise.resolve(inv)
      return Promise.resolve(null)
    })
    mockKvGroupGetMembers.mockResolvedValue(['currentuser', 'alice'])

    const result = await acceptGroupInvitation(inv)

    expect(result).toBe('ok')
  })
})

// ─── Cancel outgoing invitation ───────────────────────────────────────────────

describe('SharingCenterScreen — cancel outgoing invitation', () => {
  it('calls kvInvitationCancel and clears outgoing invitation on "בטל" click', async () => {
    const user = userEvent.setup()
    setLocalGroup(makeGroup())
    setOutgoingInvitation({ toUsername: 'charlie', groupId: 'group-1', sentAt: Date.now() })
    renderSharingCenter()

    await waitFor(() => screen.getByText('בטל'))
    await user.click(screen.getByText('בטל'))

    await waitFor(() => {
      expect(mockKvInvitationCancel).toHaveBeenCalledWith('charlie')
      expect(screen.queryByText(/charlie/)).toBeNull()
    })
  })
})

// ─── Accept invitation error handling ────────────────────────────────────────

describe('SharingCenterScreen — accept invitation error handling', () => {
  it('shows Hebrew error toast when acceptGroupInvitation returns "error"', async () => {
    const user = userEvent.setup()
    const inv = makeInvitation({ fromUsername: 'alice' })
    setLocalGroupInvitation(inv)

    // KV invitation exists on load, but kvGroupJoin fails → acceptGroupInvitation returns 'error'
    mockKvGroupJoin.mockResolvedValue('error')
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:groupInvitation') return Promise.resolve(inv)
      return Promise.resolve(null)
    })

    renderSharingCenter()

    await waitFor(() => screen.getByRole('button', { name: 'אשר' }))
    await user.click(screen.getByRole('button', { name: 'אשר' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('שגיאה בהצטרפות לקבוצה — נסה שוב')
    })
    // Accept button must still be visible (not disabled) so user can retry
    expect(screen.getByRole('button', { name: 'אשר' }).hasAttribute('disabled')).toBe(false)
  })

  it('fires toast.error on first fail and toast is not re-fired unless clicked again', async () => {
    const user = userEvent.setup()
    const inv = makeInvitation({ fromUsername: 'alice' })
    setLocalGroupInvitation(inv)

    // First call: fail; second call: succeed → join works
    mockKvGroupJoin.mockResolvedValueOnce('error').mockResolvedValueOnce('ok')
    mockKvGroupGetMembers.mockResolvedValue(['currentuser', 'alice'])
    let invCallCount = 0
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:groupInvitation') {
        invCallCount++
        return Promise.resolve(invCallCount <= 3 ? inv : null)
      }
      return Promise.resolve(null)
    })

    renderSharingCenter()

    await waitFor(() => screen.getByRole('button', { name: 'אשר' }))
    await user.click(screen.getByRole('button', { name: 'אשר' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('שגיאה בהצטרפות לקבוצה — נסה שוב')
    })
    expect(toast.error).toHaveBeenCalledTimes(1)

    // Click again — succeeds, no additional error toast
    await user.click(screen.getByRole('button', { name: 'אשר' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'אשר' })).toBeNull()
    })
    expect(toast.error).toHaveBeenCalledTimes(1)
  })
})

// ─── Cancelled invitation banner ─────────────────────────────────────────────

describe('SharingCenterScreen — cancelled invitation banner', () => {
  it('shows error banner when accepting an invitation that was cancelled between load and accept', async () => {
    const user = userEvent.setup()
    const inv = makeInvitation({ fromUsername: 'inviter' })
    setLocalGroupInvitation(inv)
    // On load (loadSharingCenterUpdates): KV has invitation → card shows
    // On accept (acceptGroupInvitation): KV returns null → inviter cancelled in between
    let invCallCount = 0
    mockKvGet.mockImplementation((key: string) => {
      if (key === 'share:groupInvitation') {
        invCallCount++
        return Promise.resolve(invCallCount === 1 ? inv : null)
      }
      return Promise.resolve(null)
    })

    renderSharingCenter()

    await waitFor(() => screen.getByText('אשר'))
    await user.click(screen.getByText('אשר'))

    await waitFor(() => {
      expect(screen.getByText(/המשתמש "inviter" ביטל את ההזמנה לקבוצה שלו/)).toBeTruthy()
    })
  })
})

// ─── Guest citation acceptance attribution ────────────────────────────────────

describe('SharingCenterScreen — guest citation createdByUsername attribution', () => {
  it('handleAcceptOne saves citation with createdByUsername equal to current username', async () => {
    const user = userEvent.setup()
    mockKvListGuestCitationsLatest.mockResolvedValue([
      makeSubmission('s1', { text: 'ציטוט חשוב', author: 'אורח א' }),
    ])
    renderSharingCenter()

    await waitFor(() => screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))
    await user.click(screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))

    await waitFor(() => screen.getByText('קבל'))
    await user.click(screen.getByText('קבל'))
    await user.click(screen.getByText('אשר'))

    await waitFor(() => {
      const saved = getCitations()
      expect(saved).toHaveLength(1)
      expect(saved[0].createdByUsername).toBe('currentuser')
    })
  })

  it('handleAcceptAll saves all citations with createdByUsername equal to current username', async () => {
    const user = userEvent.setup()
    mockKvListGuestCitationsLatest.mockResolvedValue([
      makeSubmission('s1', { text: 'ציטוט 1', author: 'אורח א' }),
      makeSubmission('s2', { text: 'ציטוט 2', author: 'אורח ב' }),
    ])
    renderSharingCenter()

    await waitFor(() => screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))
    await user.click(screen.getByText('לבחירת ציטוטים שהתקבלו מהטופס'))

    await waitFor(() => screen.getByText('קבל הכל'))
    await user.click(screen.getByText('קבל הכל'))

    await waitFor(() => {
      const saved = getCitations()
      expect(saved).toHaveLength(2)
      expect(saved.every(c => c.createdByUsername === 'currentuser')).toBe(true)
    })
  })
})

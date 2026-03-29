/**
 * Tests for sync-on-visibility / focus feature in App.tsx.
 * Verifies that syncFromCloud is called when the user returns to the tab
 * (visibilitychange → visible) or the window regains focus, and that
 * incomingShareRequest state is refreshed afterward.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import App from '@/App'

vi.mock('@/storage/syncFromCloud', () => ({
  syncFromCloud: vi.fn().mockResolvedValue(undefined),
  pushLocalToCloud: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/storage/citationShare', () => ({
  getLocalIncomingRequest: vi.fn().mockReturnValue(null),
  acceptShareRequest: vi.fn().mockResolvedValue(undefined),
  declineShareRequest: vi.fn().mockReturnValue(undefined),
}))

import { syncFromCloud } from '@/storage/syncFromCloud'
import { getLocalIncomingRequest } from '@/storage/citationShare'

const mockedSync = vi.mocked(syncFromCloud)
const mockedGetIncoming = vi.mocked(getLocalIncomingRequest)

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  const storage = createLocalStorageMock()
  storage.setItem('username', 'testuser')
  vi.stubGlobal('localStorage', storage)
  vi.clearAllMocks()
  mockedSync.mockResolvedValue(undefined)
  mockedGetIncoming.mockReturnValue(null)
  // Ensure visibilityState starts as 'visible'
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('sync on visibility / focus (App.tsx)', () => {
  it('calls syncFromCloud once on startup when user is logged in', async () => {
    render(<App />)
    await waitFor(() => expect(mockedSync).toHaveBeenCalledOnce())
  })

  it('calls syncFromCloud again when tab becomes visible', async () => {
    render(<App />)
    await waitFor(() => expect(mockedSync).toHaveBeenCalledOnce())

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(mockedSync).toHaveBeenCalledTimes(2))
  })

  it('does NOT call syncFromCloud when tab is hidden', async () => {
    render(<App />)
    await waitFor(() => expect(mockedSync).toHaveBeenCalledOnce())

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Still only the startup call
    expect(mockedSync).toHaveBeenCalledOnce()
  })

  it('calls syncFromCloud when window gains focus', async () => {
    render(<App />)
    await waitFor(() => expect(mockedSync).toHaveBeenCalledOnce())

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => expect(mockedSync).toHaveBeenCalledTimes(2))
  })

  it('does not register visibility/focus listeners when hasUsername is false', async () => {
    // Override localStorage with no username
    const emptyStorage = createLocalStorageMock()
    vi.stubGlobal('localStorage', emptyStorage)

    render(<App />)

    // startup sync never called (no username)
    expect(mockedSync).not.toHaveBeenCalled()

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })

    expect(mockedSync).not.toHaveBeenCalled()
  })

  it('cleans up event listeners on unmount — no more syncs after unmount', async () => {
    const { unmount } = render(<App />)
    await waitFor(() => expect(mockedSync).toHaveBeenCalledOnce())

    unmount()

    const callCount = mockedSync.mock.calls.length

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })

    expect(mockedSync.mock.calls.length).toBe(callCount)
  })

  it('refreshes incomingShareRequest after visibility sync', async () => {
    const mockRequest = { fromUsername: 'alice' }
    // First call: startup sync → no request yet
    // Second call: visibility sync → request now present
    mockedGetIncoming
      .mockReturnValueOnce(null)   // initial state
      .mockReturnValueOnce(null)   // after startup sync
      .mockReturnValue(mockRequest as ReturnType<typeof getLocalIncomingRequest>)

    const { container } = render(<App />)
    await waitFor(() => expect(mockedSync).toHaveBeenCalledOnce())

    // No modal yet
    expect(container.querySelector('[data-testid="incoming-share-modal"]')).toBeNull()

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(mockedSync).toHaveBeenCalledTimes(2))
    // Modal should now be visible (IncomingShareRequestModal renders when incomingShareRequest is set)
    await waitFor(() => expect(mockedGetIncoming).toHaveBeenCalledTimes(3))
  })
})

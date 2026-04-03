/**
 * Tests for the 24-hour cloud backup suspension after data removal.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { WizardProvider } from '@/context/WizardContext'
import Header from '@/components/Header'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import * as cloudStorage from '@/storage/cloudStorage'
import * as syncFromCloudModule from '@/storage/syncFromCloud'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/storage/cloudStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/storage/cloudStorage')>()
  return {
    ...actual,
    kvClearUserData: vi.fn().mockResolvedValue(undefined),
    kvDel: vi.fn().mockResolvedValue(undefined),
    kvGetNoBackup: vi.fn().mockResolvedValue(false),
    kvGetBackupSuspension: vi.fn().mockResolvedValue(null),
    kvSetBackupSuspension: vi.fn().mockResolvedValue(undefined),
    kvClearBackupSuspension: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('@/storage/syncFromCloud', () => ({
  syncFromCloud: vi.fn().mockResolvedValue(undefined),
  pushLocalToCloud: vi.fn().mockResolvedValue(undefined),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderHeader() {
  return render(
    <WizardProvider>
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    </WizardProvider>,
  )
}

async function openBackupModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText('גיבוי ענן'))
  await screen.findByRole('dialog')
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  const mock = createLocalStorageMock()
  mock.setItem('username', 'testuser')
  vi.stubGlobal('localStorage', mock)
  vi.mocked(cloudStorage.kvClearUserData).mockClear()
  vi.mocked(cloudStorage.kvDel).mockClear()
  vi.mocked(cloudStorage.kvGetBackupSuspension).mockResolvedValue(null)
  vi.mocked(cloudStorage.kvSetBackupSuspension).mockClear()
  vi.mocked(cloudStorage.kvClearBackupSuspension).mockClear()
  vi.mocked(syncFromCloudModule.syncFromCloud).mockClear()
  vi.mocked(syncFromCloudModule.pushLocalToCloud).mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Cloud Backup Suspension', () => {
  it('calls kvSetBackupSuspension with a timestamp ~24h from now after handleRemoveBackup', async () => {
    const user = userEvent.setup()
    renderHeader()
    await openBackupModal(user)
    await user.click(screen.getByText('הסר גיבוי'))
    await user.click(screen.getByText('מחיקה'))

    await waitFor(() => {
      expect(vi.mocked(cloudStorage.kvSetBackupSuspension)).toHaveBeenCalledOnce()
    })
    const [until] = vi.mocked(cloudStorage.kvSetBackupSuspension).mock.calls[0]
    const expectedUntil = Date.now() + 24 * 60 * 60 * 1000
    expect(until).toBeGreaterThan(expectedUntil - 5000)
    expect(until).toBeLessThan(expectedUntil + 5000)
  })

  it('disables "חדש גיבוי" and shows suspension message when KV returns a future timestamp', async () => {
    const user = userEvent.setup()
    const futureTs = Date.now() + 12 * 60 * 60 * 1000 // 12 hours from now
    vi.mocked(cloudStorage.kvGetBackupSuspension).mockResolvedValue(futureTs)
    localStorage.setItem('noBackup', '1')

    renderHeader()
    await openBackupModal(user)

    // Button should be disabled
    await waitFor(() => {
      expect(screen.getByText('חדש גיבוי').closest('button')).toHaveProperty('disabled', true)
    })
    // Suspension message should be visible
    expect(screen.getByText(/גיבוי מושהה/)).toBeTruthy()
    expect(screen.getByText(/שעות/)).toBeTruthy()
  })

  it('enables "חדש גיבוי" and shows no suspension message when KV returns null', async () => {
    const user = userEvent.setup()
    vi.mocked(cloudStorage.kvGetBackupSuspension).mockResolvedValue(null)
    localStorage.setItem('noBackup', '1')

    renderHeader()
    await openBackupModal(user)

    await waitFor(() => {
      expect(screen.getByText('חדש גיבוי').closest('button')).toHaveProperty('disabled', false)
    })
    expect(screen.queryByText(/גיבוי מושהה/)).toBeNull()
  })

  it('"הסר גיבוי" is never blocked regardless of suspension state', async () => {
    const user = userEvent.setup()
    const futureTs = Date.now() + 12 * 60 * 60 * 1000
    vi.mocked(cloudStorage.kvGetBackupSuspension).mockResolvedValue(futureTs)
    // noBackup not set — backup is active, suspension shouldn't block removal

    renderHeader()
    await openBackupModal(user)

    const removeButton = screen.getByText('הסר גיבוי').closest('button')
    expect(removeButton).toHaveProperty('disabled', false)
    await user.click(screen.getByText('הסר גיבוי'))
    // ConfirmDialog should appear
    expect(screen.getByText('למחוק את הגיבוי בענן? הנתונים יישארו במכשיר זה.')).toBeTruthy()
    await user.click(screen.getByText('מחיקה'))
    await waitFor(() => {
      expect(vi.mocked(cloudStorage.kvClearUserData)).toHaveBeenCalledOnce()
    })
  })

  it('calls kvClearBackupSuspension after successful re-enable', async () => {
    const user = userEvent.setup()
    vi.mocked(cloudStorage.kvGetBackupSuspension).mockResolvedValue(null)
    localStorage.setItem('noBackup', '1')

    renderHeader()
    await openBackupModal(user)

    await waitFor(() => {
      expect(screen.getByText('חדש גיבוי').closest('button')).toHaveProperty('disabled', false)
    })

    await user.click(screen.getByText('חדש גיבוי'))
    await waitFor(() => {
      expect(vi.mocked(cloudStorage.kvClearBackupSuspension)).toHaveBeenCalledOnce()
    })
  })

  it('SECURITY: suspension is enforced even when client Date.now() is overridden to bypass it', async () => {
    const user = userEvent.setup()
    const futureTs = Date.now() + 12 * 60 * 60 * 1000
    // Server says suspended regardless of what the client clock says
    vi.mocked(cloudStorage.kvGetBackupSuspension).mockResolvedValue(futureTs)
    // Override Date.now to be MAX_SAFE_INTEGER — in old code this would bypass the check
    vi.spyOn(Date, 'now').mockReturnValue(Number.MAX_SAFE_INTEGER)
    localStorage.setItem('noBackup', '1')

    renderHeader()
    await openBackupModal(user)

    // Button must still be disabled — server answer wins
    await waitFor(() => {
      expect(screen.getByText('חדש גיבוי').closest('button')).toHaveProperty('disabled', true)
    })
    expect(screen.getByText(/גיבוי מושהה/)).toBeTruthy()
  })

  it('handleReenableBackup returns early without re-enabling when KV shows active suspension', async () => {
    const user = userEvent.setup()
    const futureTs = Date.now() + 12 * 60 * 60 * 1000
    // On mount check: no suspension (so button is enabled); on click re-check: suspension active
    vi.mocked(cloudStorage.kvGetBackupSuspension)
      .mockResolvedValueOnce(null) // mount effect
      .mockResolvedValueOnce(futureTs) // guard inside handleReenableBackup
    localStorage.setItem('noBackup', '1')

    renderHeader()
    await openBackupModal(user)

    await waitFor(() => {
      expect(screen.getByText('חדש גיבוי').closest('button')).toHaveProperty('disabled', false)
    })

    await user.click(screen.getByText('חדש גיבוי'))

    // noBackup should still be set — re-enable was blocked
    await waitFor(() => {
      expect(localStorage.getItem('noBackup')).toBe('1')
    })
    expect(vi.mocked(cloudStorage.kvDel)).not.toHaveBeenCalledWith('prefs:noBackup')
  })
})

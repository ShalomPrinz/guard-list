/**
 * Tests for the Cloud Backup modal in the Header.
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

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  const mock = createLocalStorageMock()
  mock.setItem('username', 'testuser')
  vi.stubGlobal('localStorage', mock)
  vi.mocked(cloudStorage.kvClearUserData).mockClear()
  vi.mocked(cloudStorage.kvDel).mockClear()
  vi.mocked(cloudStorage.kvGetNoBackup).mockResolvedValue(false)
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

describe('Cloud Backup Modal', () => {
  it('opens modal on ☁️ button click', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByLabelText('גיבוי ענן'))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText('גיבוי נתונים')).toBeTruthy()
  })

  it('closes modal when × is clicked', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByLabelText('גיבוי ענן'))
    await screen.findByRole('dialog')
    await user.click(screen.getByLabelText('סגור'))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('"הסר גיבוי" shows confirm dialog, then calls kvClearUserData and sets noBackup in localStorage', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByLabelText('גיבוי ענן'))
    await screen.findByRole('dialog')
    await user.click(screen.getByText('הסר גיבוי'))
    // ConfirmDialog appears
    expect(screen.getByText('למחוק את הגיבוי בענן? הנתונים יישארו במכשיר זה.')).toBeTruthy()
    await user.click(screen.getByText('מחיקה'))
    await waitFor(() => {
      expect(vi.mocked(cloudStorage.kvClearUserData)).toHaveBeenCalledOnce()
      expect(localStorage.getItem('noBackup')).toBe('1')
    })
    // Success message shown inside backup modal
    expect(screen.getByText('הגיבוי הוסר')).toBeTruthy()
  })

  it('"הסר גיבוי" cancel keeps modal open without calling kvClearUserData', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByLabelText('גיבוי ענן'))
    await screen.findByRole('dialog')
    await user.click(screen.getByText('הסר גיבוי'))
    await user.click(screen.getByText('ביטול'))
    expect(vi.mocked(cloudStorage.kvClearUserData)).not.toHaveBeenCalled()
    // Backup modal still open
    expect(screen.getByText('גיבוי נתונים')).toBeTruthy()
  })

  it('"סנכרן מהענן" clears synced flag and calls syncFromCloud', async () => {
    const user = userEvent.setup()
    localStorage.setItem('synced', '1')
    renderHeader()
    await user.click(screen.getByLabelText('גיבוי ענן'))
    await screen.findByRole('dialog')
    await user.click(screen.getByText('סנכרן מהענן'))
    await waitFor(() => {
      expect(vi.mocked(syncFromCloudModule.syncFromCloud)).toHaveBeenCalledOnce()
      expect(localStorage.getItem('synced')).toBeNull()
    })
    expect(screen.getByText('הסנכרון הושלם')).toBeTruthy()
  })

  it('"שמור לענן" calls pushLocalToCloud', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByLabelText('גיבוי ענן'))
    await screen.findByRole('dialog')
    await user.click(screen.getByText('שמור לענן'))
    await waitFor(() => {
      expect(vi.mocked(syncFromCloudModule.pushLocalToCloud)).toHaveBeenCalledOnce()
    })
    expect(screen.getByText('הנתונים נשמרו')).toBeTruthy()
  })

  it('"סנכרן מהענן" and "שמור לענן" are disabled when noBackup is set', async () => {
    const user = userEvent.setup()
    localStorage.setItem('noBackup', '1')
    renderHeader()
    await user.click(screen.getByLabelText('גיבוי ענן'))
    await screen.findByRole('dialog')
    expect(screen.getByText('סנכרן מהענן').closest('button')).toHaveProperty('disabled', true)
    expect(screen.getByText('שמור לענן').closest('button')).toHaveProperty('disabled', true)
  })

  it('"חדש גיבוי" appears when noBackup is set, and re-enables backup on click', async () => {
    const user = userEvent.setup()
    localStorage.setItem('noBackup', '1')
    renderHeader()
    await user.click(screen.getByLabelText('גיבוי ענן'))
    await screen.findByRole('dialog')
    expect(screen.getByText('חדש גיבוי')).toBeTruthy()
    await user.click(screen.getByText('חדש גיבוי'))
    await waitFor(() => {
      expect(vi.mocked(cloudStorage.kvDel)).toHaveBeenCalledWith('prefs:noBackup')
      expect(localStorage.getItem('noBackup')).toBeNull()
    })
    // Sync/push buttons should now be enabled
    expect(screen.getByText('סנכרן מהענן').closest('button')).toHaveProperty('disabled', false)
  })
})

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWizard } from '../context/WizardContext'
import { getUsername } from '../storage/userStorage'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import { kvClearUserData, kvDel, kvGetBackupSuspension, kvSetBackupSuspension, kvClearBackupSuspension } from '../storage/cloudStorage'
import { syncFromCloud, pushLocalToCloud } from '../storage/syncFromCloud'

export default function Header() {
  const navigate = useNavigate()
  const { resetSession } = useWizard()
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  )
  const [showBackup, setShowBackup] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [noBackup, setNoBackup] = useState(() => !!localStorage.getItem('noBackup'))
  const [suspendedUntil, setSuspendedUntil] = useState<number | null>(null)

  useEffect(() => {
    if (!noBackup) return
    void kvGetBackupSuspension().then(setSuspendedUntil)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleHome() {
    resetSession()
    navigate('/')
  }

  function toggleTheme() {
    const newIsDark = !isDark
    document.documentElement.classList.toggle('dark', newIsDark)
    localStorage.setItem('theme', newIsDark ? 'dark' : 'light')
    setIsDark(newIsDark)
  }

  function openBackup() {
    setStatusMsg(null)
    setShowBackup(true)
  }

  async function handleRemoveBackup() {
    setShowRemoveConfirm(false)
    setLoading(true)
    await kvClearUserData()
    // Fire-and-forget: must be called before localStorage.setItem('noBackup') so kvSet's guard passes
    void kvSetBackupSuspension(Date.now() + 24 * 60 * 60 * 1000)
    localStorage.setItem('noBackup', '1')
    setNoBackup(true)
    setLoading(false)
    setStatusMsg('הגיבוי הוסר')
  }

  async function handleSyncFromCloud() {
    setLoading(true)
    setStatusMsg(null)
    localStorage.removeItem('synced')
    await syncFromCloud()
    setLoading(false)
    setStatusMsg('הסנכרון הושלם')
  }

  async function handlePushToCloud() {
    setLoading(true)
    setStatusMsg(null)
    await pushLocalToCloud()
    setLoading(false)
    setStatusMsg('הנתונים נשמרו')
  }

  async function handleReenableBackup() {
    // Server-side guard: re-fetch from KV to prevent bypass via React DevTools
    const suspension = await kvGetBackupSuspension()
    if (suspension !== null) return
    localStorage.removeItem('noBackup')
    await kvDel('prefs:noBackup')
    void kvClearBackupSuspension()
    setNoBackup(false)
    setSuspendedUntil(null)
    setStatusMsg(null)
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="mx-auto flex w-full max-w-lg items-center px-4 py-3">
          <button
            onClick={handleHome}
            aria-label="חזרה לדף הבית"
            className="flex flex-1 items-center gap-2.5"
          >
            <img
              src="/app-icon.png"
              alt=""
              className="h-8 w-8 rounded-xl object-cover dark:brightness-0 dark:invert"
            />
            <span className="text-base font-bold text-gray-900 dark:text-gray-100">רשימת שמירה</span>
          </button>
          {getUsername() && (
            <span className="mx-2 text-xs text-gray-400 dark:text-gray-500">
              שלום, {getUsername()}
            </span>
          )}
          <button
            onClick={openBackup}
            aria-label="גיבוי ענן"
            className="min-h-[36px] min-w-[36px] rounded-xl p-2 text-xl active:bg-gray-100 dark:active:bg-gray-800"
          >
            ☁️
          </button>
          <button
            onClick={toggleTheme}
            aria-label={isDark ? 'עבור למצב בהיר' : 'עבור למצב כהה'}
            className="min-h-[36px] min-w-[36px] rounded-xl p-2 text-xl active:bg-gray-100 dark:active:bg-gray-800"
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {showBackup && (
        <Modal onClose={() => setShowBackup(false)} title="גיבוי נתונים" maxWidth="max-w-sm">
          <div className="flex flex-col gap-3">
            {statusMsg && (
              <p className="text-sm font-medium text-green-600 dark:text-green-400">{statusMsg}</p>
            )}
            {loading && (
              <p className="text-sm text-gray-500 dark:text-gray-400">טוען...</p>
            )}

            {noBackup && (
              <>
                <button
                  onClick={handleReenableBackup}
                  disabled={suspendedUntil !== null || loading}
                  className="min-h-[44px] w-full rounded-2xl border border-blue-500 text-sm font-medium text-blue-600 active:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:active:bg-blue-900/20 disabled:opacity-50"
                >
                  חדש גיבוי
                </button>
                {suspendedUntil !== null && (
                  <p className="text-xs text-orange-600 dark:text-orange-400">
                    גיבוי מושהה — ניתן להפעיל מחדש בעוד {Math.ceil((suspendedUntil - Date.now()) / (1000 * 60 * 60))} שעות
                  </p>
                )}
              </>
            )}

            <button
              onClick={handleSyncFromCloud}
              disabled={loading || noBackup}
              className="min-h-[44px] w-full rounded-2xl border border-gray-300 text-sm font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800 disabled:opacity-50"
            >
              סנכרן מהענן
            </button>

            <button
              onClick={handlePushToCloud}
              disabled={loading || noBackup}
              className="min-h-[44px] w-full rounded-2xl border border-gray-300 text-sm font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800 disabled:opacity-50"
            >
              שמור לענן
            </button>

            <button
              onClick={() => setShowRemoveConfirm(true)}
              disabled={loading}
              className="min-h-[44px] w-full rounded-2xl border border-red-500 text-sm font-medium text-red-600 active:bg-red-50 dark:border-red-400 dark:text-red-400 dark:active:bg-red-900/20 disabled:opacity-50"
            >
              הסר גיבוי
            </button>
          </div>
        </Modal>
      )}

      {showRemoveConfirm && (
        <ConfirmDialog
          message="למחוק את הגיבוי בענן? הנתונים יישארו במכשיר זה."
          onConfirm={handleRemoveBackup}
          onCancel={() => setShowRemoveConfirm(false)}
        />
      )}
    </>
  )
}

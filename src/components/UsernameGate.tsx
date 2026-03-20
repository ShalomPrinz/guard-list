import { useState } from 'react'
import { setUsername, getOrCreateDeviceId } from '../storage/userStorage'
import { kvGetRaw, kvSetRaw } from '../storage/cloudStorage'
import { pushLocalToCloud } from '../storage/syncFromCloud'
import { getGroups } from '../storage/groups'
import { getSchedules } from '../storage/schedules'

interface Props {
  onConfirmed: () => void
}

type GateState = 'idle' | 'blocked'

export default function UsernameGate({ onConfirmed }: Props) {
  const [input, setInput] = useState('')
  const [validationError, setValidationError] = useState(false)
  const [gateState, setGateState] = useState<GateState>('idle')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const isLoading = statusMessage !== null

  async function handleConfirm() {
    const trimmed = input.trim()
    if (trimmed.length < 2) {
      setValidationError(true)
      return
    }

    const username = trimmed.toLowerCase()
    const deviceId = getOrCreateDeviceId()
    const deviceKey = `${username}:device`

    setStatusMessage('בודק אם שם המשתמש פנוי...')

    const registered = await kvGetRaw<string>(deviceKey)

    if (registered !== null && registered !== deviceId) {
      setStatusMessage(null)
      setGateState('blocked')
      return
    }

    if (registered === null) {
      setStatusMessage('רושם אותך במערכת...')
      await kvSetRaw(deviceKey, deviceId)
    }

    setUsername(trimmed)

    const hasLocalData = getGroups().length > 0 || getSchedules().length > 0
    if (hasLocalData) {
      setStatusMessage('שומר את הנתונים הקיימים שלך לענן, זה עלול לקחת רגע...')
      await pushLocalToCloud()
    }

    setStatusMessage(null)
    onConfirmed()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') void handleConfirm()
  }

  if (gateState === 'blocked') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-50 px-6 dark:bg-gray-950">
        <div className="w-full max-w-xs rounded-2xl bg-white px-6 py-8 text-center shadow-lg dark:bg-gray-800">
          <p className="mb-2 text-4xl">🔒</p>
          <h2 className="mb-3 text-lg font-bold text-gray-900 dark:text-gray-100">גישה נחסמה</h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            שם המשתמש <strong className="text-gray-900 dark:text-gray-100">{input.trim().toLowerCase()}</strong> כבר פעיל בהתקן אחר.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            כדי לאפשר גישה מהתקן זה, מחק את המפתח{' '}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-700">
              {input.trim().toLowerCase()}:device
            </code>{' '}
            מלוח הבקרה של Upstash / Vercel KV.
          </p>
          <button
            onClick={() => setGateState('idle')}
            className="mt-6 min-h-[44px] w-full rounded-2xl border border-gray-300 py-3 text-sm font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
          >
            חזרה
          </button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-50 px-6 dark:bg-gray-950">
        <div
          className="mb-6 h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 dark:border-gray-700 dark:border-t-blue-400"
          role="status"
          aria-label="טוען"
        />
        <p className="max-w-xs text-center text-base font-medium text-gray-700 dark:text-gray-300">
          {statusMessage}
        </p>
        <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">אנא המתן...</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-50 px-6 dark:bg-gray-950">
      <img
        src="/app-icon.png"
        alt=""
        className="mb-4 h-20 w-20 rounded-2xl object-cover dark:brightness-0 dark:invert"
      />
      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">רשימת שמירה</h1>
      <p className="mb-8 text-center text-sm text-gray-500 dark:text-gray-400">
        הזן שם משתמש כדי לגשת לאפליקציה
      </p>

      <div className="w-full max-w-xs">
        <input
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); setValidationError(false) }}
          onKeyDown={handleKeyDown}
          placeholder="שם משתמש"
          autoFocus
          className="mb-3 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-center text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-900"
        />
        {validationError && (
          <p className="mb-3 text-center text-sm text-red-500 dark:text-red-400">
            שם משתמש חייב להכיל לפחות 2 תווים
          </p>
        )}
        <button
          onClick={() => void handleConfirm()}
          className="min-h-[44px] w-full rounded-2xl bg-blue-600 py-3 text-base font-semibold text-white shadow-lg active:bg-blue-700 dark:bg-blue-500 dark:active:bg-blue-600"
        >
          כניסה
        </button>
      </div>
    </div>
  )
}

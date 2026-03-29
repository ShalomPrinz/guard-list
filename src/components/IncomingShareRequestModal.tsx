import { useState } from 'react'

interface Props {
  fromUsername: string
  onAccept: () => Promise<void>
  onDecline: () => void
}

export default function IncomingShareRequestModal({ fromUsername, onAccept, onDecline }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleAccept() {
    setLoading(true)
    await onAccept()
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" dir="rtl">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
        <h2 className="mb-3 text-lg font-bold text-gray-900 dark:text-gray-100">
          בקשת שיתוף ציטוטים
        </h2>
        <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">
          המשתמש <span className="font-semibold">{fromUsername}</span> מעוניין לשתף איתך את אוסף הציטוטים שלו.
        </p>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          אישור השיתוף יאחד את שני האוספים ויסנכרן אותם בכל כניסה לאפליקציה. מחיקת ציטוט תחול על שני המשתמשים.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={handleAccept}
            disabled={loading}
            className="min-h-[44px] w-full rounded-2xl bg-green-600 text-sm font-semibold text-white active:bg-green-700 disabled:opacity-60 dark:bg-green-700 dark:active:bg-green-800"
          >
            {loading ? 'מעבד...' : 'אשר שיתוף'}
          </button>
          <button
            onClick={onDecline}
            disabled={loading}
            className="min-h-[44px] w-full rounded-2xl bg-red-600 text-sm font-semibold text-white active:bg-red-700 disabled:opacity-60 dark:bg-red-700 dark:active:bg-red-800"
          >
            דחה
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGroupById } from '../storage/groups'
import { upsertSchedule } from '../storage/schedules'
import { useShortListWizard } from '../context/ShortListWizardContext'
import { generateShortListSchedule } from '../logic/shortListGeneration'
import TimePicker from '../components/TimePicker'

export default function ShortListStep2() {
  const navigate = useNavigate()
  const { session, clearSession } = useShortListWizard()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  // Guard: if no session, redirect to home
  useEffect(() => {
    if (!session) {
      navigate('/fallback')
    }
  }, [session, navigate])

  const group = session?.groupId ? getGroupById(session.groupId) : null
  const availableCount = group ? group.members.filter(m => m.availability === 'base').length : 0

  const [startTime, setStartTime] = useState(() => {
    const hour = String(session?.startHour ?? 14).padStart(2, '0')
    return `${hour}:00`
  })
  const [minutesPerWarrior, setMinutesPerWarrior] = useState(session?.minutesPerWarrior ?? 60)
  const [numberOfWarriors, setNumberOfWarriors] = useState(session?.numberOfWarriors ?? 1)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  if (!session) {
    return null
  }

  const startHour = parseInt(startTime.split(':')[0], 10)

  function handleCreate() {
    setError('')

    // Validation
    if (!session?.groupId) {
      setError('קבוצה לא נמצאה')
      return
    }
    if (numberOfWarriors < 1) {
      setError('יש לבחור לפחות חייל אחד')
      return
    }
    if (numberOfWarriors > availableCount) {
      setError(`יש בחירת עד ${availableCount} חיילים זמינים`)
      return
    }

    setIsLoading(true)
    const schedule = generateShortListSchedule(
      session.groupId,
      session.stations,
      startHour,
      minutesPerWarrior,
      numberOfWarriors,
    )

    if (!schedule) {
      setError('שגיאה בהוצאת הרשימה. בדוק שיש מספיק חיילים זמינים.')
      setIsLoading(false)
      return
    }

    // Save schedule to localStorage
    upsertSchedule(schedule)

    // Clear session and navigate to result
    clearSession()
    navigate(`/schedule/${schedule.id}/result`)
  }

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-gray-100">הגדרת רשימה קצרה</h1>

      {/* Start Time */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          שעת התחלה
        </label>
        <TimePicker
          value={startTime}
          onChange={setStartTime}
        />
      </div>

      {/* Minutes Per Warrior */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          זמן שמירה לחייל (דקות)
        </label>
        <input
          type="number"
          min={1}
          max={999}
          value={minutesPerWarrior}
          onChange={e => {
            const val = Math.max(1, parseInt(e.target.value, 10))
            setMinutesPerWarrior(isNaN(val) ? 60 : val)
          }}
          className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
        />
      </div>

      {/* Number of Warriors */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          מספר חיילים
        </label>
        <input
          type="number"
          min={1}
          max={availableCount}
          value={numberOfWarriors}
          onChange={e => {
            const val = Math.max(1, Math.min(availableCount, parseInt(e.target.value, 10)))
            setNumberOfWarriors(isNaN(val) ? 1 : val)
          }}
          className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-900/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={() => {
            clearSession()
            navigate('/')
          }}
          className="flex-1 rounded-2xl border border-gray-300 py-3 text-sm font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
        >
          ← ביטול
        </button>
        <button
          onClick={handleCreate}
          disabled={isLoading}
          className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50 active:bg-blue-700"
        >
          {isLoading ? 'יוצר...' : 'יצור רשימה'}
        </button>
      </div>
    </div>
  )
}

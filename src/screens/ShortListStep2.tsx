import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGroupById } from '../storage/groups'
import { upsertSchedule } from '../storage/schedules'
import { useShortListWizard } from '../context/ShortListWizardContext'
import { generateShortListSchedule } from '../logic/shortListGeneration'
import TimePicker from '../components/TimePicker'

export default function ShortListStep2() {
  const navigate = useNavigate()
  const { session, clearSession, setStartHour: setContextStartHour, setMinutesPerWarrior: setContextMinutesPerWarrior, setNumberOfWarriors: setContextNumberOfWarriors } = useShortListWizard()

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

  const startHour = session?.startHour ?? 14
  const minutesPerWarrior = session?.minutesPerWarrior ?? 60
  const numberOfWarriors = session?.numberOfWarriors ?? 1
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const startTime = `${String(startHour).padStart(2, '0')}:00`

  function handleSetStartTime(time: string) {
    const hour = parseInt(time.split(':')[0], 10)
    setContextStartHour(hour)
  }

  function handleSetMinutesPerWarrior(minutes: number) {
    const val = Math.max(1, parseInt(String(minutes), 10))
    setContextMinutesPerWarrior(isNaN(val) ? 60 : val)
  }

  function handleSetNumberOfWarriors(count: number) {
    const val = Math.max(1, Math.min(availableCount, parseInt(String(count), 10)))
    setContextNumberOfWarriors(isNaN(val) ? 1 : val)
  }

  if (!session) {
    return null
  }

  function handleCreate() {
    setError('')

    // Validation
    if (!session?.groupId) {
      setError('קבוצה לא נמצאה')
      return
    }
    if (numberOfWarriors < 1) {
      setError('יש לבחור לפחות חייל אחד לעמדה')
      return
    }
    const totalWarriors = numberOfWarriors * session.stations.length
    if (totalWarriors > availableCount) {
      setError(`סך הכל ${totalWarriors} חיילים נדרשים, אבל רק ${availableCount} זמינים`)
      return
    }

    setIsLoading(true)
    const schedule = generateShortListSchedule(
      session.groupId,
      session.stations,
      startHour,
      minutesPerWarrior,
      numberOfWarriors,
      session.name,
    )

    if (!schedule) {
      setError('שגיאה בהוצאת הרשימה. בדוק שיש מספיק חיילים זמינים.')
      setIsLoading(false)
      return
    }

    // Save schedule to localStorage
    upsertSchedule(schedule)

    // Navigate to result — do NOT clear session here, it must survive for back button
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
          onChange={handleSetStartTime}
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
          onChange={e => handleSetMinutesPerWarrior(parseInt(e.target.value, 10))}
          className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
        />
      </div>

      {/* Number of Warriors Per Station */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          מספר חיילים לעמדה
        </label>
        <input
          type="number"
          min={1}
          max={availableCount}
          value={numberOfWarriors}
          onChange={e => handleSetNumberOfWarriors(parseInt(e.target.value, 10))}
          className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
        />
        {session?.stations.length ? (
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            סך הכל: {numberOfWarriors * session.stations.length} חיילים
          </p>
        ) : null}
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

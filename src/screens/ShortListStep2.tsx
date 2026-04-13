import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGroupById } from '../storage/groups'
import { upsertSchedule } from '../storage/schedules'
import { recordShift } from '../storage/statistics'
import { useShortListWizard } from '../context/ShortListWizardContext'
import { generateShortListSchedule } from '../logic/shortListGeneration'
import TimePicker from '../components/TimePicker'

export default function ShortListStep2() {
  const navigate = useNavigate()
  const { session, clearSession, setStartTime: setContextStartTime, setMinutesPerWarrior: setContextMinutesPerWarrior, setNumberOfWarriors: setContextNumberOfWarriors } = useShortListWizard()

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
  const startMinute = session?.startMinute ?? 0
  const [minutesPerWarriorStr, setMinutesPerWarriorStr] = useState(String(session?.minutesPerWarrior ?? 60))
  const [numberOfWarriorsStr, setNumberOfWarriorsStr] = useState(String(session?.numberOfWarriors ?? 1))
  const [minutesError, setMinutesError] = useState('')
  const [numberOfWarriorsError, setNumberOfWarriorsError] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const startTime = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`

  function handleSetStartTime(time: string) {
    const parts = time.split(':')
    const hour = parseInt(parts[0], 10)
    const minute = parseInt(parts[1] ?? '0', 10)
    setContextStartTime(hour, minute)
  }

  function handleSetMinutesPerWarrior(raw: string) {
    setMinutesPerWarriorStr(raw)
    const val = parseInt(raw, 10)
    if (!isNaN(val)) {
      setContextMinutesPerWarrior(val)
    }
  }

  function handleSetNumberOfWarriors(raw: string) {
    setNumberOfWarriorsStr(raw)
    const val = parseInt(raw, 10)
    if (!isNaN(val)) {
      setContextNumberOfWarriors(val)
    }
  }

  if (!session) {
    return null
  }

  function handleCreate() {
    setError('')
    setMinutesError('')
    setNumberOfWarriorsError('')

    // Per-field validation
    const parsedMinutes = parseInt(minutesPerWarriorStr, 10)
    const parsedWarriors = parseInt(numberOfWarriorsStr, 10)

    let hasFieldError = false
    if (isNaN(parsedMinutes) || parsedMinutes < 1) {
      setMinutesError('יש להזין זמן שמירה תקין (לפחות דקה אחת)')
      hasFieldError = true
    }
    if (isNaN(parsedWarriors) || parsedWarriors < 1) {
      setNumberOfWarriorsError('יש להזין לפחות חייל אחד לעמדה')
      hasFieldError = true
    } else {
      const totalWarriors = parsedWarriors * (session?.stations.length ?? 1)
      if (totalWarriors > availableCount) {
        setNumberOfWarriorsError(`סך הכל ${totalWarriors} חיילים נדרשים, אבל רק ${availableCount} זמינים`)
        hasFieldError = true
      }
    }
    if (hasFieldError) return

    if (!session?.groupId) {
      setError('קבוצה לא נמצאה')
      return
    }

    setIsLoading(true)
    const schedule = generateShortListSchedule(
      session.groupId,
      session.stations,
      startTime,
      parsedMinutes,
      parsedWarriors,
      session.name,
    )

    if (!schedule) {
      setError('שגיאה בהוצאת הרשימה. בדוק שיש מספיק חיילים זמינים.')
      setIsLoading(false)
      return
    }

    // Save schedule to localStorage
    upsertSchedule(schedule)

    // Record statistics for all participants
    for (const st of schedule.stations) {
      for (const p of st.participants) {
        recordShift(p.name, {
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          stationName: st.stationName,
          date: p.date,
          startTime: p.startTime,
          endTime: p.endTime,
          durationMinutes: p.durationMinutes,
        })
      }
    }

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
          value={minutesPerWarriorStr}
          onChange={e => handleSetMinutesPerWarrior(e.target.value)}
          onFocus={e => e.target.select()}
          className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
        />
        {minutesError && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{minutesError}</p>
        )}
      </div>

      {/* Number of Warriors Per Station */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          מספר חיילים לעמדה
        </label>
        <input
          type="number"
          value={numberOfWarriorsStr}
          onChange={e => handleSetNumberOfWarriors(e.target.value)}
          onFocus={e => e.target.select()}
          className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
        />
        {session?.stations.length ? (
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            סך הכל: {(parseInt(numberOfWarriorsStr, 10) || 0) * session.stations.length} חיילים
          </p>
        ) : null}
        {numberOfWarriorsError && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{numberOfWarriorsError}</p>
        )}
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
          {isLoading ? 'יוצר...' : '✓ צור רשימה'}
        </button>
      </div>
    </div>
  )
}

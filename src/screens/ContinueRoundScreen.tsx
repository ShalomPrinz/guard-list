import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getScheduleById } from '../storage/schedules'
import { parseTimeToMinutes } from '../logic/scheduling'
import { useWizard, DEFAULT_TIME_CONFIG } from '../context/WizardContext'
import type { ScheduleStation } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the actual end time and date for the last participant in a station. */
function stationActualEnd(st: ScheduleStation): { time: string; date: string } | null {
  if (!st.participants.length) return null
  const last = st.participants[st.participants.length - 1]
  return { time: last.endTime, date: last.date }
}

/** Compare two date+time pairs; returns total minutes from epoch-like reference. */
function dateTimeToMins(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return (y * 365 + m * 30 + d) * 1440 + parseTimeToMinutes(time)
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ContinueRoundScreen() {
  const { scheduleId } = useParams<{ scheduleId: string }>()
  const navigate = useNavigate()
  const { initSession } = useWizard()

  const schedule = scheduleId ? getScheduleById(scheduleId) : undefined

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  // ── Derive per-station end times ─────────────────────────────────────────

  const endTimes = (schedule?.stations ?? []).map(s => stationActualEnd(s))

  // Planned end = maximum actual end across all stations
  let plannedEndTime = ''
  let plannedEndDate = ''
  if (endTimes.length > 0) {
    let maxMins = -Infinity
    endTimes.forEach(et => {
      if (!et) return
      const m = dateTimeToMins(et.date, et.time)
      if (m > maxMins) { maxMins = m; plannedEndTime = et.time; plannedEndDate = et.date }
    })
  }

  // Do stations have different actual end times?
  const uniqueEndKeys = new Set(endTimes.filter(Boolean).map(et => `${et!.date}T${et!.time}`))
  const stationsHaveDifferentEnds = uniqueEndKeys.size > 1

  // ── State ────────────────────────────────────────────────────────────────

  const [roundName, setRoundName] = useState(`המשך — ${schedule?.name ?? ''}`)
  const [endTimeMode, setEndTimeMode] = useState<'planned' | 'actual'>('planned')

  if (!schedule) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <p className="text-gray-500 dark:text-gray-400">לוח שמירה לא נמצא.</p>
        <button onClick={() => navigate('/')} className="mt-4 rounded-2xl border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800">
          ← חזרה לדף הבית
        </button>
      </div>
    )
  }

  // ── Start round ──────────────────────────────────────────────────────────

  function handleStart() {
    if (!schedule) return

    const useActual = stationsHaveDifferentEnds && endTimeMode === 'actual'

    // Build wizard stations with pre-filled configs (empty participants — filled in Step3)
    const wizardStations = schedule.stations.map(st => {
      const end = stationActualEnd(st)
      const startTimeOverride = useActual ? (end?.time ?? plannedEndTime) : plannedEndTime
      const startDateOverride = useActual ? (end?.date ?? plannedEndDate) : plannedEndDate

      return {
        config: { id: st.stationConfigId, name: st.stationName, type: 'time-based' as const },
        participants: [],
        startTimeOverride,
        startDateOverride,
      }
    })

    // Use the earliest station's actual end as global start time reference
    let globalStartTime: string
    let newDate: string

    if (useActual && schedule.stations.length > 0) {
      let minMins = Infinity
      globalStartTime = plannedEndTime || DEFAULT_TIME_CONFIG.startTime
      newDate = plannedEndDate || schedule.date
      endTimes.forEach(et => {
        if (!et) return
        const m = dateTimeToMins(et.date, et.time)
        if (m < minMins) { minMins = m; globalStartTime = et.time; newDate = et.date }
      })
    } else {
      globalStartTime = plannedEndTime || DEFAULT_TIME_CONFIG.startTime
      newDate = plannedEndDate || schedule.date
    }

    initSession({
      mode: 'continue',
      groupId: schedule.groupId,
      groupName: schedule.name,
      parentScheduleId: schedule.id,
      continueEndTimeMode: endTimeMode,
      stations: wizardStations,
      timeConfig: {
        ...DEFAULT_TIME_CONFIG,
        startTime: globalStartTime,
      },
      scheduleName: roundName.trim() || `המשך — ${schedule.name}`,
      date: newDate,
    })

    navigate('/schedule/new/step1')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
      <button onClick={() => navigate(`/schedule/${schedule.id}/result`)} className="mb-4 min-h-[44px] text-sm text-gray-500 dark:text-gray-400 active:text-gray-700 dark:active:text-gray-200">
        ← חזרה
      </button>

      <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-gray-100">המשך סבב</h1>

      {/* Round name */}
      <div className="mb-5">
        <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">שם הסבב החדש</label>
        <input
          value={roundName}
          onChange={e => setRoundName(e.target.value)}
          className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 px-4 py-2.5 text-gray-900 dark:text-gray-100 outline-none ring-1 ring-gray-300 dark:ring-gray-600 focus:ring-blue-500"
        />
      </div>

      {/* End time mode — only when stations finish at different times */}
      {stationsHaveDifferentEnds && (
        <div className="mb-5">
          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">זמן התחלה לסבב החדש</p>
          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-gray-100 dark:bg-gray-800 p-3">
              <input
                type="radio"
                name="endTimeMode"
                checked={endTimeMode === 'planned'}
                onChange={() => setEndTimeMode('planned')}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">זמן סיום מתוכנן ({plannedEndTime})</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">כל העמדות מתחילות באותה שעה</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-gray-100 dark:bg-gray-800 p-3">
              <input
                type="radio"
                name="endTimeMode"
                checked={endTimeMode === 'actual'}
                onChange={() => setEndTimeMode('actual')}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">זמן סיום בפועל לכל עמדה</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">כל עמדה מתחילה מהשעה שבה סיימה בפועל</p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Start button */}
      <button
        onClick={handleStart}
        className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700"
      >
        התחל סבב →
      </button>
    </div>
  )
}

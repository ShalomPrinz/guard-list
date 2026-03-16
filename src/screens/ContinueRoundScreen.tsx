import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getScheduleById } from '../storage/schedules'
import { getGroupById } from '../storage/groups'
import { shuffleArray } from '../logic/generateSchedule'
import { parseTimeToMinutes } from '../logic/scheduling'
import { useWizard, DEFAULT_TIME_CONFIG } from '../context/WizardContext'
import type { WizardStation, WizardParticipant, ScheduleStation } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the actual end time and date for the last participant in a station. */
function stationActualEnd(st: ScheduleStation): { time: string; date: string } | null {
  if (st.stationType !== 'time-based' || !st.participants.length) return null
  const last = st.participants[st.participants.length - 1]
  return { time: last.endTime, date: last.date }
}

/** Compare two date+time pairs; returns total minutes from epoch-like reference. */
function dateTimeToMins(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return (y * 365 + m * 30 + d) * 1440 + parseTimeToMinutes(time)
}

// ─── Local types ──────────────────────────────────────────────────────────────

interface ContStation {
  stationConfigId: string
  stationName: string
  stationType: 'time-based' | 'headcount'
  participants: { name: string; available: boolean }[]
  headcountParticipants: string[]
  actualEndTime: string  // "HH:MM"
  actualEndDate: string  // "YYYY-MM-DD"
  plannedEndTime: string // for display
  plannedEndDate: string
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ContinueRoundScreen() {
  const { scheduleId } = useParams<{ scheduleId: string }>()
  const navigate = useNavigate()
  const { initSession } = useWizard()

  const schedule = scheduleId ? getScheduleById(scheduleId) : undefined

  // ── Derive per-station end times ─────────────────────────────────────────

  const tbStations = schedule?.stations.filter(s => s.stationType === 'time-based') ?? []
  const endTimes = tbStations.map(s => stationActualEnd(s))

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

  // ── Build initial ContStation list ───────────────────────────────────────

  function buildInitialStations(): ContStation[] {
    if (!schedule) return []
    return schedule.stations.map(st => {
      const end = stationActualEnd(st)
      return {
        stationConfigId: st.stationConfigId,
        stationName: st.stationName,
        stationType: st.stationType,
        participants: st.participants.map(p => ({ name: p.name, available: true })),
        headcountParticipants: st.headcountParticipants ?? [],
        actualEndTime: end?.time ?? '00:00',
        actualEndDate: end?.date ?? (schedule.date),
        plannedEndTime,
        plannedEndDate,
      }
    })
  }

  // ── State ────────────────────────────────────────────────────────────────

  const [roundName, setRoundName] = useState(`המשך — ${schedule?.name ?? ''}`)
  const [endTimeMode, setEndTimeMode] = useState<'planned' | 'actual'>('planned')
  const [orderMode, setOrderMode] = useState<'same' | 'reshuffle'>('same')
  const [contStations, setContStations] = useState<ContStation[]>(buildInitialStations)

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

  // ── Participant helpers ───────────────────────────────────────────────────

  function toggleAvailability(stationId: string, name: string) {
    setContStations(prev => prev.map(st => {
      if (st.stationConfigId !== stationId) return st
      return { ...st, participants: st.participants.map(p => p.name === name ? { ...p, available: !p.available } : p) }
    }))
  }

  function moveParticipant(name: string, fromId: string, toId: string) {
    setContStations(prev => {
      const fromSt = prev.find(s => s.stationConfigId === fromId)
      const p = fromSt?.participants.find(x => x.name === name)
      if (!p) return prev
      return prev.map(st => {
        if (st.stationConfigId === fromId) return { ...st, participants: st.participants.filter(x => x.name !== name) }
        if (st.stationConfigId === toId) return { ...st, participants: [...st.participants, p] }
        return st
      })
    })
  }

  // ── Start round ──────────────────────────────────────────────────────────

  function handleStart() {
    if (!schedule) return
    const group = getGroupById(schedule.groupId)
    const groupName = group?.name ?? schedule.name

    // Determine per-station start times
    const useActual = stationsHaveDifferentEnds && endTimeMode === 'actual'

    const wizardStations: WizardStation[] = contStations.map(cs => {
      const available = cs.participants.filter(p => p.available)
      let participants: WizardParticipant[]

      if (orderMode === 'reshuffle') {
        participants = shuffleArray(available).map(p => ({ name: p.name, locked: false, skipped: false }))
      } else {
        participants = available.map(p => ({ name: p.name, locked: false, skipped: false }))
      }

      const startTimeOverride = useActual ? cs.actualEndTime : plannedEndTime
      const startDateOverride = useActual ? cs.actualEndDate : plannedEndDate

      return {
        config: {
          id: cs.stationConfigId,
          name: cs.stationName,
          type: cs.stationType,
        },
        participants: cs.stationType === 'time-based' ? participants : [],
        headcountParticipants: cs.headcountParticipants,
        startTimeOverride,
        startDateOverride,
      }
    })

    // Use the earliest station's actual end as the global start time reference
    const tbFiltered = contStations.filter(s => s.stationType === 'time-based')
    let globalStartTime: string
    let newDate: string

    if (useActual && tbFiltered.length > 0) {
      const earliest = tbFiltered.reduce((min, cs) =>
        dateTimeToMins(cs.actualEndDate, cs.actualEndTime) < dateTimeToMins(min.actualEndDate, min.actualEndTime)
          ? cs : min
      )
      globalStartTime = earliest.actualEndTime
      newDate = earliest.actualEndDate
    } else {
      globalStartTime = plannedEndTime || DEFAULT_TIME_CONFIG.startTime
      newDate = plannedEndDate || schedule.date
    }

    initSession({
      mode: 'continue',
      groupId: schedule.groupId,
      groupName,
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

    navigate('/schedule/new/step2')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const tbContStations = contStations.filter(s => s.stationType === 'time-based')

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

      {/* Order mode */}
      <div className="mb-5">
        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">סדר משתתפים</p>
        <div className="flex gap-2">
          <button
            onClick={() => setOrderMode('same')}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
              orderMode === 'same' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 active:bg-gray-200 dark:active:bg-gray-600'
            }`}
          >
            אותו סדר
          </button>
          <button
            onClick={() => setOrderMode('reshuffle')}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
              orderMode === 'reshuffle' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 active:bg-gray-200 dark:active:bg-gray-600'
            }`}
          >
            הגרלה חדשה
          </button>
        </div>
      </div>

      {/* Per-station participant availability + cross-station moves */}
      {tbContStations.length > 0 && (
        <div className="mb-6">
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">זמינות משתתפים לסבב זה</p>
          <div className="flex flex-col gap-4">
            {tbContStations.map(cs => (
              <div key={cs.stationConfigId} className="rounded-2xl bg-white dark:bg-gray-800 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{cs.stationName}</p>
                  {(stationsHaveDifferentEnds ? endTimeMode === 'actual' : false)
                    ? <span className="text-xs text-gray-500">{`מתחיל: ${cs.actualEndTime}`}</span>
                    : <span className="text-xs text-gray-500">{`מתחיל: ${plannedEndTime}`}</span>
                  }
                </div>

                {cs.participants.length === 0 ? (
                  <p className="text-xs text-gray-500">אין משתתפים</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {cs.participants.map(p => {
                      const otherTb = tbContStations.filter(s => s.stationConfigId !== cs.stationConfigId)
                      return (
                        <div key={p.name} className="flex items-center gap-2">
                          {/* Availability toggle */}
                          <button
                            onClick={() => toggleAvailability(cs.stationConfigId, p.name)}
                            className={`w-14 shrink-0 rounded-lg py-1 text-xs font-semibold transition-colors ${
                              p.available
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-500 line-through'
                            }`}
                          >
                            {p.available ? 'בסיס' : 'בית'}
                          </button>

                          <span className={`flex-1 text-sm ${p.available ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-600'}`}>
                            {p.name}
                          </span>

                          {/* Move to another station */}
                          {otherTb.length > 0 && p.available && (
                            <select
                              value=""
                              onChange={e => { if (e.target.value) moveParticipant(p.name, cs.stationConfigId, e.target.value) }}
                              className="shrink-0 rounded-lg bg-gray-100 dark:bg-gray-700 px-1 py-1 text-xs text-gray-700 dark:text-gray-300 outline-none"
                              title="העבר לעמדה"
                            >
                              <option value="">↔</option>
                              {otherTb.map(s => (
                                <option key={s.stationConfigId} value={s.stationConfigId}>{s.stationName}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
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

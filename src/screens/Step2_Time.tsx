import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGroupById } from '../storage/groups'
import { useWizard } from '../context/WizardContext'
import type { RoundingAlgorithm, UnevenMode, TimeInputMode } from '../types'
import {
  calcStationDurations,
  distributeParticipants,
  computeEndDate,
} from '../logic'
import { formatDate } from '../logic/formatting'
import StepIndicator from '../components/StepIndicator'
import TimePicker from '../components/TimePicker'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  if (minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} דק'`
  if (m === 0) return `${h} ש'`
  return `${h} ש' ${m} דק'`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Step2_Time() {
  const navigate = useNavigate()
  const { session, updateTimeConfig, updateSession, updateStations } = useWizard()

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  // Guard: must have a session with stations
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { if (!session) navigate('/fallback') }, [session, navigate])
  if (!session) return null

  // ── Local form state (pre-filled from session if coming back) ─────────────

  const tc = session.timeConfig
  const today = new Date().toISOString().split('T')[0]
  const [startDate, setStartDate] = useState(session.date || today)
  const [startTime, setStartTime] = useState(tc.startTime)

  // Derive initial mode: prefer stored timeInputMode, then infer from values
  const initialMode: TimeInputMode =
    tc.timeInputMode ??
    (tc.fixedDurationMinutes !== undefined ? 'fixed-duration' :
     tc.endTime !== undefined ? 'end-time' : 'end-time')

  const [timeMode, setTimeMode] = useState<TimeInputMode>(initialMode)
  const [endTime, setEndTime] = useState(tc.endTime ?? '')
  const [fixedDuration, setFixedDuration] = useState(
    tc.fixedDurationMinutes !== undefined ? String(tc.fixedDurationMinutes) : '',
  )
  const [rounding, setRounding] = useState<RoundingAlgorithm>(tc.roundingAlgorithm)
  const [unevenMode, setUnevenMode] = useState<UnevenMode>(tc.unevenMode)
  const [error, setError] = useState('')
  const [endDate, setEndDate] = useState(() => computeEndDate(session.date || today, tc.startTime, tc.endTime ?? ''))
  const userEditedEndDate = useRef(false)

  // ── Mode switching ─────────────────────────────────────────────────────────

  function handleModeChange(mode: TimeInputMode) {
    if (mode === timeMode) return
    if (mode === 'fixed-duration') {
      // Leaving end-time mode: clear end time
      setEndTime('')
      userEditedEndDate.current = false
    } else {
      // Leaving fixed-duration mode: clear fixed duration
      setFixedDuration('')
    }
    setTimeMode(mode)
    setError('')
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const group = session.groupId ? getGroupById(session.groupId) : null
  const baseCount = group?.members.filter(m => m.availability === 'base').length ?? 0

  // Expected participant distribution across stations
  const expectedCounts =
    session.stations.length > 0
      ? distributeParticipants(baseCount, session.stations.length)
      : []

  const isUneven =
    session.stations.length >= 2 &&
    baseCount > 0 &&
    baseCount % session.stations.length !== 0

  const fixedDurationNum = fixedDuration !== '' ? Number(fixedDuration) : undefined

  // Live duration preview per station
  const durations =
    expectedCounts.length > 0
      ? calcStationDurations({
          startTime,
          endTime: timeMode === 'end-time' ? (endTime || undefined) : undefined,
          fixedDurationMinutes: timeMode === 'fixed-duration' ? fixedDurationNum : undefined,
          roundingAlgorithm: rounding,
          unevenMode: isUneven ? unevenMode : 'equal-duration',
          stationParticipantCounts: expectedCounts,
        })
      : []

  // Auto-recompute end date when start date/time or end time changes,
  // unless the user has manually edited it.
  useEffect(() => {
    if (!userEditedEndDate.current) {
      setEndDate(computeEndDate(startDate, startTime, endTime))
    }
  }, [startDate, startTime, endTime])

  const autoEndDate = computeEndDate(startDate, startTime, endTime)
  const showEndDate = timeMode === 'end-time' && endTime !== '' && autoEndDate !== startDate

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!startTime) return 'יש להזין שעת התחלה'
    if (timeMode === 'end-time' && !endTime) return 'יש להזין שעת סיום'
    if (timeMode === 'fixed-duration') {
      if (!fixedDuration) return 'יש להזין משך קבוע'
      if (isNaN(Number(fixedDuration)) || Number(fixedDuration) <= 0) return 'משך חייב להיות מספר חיובי'
    }
    const anyZero = durations.some(d => d.roundedDurationMinutes <= 0)
    if (anyZero) return 'משך המשמרת חייב להיות גדול מ-0'
    return null
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function handleNext() {
    const err = validate()
    if (err) { setError(err); return }

    // If the user changed the global start time or date, propagate to all stations.
    // This preserves per-station start times (e.g. continue-round "actual" mode) when
    // the user hasn't touched the field, while correctly overriding them when they have.
    if (startTime !== tc.startTime || startDate !== session!.date) {
      updateStations(session!.stations.map(s => ({ ...s, startTime, startDate })))
    }

    updateSession({ date: startDate })
    updateTimeConfig({
      startTime,
      endTime: timeMode === 'end-time' ? (endTime || undefined) : undefined,
      fixedDurationMinutes: timeMode === 'fixed-duration' && fixedDuration !== '' ? Number(fixedDuration) : undefined,
      roundingAlgorithm: rounding,
      unevenMode,
      timeInputMode: timeMode,
    })
    navigate('/schedule/new/step3')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
      <StepIndicator current={2} total={4} />
      <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-gray-100">הגדרת זמנים</h1>

      {/* Start date */}
      <div className="mb-4">
        <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">תאריך התחלה</label>
        <p className="mb-1 text-xs font-medium text-blue-600 dark:text-blue-400">{formatDate(startDate)}</p>
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:[color-scheme:dark] dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
        />
      </div>

      {/* Start time */}
      <div className="mb-4">
        <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">שעת התחלה</label>
        <TimePicker
          value={startTime}
          onChange={v => { setStartTime(v); setError('') }}
          className="w-full"
        />
      </div>

      {/* Mode toggle */}
      <div className="mb-4">
        <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          <button
            type="button"
            onClick={() => handleModeChange('end-time')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              timeMode === 'end-time'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            שעת סיום
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('fixed-duration')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              timeMode === 'fixed-duration'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            זמן קבוע לכל לוחם
          </button>
        </div>
      </div>

      {/* End time — shown when mode is 'end-time' */}
      {timeMode === 'end-time' && (
        <div className="mb-4">
          <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">שעת סיום</label>
          <TimePicker
            value={endTime}
            onChange={v => { setEndTime(v); setError('') }}
            className="w-full"
          />
          {/* End date — shown when schedule crosses midnight, editable */}
          {showEndDate && (
            <div className="mt-2">
              <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">תאריך סיום</label>
              <p className="mb-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                {formatDate(userEditedEndDate.current ? endDate : autoEndDate)}
              </p>
              <input
                type="date"
                value={endDate}
                onChange={e => { userEditedEndDate.current = true; setEndDate(e.target.value) }}
                className="w-full rounded-xl bg-gray-100 px-4 py-2 text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:[color-scheme:dark] dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
              />
            </div>
          )}
        </div>
      )}

      {/* Fixed duration — shown when mode is 'fixed-duration' */}
      {timeMode === 'fixed-duration' && (
        <div className="mb-4">
          <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">
            משך קבוע לכל שומר <span className="text-gray-400 dark:text-gray-500">(דקות)</span>
          </label>
          <input
            type="number"
            min={1}
            value={fixedDuration}
            onChange={e => { setFixedDuration(e.target.value); setError('') }}
            placeholder="למשל: 90"
            className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 placeholder-gray-400 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
          />
        </div>
      )}

      {/* Rounding algorithm */}
      <div className="mb-5">
        <label className="mb-2 block text-sm text-gray-500 dark:text-gray-400">עיגול משך המשמרת</label>
        <div className="flex flex-col gap-2">
          {(
            [
              { value: 'round-up-10', label: 'עיגול למעלה ל-10 דקות', recommended: true },
              { value: 'round-up-5', label: 'עיגול למעלה ל-5 דקות', recommended: false },
              { value: 'round-nearest', label: 'עיגול לדקה הקרובה', recommended: false },
            ] as const
          ).map(opt => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-3 rounded-xl bg-gray-100 px-4 py-3 dark:bg-gray-800"
            >
              <input
                type="radio"
                name="rounding"
                value={opt.value}
                checked={rounding === opt.value}
                onChange={() => setRounding(opt.value)}
                className="accent-blue-500"
              />
              <span className="text-sm text-gray-900 dark:text-gray-100">{opt.label}</span>
              {opt.recommended && (
                <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                  מומלץ
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Uneven distribution mode — only shown when relevant */}
      {isUneven && (
        <div className="mb-5">
          <label className="mb-2 block text-sm text-gray-500 dark:text-gray-400">
            חלוקה לא שווה — {baseCount} חיילים על {session.stations.length} עמדות
          </label>
          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-gray-100 px-4 py-3 dark:bg-gray-800">
              <input
                type="radio"
                name="unevenMode"
                checked={unevenMode === 'equal-duration'}
                onChange={() => setUnevenMode('equal-duration')}
                className="accent-blue-500"
              />
              <div>
                <p className="text-sm text-gray-900 dark:text-gray-100">משך שווה לכולם</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">עמדה עם פחות שומרים מסיימת מוקדם יותר</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-gray-100 px-4 py-3 dark:bg-gray-800">
              <input
                type="radio"
                name="unevenMode"
                checked={unevenMode === 'equal-endtime'}
                onChange={() => setUnevenMode('equal-endtime')}
                className="accent-blue-500"
              />
              <div>
                <p className="text-sm text-gray-900 dark:text-gray-100">סיום שווה לכולם</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">עמדה עם פחות שומרים — משמרת ארוכה יותר</p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Live preview */}
      {durations.length > 0 && (
        <div className="mb-5 rounded-2xl bg-gray-100 p-4 dark:bg-gray-800">
          <p className="mb-3 text-xs font-semibold text-gray-500 dark:text-gray-400">תצוגה מקדימה</p>
          <div className="flex flex-col gap-2">
            {session.stations.map((station, i) => {
              const d = durations[i]
              return (
                <div key={station.config.id} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{station.config.name}</span>
                  <div className="text-left">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {formatDuration(d.roundedDurationMinutes)}
                    </span>
                    <span className="mr-2 text-xs text-gray-400 dark:text-gray-500">
                      × {d.participantCount} שומרים
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-900/40 dark:text-red-300">{error}</p>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/schedule/new/step1')}
          className="flex-1 rounded-2xl border border-gray-300 py-3 text-sm font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
        >
          ← חזרה
        </button>
        <button
          onClick={handleNext}
          className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700"
        >
          הבא →
        </button>
      </div>
    </div>
  )
}

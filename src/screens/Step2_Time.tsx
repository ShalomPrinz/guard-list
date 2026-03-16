import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGroupById } from '../storage/groups'
import { useWizard } from '../context/WizardContext'
import type { RoundingAlgorithm, UnevenMode } from '../types'
import {
  calcStationDurations,
  distributeParticipants,
} from '../logic/scheduling'
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
  const { session, updateTimeConfig } = useWizard()

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  // Guard: must have a session with stations
  if (!session) {
    navigate('/schedule/new/step1')
    return null
  }

  // ── Local form state (pre-filled from session if coming back) ─────────────

  const tc = session.timeConfig
  const [startTime, setStartTime] = useState(tc.startTime)
  const [endTime, setEndTime] = useState(tc.endTime ?? '')
  const [fixedDuration, setFixedDuration] = useState(
    tc.fixedDurationMinutes !== undefined ? String(tc.fixedDurationMinutes) : '',
  )
  const [rounding, setRounding] = useState<RoundingAlgorithm>(tc.roundingAlgorithm)
  const [unevenMode, setUnevenMode] = useState<UnevenMode>(tc.unevenMode)
  const [error, setError] = useState('')

  // ── Derived values ────────────────────────────────────────────────────────

  const timeBasedStations = session.stations.filter(s => s.config.type === 'time-based')
  const group = session.groupId ? getGroupById(session.groupId) : null
  const baseCount = group?.members.filter(m => m.availability === 'base').length ?? 0

  // Expected participant distribution across time-based stations
  const expectedCounts =
    timeBasedStations.length > 0
      ? distributeParticipants(baseCount, timeBasedStations.length)
      : []

  const isUneven =
    timeBasedStations.length >= 2 &&
    baseCount > 0 &&
    baseCount % timeBasedStations.length !== 0

  const fixedDurationNum = fixedDuration !== '' ? Number(fixedDuration) : undefined

  // Live duration preview per time-based station
  const durations =
    expectedCounts.length > 0
      ? calcStationDurations({
          startTime,
          endTime: endTime || undefined,
          fixedDurationMinutes: fixedDurationNum,
          roundingAlgorithm: rounding,
          unevenMode: isUneven ? unevenMode : 'equal-duration',
          stationParticipantCounts: expectedCounts,
        })
      : []

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!startTime) return 'יש להזין שעת התחלה'
    if (!endTime && !fixedDuration) return 'יש להזין שעת סיום או משך קבוע'
    if (fixedDuration !== '' && (isNaN(Number(fixedDuration)) || Number(fixedDuration) <= 0)) {
      return 'משך חייב להיות מספר חיובי'
    }
    const anyZero = durations.some(d => d.roundedDurationMinutes <= 0)
    if (anyZero) return 'משך המשמרת חייב להיות גדול מ-0'
    return null
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function handleNext() {
    const err = validate()
    if (err) { setError(err); return }

    updateTimeConfig({
      startTime,
      endTime: endTime || undefined,
      fixedDurationMinutes: fixedDuration !== '' ? Number(fixedDuration) : undefined,
      roundingAlgorithm: rounding,
      unevenMode,
    })
    navigate('/schedule/new/step3')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
      <StepIndicator current={2} total={4} />
      <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-gray-100">הגדרת זמנים</h1>

      {/* Start time */}
      <div className="mb-4">
        <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">שעת התחלה</label>
        <TimePicker
          value={startTime}
          onChange={v => { setStartTime(v); setError('') }}
          className="w-full"
        />
      </div>

      {/* End time (optional) */}
      <div className="mb-4">
        <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">
          שעת סיום <span className="text-gray-400 dark:text-gray-500">(אופציונלי)</span>
        </label>
        <TimePicker
          value={endTime}
          onChange={v => { setEndTime(v); setFixedDuration(''); setError('') }}
          className="w-full"
        />
      </div>

      {/* Fixed duration — only relevant when end time is empty */}
      {!endTime && (
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
            חלוקה לא שווה — {baseCount} חיילים על {timeBasedStations.length} עמדות
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
            {timeBasedStations.map((station, i) => {
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

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useWizard } from '../context/WizardContext'
import { recalculateStation, parseTimeToMinutes, minutesToTime } from '../logic/scheduling'
import type { RoundingAlgorithm, ScheduledParticipant } from '../types'

interface ReviewItem {
  id: string
  name: string
  durationMinutes: number
  startTime: string
  endTime: string
  date: string
  locked: boolean
}

interface ReviewStation {
  stationConfigId: string
  stationName: string
  items: ReviewItem[]
  startTime: string
  startDate: string
}

export default function RecalculateScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useWizard()

  // Receive current review stations from navigation state
  const reviewStations: ReviewStation[] =
    (location.state as { reviewStations?: ReviewStation[] } | null)?.reviewStations ?? []

  const stationCount = reviewStations.length

  const [selectedStationIdx, setSelectedStationIdx] = useState(0)
  const [mode, setMode] = useState<'original' | 'custom'>('original')
  const [customEndTime, setCustomEndTime] = useState('')
  const [roundingAlgorithm, setRoundingAlgorithm] = useState<RoundingAlgorithm>(
    session?.timeConfig.roundingAlgorithm ?? 'round-up-10',
  )

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  // Redirect if no session — after hooks
  if (!session) {
    navigate('/')
    return null
  }

  // Narrow type: session is non-null from here on
  const activeSession = session

  const selectedStation = reviewStations[selectedStationIdx]

  // Compute original planned end time for the selected station
  function getPlannedEndTime(): string {
    if (!selectedStation) return ''
    const st = activeSession.stations[selectedStationIdx]
    const stStartTime = st?.startTimeOverride ?? activeSession.timeConfig.startTime
    const tc = activeSession.timeConfig

    // If endTime is set in timeConfig, use it
    if (tc.endTime) return tc.endTime

    // Otherwise compute from start + fixedDuration * count
    if (tc.fixedDurationMinutes && tc.fixedDurationMinutes > 0) {
      const count = selectedStation.items.length
      const totalMins = parseTimeToMinutes(stStartTime) + tc.fixedDurationMinutes * count
      return minutesToTime(totalMins % 1440)
    }

    // Fallback: use last item's endTime
    const items = selectedStation.items
    const last = items[items.length - 1]
    return last?.endTime ?? stStartTime
  }

  const items = selectedStation?.items ?? []
  const lastItem = items[items.length - 1]
  const currentEndTime = lastItem?.endTime ?? ''
  const plannedEndTime = getPlannedEndTime()

  const targetEndTime = mode === 'original' ? plannedEndTime : customEndTime

  // Compute live preview
  function computePreview(): ScheduledParticipant[] | null {
    if (!selectedStation || !targetEndTime) return null
    const parts = selectedStation.items.map(it => ({ name: it.name, locked: it.locked }))
    if (parts.length === 0) return []

    const startMins = parseTimeToMinutes(selectedStation.startTime)
    const endMins0 = parseTimeToMinutes(targetEndTime)
    const endMins = endMins0 <= startMins ? endMins0 + 1440 : endMins0

    if (endMins <= startMins) return null

    return recalculateStation(parts, selectedStation.startTime, selectedStation.startDate, targetEndTime, roundingAlgorithm)
  }

  const preview = computePreview()

  const isError =
    targetEndTime.length === 5 &&
    (() => {
      const startMins = parseTimeToMinutes(selectedStation?.startTime ?? '00:00')
      const endMins = parseTimeToMinutes(targetEndTime)
      return endMins === startMins
    })()

  function handleSave() {
    if (!selectedStation || !preview) return

    const updatedItems: ReviewItem[] = preview.map((sp, i) => ({
      id: selectedStation.items[i]?.id ?? `${selectedStation.stationConfigId}-recalc-${i}`,
      name: sp.name,
      durationMinutes: sp.durationMinutes,
      startTime: sp.startTime,
      endTime: sp.endTime,
      date: sp.date,
      locked: sp.locked,
    }))

    navigate('/schedule/new/step4', {
      state: {
        recalculatedStation: {
          stationConfigId: selectedStation.stationConfigId,
          items: updatedItems,
        },
      },
    })
  }

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-gray-100">חישוב זמנים מחדש</h1>

      {/* Station selector (only if multiple stations) */}
      {stationCount > 1 && (
        <div className="mb-6">
          <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">בחר עמדה</label>
          <select
            value={selectedStationIdx}
            onChange={e => setSelectedStationIdx(Number(e.target.value))}
            className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
          >
            {reviewStations.map((st, idx) => (
              <option key={st.stationConfigId} value={idx}>
                {st.stationName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Current end time */}
      {selectedStation && (
        <div className="mb-6 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
          <span className="text-sm text-gray-500 dark:text-gray-400">שעת סיום נוכחית: </span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{currentEndTime}</span>
        </div>
      )}

      {/* Mode selector */}
      <div className="mb-6 flex flex-col gap-3">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="radio"
            name="recalc-mode"
            value="original"
            checked={mode === 'original'}
            onChange={() => setMode('original')}
            className="accent-blue-600"
          />
          <span className="text-sm text-gray-900 dark:text-gray-100">
            הארכה לשעת סיום מקורית
            {plannedEndTime && (
              <span className="mr-1 text-gray-400 dark:text-gray-500">({plannedEndTime})</span>
            )}
          </span>
        </label>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="radio"
            name="recalc-mode"
            value="custom"
            checked={mode === 'custom'}
            onChange={() => setMode('custom')}
            className="accent-blue-600"
          />
          <span className="text-sm text-gray-900 dark:text-gray-100">שעת סיום מותאמת אישית</span>
        </label>

        {mode === 'custom' && (
          <input
            type="time"
            value={customEndTime}
            onChange={e => setCustomEndTime(e.target.value)}
            className="mt-1 w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
          />
        )}
      </div>

      {/* Rounding selector */}
      <div className="mb-6">
        <label className="mb-2 block text-sm text-gray-500 dark:text-gray-400">עיגול</label>
        <div className="flex flex-col gap-2">
          {(
            [
              ['round-up-10', 'עיגול למעלה ל-10 דקות (מומלץ)'],
              ['round-up-5', 'עיגול למעלה ל-5 דקות'],
              ['round-nearest', 'עיגול לדקה הקרובה'],
            ] as [RoundingAlgorithm, string][]
          ).map(([val, label]) => (
            <label key={val} className="flex cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="rounding"
                value={val}
                checked={roundingAlgorithm === val}
                onChange={() => setRoundingAlgorithm(val)}
                className="accent-blue-600"
              />
              <span className="text-sm text-gray-900 dark:text-gray-100">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Error */}
      {isError && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-900/40 dark:text-red-300">
          שעת הסיום חייבת להיות שונה משעת ההתחלה
        </p>
      )}

      {/* Live preview */}
      {preview && preview.length > 0 && (
        <div className="mb-6 rounded-2xl bg-white p-4 dark:bg-gray-800">
          <p className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">תצוגה מקדימה</p>
          <div className="flex flex-col gap-1">
            {preview.map((sp, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className="w-24 shrink-0 font-mono text-gray-500 dark:text-gray-400">
                  {sp.startTime}–{sp.endTime}
                </span>
                <span className="text-gray-900 dark:text-gray-100">{sp.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/schedule/new/step4', { state: null })}
          className="flex-1 rounded-2xl border border-gray-300 py-3 text-sm font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
        >
          ביטול
        </button>
        <button
          onClick={handleSave}
          disabled={!preview || preview.length === 0 || isError || (mode === 'custom' && !customEndTime)}
          className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
        >
          שמירת השינויים
        </button>
      </div>
    </div>
  )
}

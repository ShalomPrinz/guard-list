import { useState, useEffect } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { getGroups } from '../storage/groups'
import { getScheduleById } from '../storage/schedules'
import { getStationsConfig, saveStationsConfig } from '../storage/stationsConfig'
import { useWizard, DEFAULT_TIME_CONFIG } from '../context/WizardContext'
import { useShortListWizard } from '../context/ShortListWizardContext'
import type { StationConfig, WizardStation } from '../types'
import StepIndicator from '../components/StepIndicator'
import TimePicker from '../components/TimePicker'

interface StationForm {
  id: string
  name: string
}

function defaultStationForm(index: number, saved?: StationConfig): StationForm {
  return {
    id: saved?.id ?? crypto.randomUUID(),
    name: saved?.name ?? `עמדה ${index + 1}`,
  }
}

type NewStationTime =
  | { type: 'custom'; time: string }
  | { type: 'inherit'; stationConfigId: string }

const FIXED_COUNTS = [1, 2, 3, 4] as const

export default function Step1_Stations() {
  const navigate = useNavigate()
  const location = useLocation()
  const { groupId: shortListGroupId } = useParams<{ groupId: string }>()
  const { session, initSession } = useWizard()
  const { session: shortListSession, setSession: setShortListSession } = useShortListWizard()

  const isShortList = location.pathname.startsWith('/short-list')
  const activeSession = isShortList ? shortListSession : session

  const groups = getGroups()
  const savedConfigs = getStationsConfig()

  const isContinueMode = session?.mode === 'continue'
  // IDs of stations that were pre-filled from the previous round (they already have startTime set)
  const sessionStationIds = new Set(session?.stations.map(s => s.config.id) ?? [])
  // Previous round schedule — needed for inherit-end-time option
  const parentSchedule = isContinueMode && session?.parentScheduleId
    ? getScheduleById(session.parentScheduleId)
    : undefined

  // ── Local form state ──────────────────────────────────────────────────────

  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    isShortList ? (shortListGroupId ?? '') : (session?.groupId ?? groups[0]?.id ?? ''),
  )

  const initCount = activeSession?.stations.length
    ? activeSession.stations.length
    : savedConfigs.length > 0
      ? savedConfigs.length
      : 1

  const [stationCount, setStationCount] = useState(initCount)
  const [useCustom, setUseCustom] = useState(initCount > 4)
  const [customStr, setCustomStr] = useState(initCount > 4 ? String(initCount) : '')

  const [stationForms, setStationForms] = useState<StationForm[]>(() => {
    if (isShortList && shortListSession?.stations.length) {
      return shortListSession.stations.map(s => ({
        id: s.id,
        name: s.name,
      }))
    }
    if (!isShortList && session?.stations.length) {
      return session.stations.map(s => ({
        id: s.config.id,
        name: s.config.name,
      }))
    }
    return Array.from({ length: stationCount }, (_, i) =>
      defaultStationForm(i, savedConfigs[i]),
    )
  })

  // Per new-station (in continue mode) start time selection
  const [newStationTimes, setNewStationTimes] = useState<Record<string, NewStationTime>>({})

  const [error, setError] = useState('')

  // ── Sync station forms when count changes ─────────────────────────────────

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    // Initialize short-list session on mount
    if (isShortList && !shortListSession && shortListGroupId) {
      setShortListSession({
        groupId: shortListGroupId,
        stations: [],
        startHour: 14,
        startMinute: 0,
        minutesPerWarrior: 60,
        numberOfWarriors: 1,
        name: 'רשימת שמירה',
      })
    }
  }, [])

  // savedConfigs is stable (computed once at mount), so only stationCount needs to be a dependency
  useEffect(() => {
    setStationForms(prev => {
      if (stationCount === prev.length) return prev
      if (stationCount < prev.length) return prev.slice(0, stationCount)
      const extra = Array.from({ length: stationCount - prev.length }, (_, i) => {
        const idx = prev.length + i
        return defaultStationForm(idx, savedConfigs[idx])
      })
      return [...prev, ...extra]
    })
  }, [stationCount]) // eslint-disable-line react-hooks/exhaustive-deps -- intentional: effect only reacts to stationCount changes; setStations is a stable setter and prev state is accessed via functional update

  // ── Count selector helpers ─────────────────────────────────────────────────

  function handleFixedCount(n: number) {
    setStationCount(n)
    setUseCustom(false)
  }

  function handleCustomChange(val: string) {
    const n = parseInt(val, 10)
    if (isNaN(n)) { setCustomStr(val); return }
    const clamped = Math.min(Math.max(n, 1), 10)
    setCustomStr(String(clamped))
    setStationCount(clamped)
  }

  // ── Field updaters ────────────────────────────────────────────────────────

  function updateStation(index: number, patch: Partial<StationForm>) {
    setStationForms(prev =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    )
  }

  function setNewStationTime(stationId: string, sel: NewStationTime) {
    setNewStationTimes(prev => ({ ...prev, [stationId]: sel }))
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function handleNext() {
    if (!selectedGroupId) {
      setError('יש לבחור קבוצה')
      return
    }
    const selectedGroup = groups.find(g => g.id === selectedGroupId)
    if (!selectedGroup) { setError('קבוצה לא נמצאה'); return }

    const baseCount = selectedGroup.members.filter(m => m.availability === 'base').length
    if (baseCount === 0) {
      setError('כל חברי הקבוצה מסומנים כ"בית". יש לסמן לפחות חבר אחד כ"בסיס".')
      return
    }

    // In continue mode, validate that all new stations have a valid start-time selection
    // (undefined sel means the default custom time is used — that's acceptable)
    if (isContinueMode) {
      const newForms = stationForms.filter(f => !sessionStationIds.has(f.id))
      for (const f of newForms) {
        const sel = newStationTimes[f.id]
        if (sel?.type === 'custom' && !sel.time) { setError('יש להזין שעת התחלה לעמדה החדשה'); return }
        if (sel?.type === 'inherit' && !sel.stationConfigId) { setError('יש לבחור עמדה קיימת'); return }
      }
    }

    // Build station configs for short-list, or wizard stations for regular wizard
    const stationConfigs = stationForms.map(f => ({
      id: f.id,
      name: f.name.trim() || `עמדה ${stationForms.indexOf(f) + 1}`,
      type: 'time-based' as const,
    }))

    // For short-list, just update the session and navigate to step2
    if (isShortList) {
      setShortListSession({
        groupId: selectedGroupId,
        stations: stationConfigs,
        startHour: shortListSession?.startHour ?? 14,
        startMinute: shortListSession?.startMinute ?? 0,
        minutesPerWarrior: shortListSession?.minutesPerWarrior ?? 60,
        numberOfWarriors: shortListSession?.numberOfWarriors ?? 1,
        name: shortListSession?.name ?? 'רשימת שמירה',
      })
      navigate('/short-list/step2')
      return
    }

    // For regular wizard, build wizard stations (participants populated later in Step 3)
    const stations: WizardStation[] = stationForms.map(f => {
      // Only look up the session station by exact ID (no fallback by index)
      const existingSessionStation = isContinueMode
        ? session!.stations.find(s => s.config.id === f.id)
        : undefined

      const today = new Date().toISOString().split('T')[0]
      let startTime: string
      let startDate: string

      if (existingSessionStation) {
        startTime = existingSessionStation.startTime
        startDate = existingSessionStation.startDate
      } else if (isContinueMode) {
        const sel = newStationTimes[f.id]
        if (!sel || sel.type === 'custom') {
          // Default: use the global continuation start time
          startTime = sel?.time || session!.timeConfig.startTime
          startDate = session!.date
        } else if (sel.type === 'inherit' && parentSchedule) {
          const prevSt = parentSchedule.stations.find(s => s.stationConfigId === sel.stationConfigId)
          const lastP = prevSt?.participants[prevSt.participants.length - 1]
          startTime = lastP?.endTime ?? session!.timeConfig.startTime
          startDate = lastP?.date ?? session!.date
        } else {
          startTime = session!.timeConfig.startTime
          startDate = session!.date
        }
      } else {
        // New schedule: use the current session defaults (Step2 will overwrite if user changes them)
        startTime = session?.timeConfig.startTime ?? DEFAULT_TIME_CONFIG.startTime
        startDate = session?.date ?? today
      }

      return {
        config: {
          id: f.id,
          name: f.name.trim() || `עמדה ${stationForms.indexOf(f) + 1}`,
          type: 'time-based',
        },
        participants: [],
        startTime,
        startDate,
      }
    })

    // Persist station names for next session pre-fill
    saveStationsConfig(stations.map(s => s.config))

    // Preserve timeConfig if same group, reset if group changed
    const preserveTime = session?.groupId === selectedGroupId && session?.timeConfig
    const today = new Date().toISOString().split('T')[0]
    initSession({
      mode: isContinueMode ? 'continue' : 'new',
      groupId: selectedGroupId,
      groupName: selectedGroup.name,
      stations,
      timeConfig: preserveTime ? session!.timeConfig : { ...DEFAULT_TIME_CONFIG },
      scheduleName: session?.groupId === selectedGroupId ? (session?.scheduleName ?? '') : '',
      date: session?.groupId === selectedGroupId ? (session?.date ?? today) : today,
      ...(isContinueMode ? { parentScheduleId: session!.parentScheduleId } : {}),
      ...(isContinueMode ? { continueEndTimeMode: session!.continueEndTimeMode } : {}),
    })

    navigate('/schedule/new/step2')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (groups.length === 0) {
    return (
      <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
        <StepIndicator current={1} total={4} />
        <p className="mb-4 text-gray-500 dark:text-gray-400">אין קבוצות שמורות. צור קבוצה לפני יצירת לוח שמירה.</p>
        <button
          onClick={() => navigate('/')}
          className="w-full rounded-2xl border border-gray-300 py-3 text-sm text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
        >
          → חזרה לדף הבית
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <StepIndicator current={1} total={4} />
      <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-gray-100">הגדרת עמדות</h1>

      {/* Group selector */}
      <div className="mb-6">
        <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">קבוצה</label>
        {groups.length === 1 ? (
          <div className="rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 dark:bg-gray-800 dark:text-gray-100">
            {groups[0].name}
            <span className="mr-2 text-xs text-gray-500 dark:text-gray-400">
              ({groups[0].members.filter(m => m.availability === 'base').length} זמינים)
            </span>
          </div>
        ) : (
          <select
            value={selectedGroupId}
            onChange={e => { setSelectedGroupId(e.target.value); setError('') }}
            className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
          >
            {groups.map(g => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.members.filter(m => m.availability === 'base').length} זמינים)
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Station count selector */}
      <div className="mb-6">
        <label className="mb-2 block text-sm text-gray-500 dark:text-gray-400">מספר עמדות</label>
        <div className="flex gap-2">
          {FIXED_COUNTS.map(n => (
            <button
              key={n}
              onClick={() => handleFixedCount(n)}
              className={`h-10 w-10 rounded-xl text-sm font-semibold transition-colors ${
                !useCustom && stationCount === n
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 active:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:active:bg-gray-600'
              }`}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => setUseCustom(true)}
            className={`h-10 rounded-xl px-3 text-sm font-semibold transition-colors ${
              useCustom
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 active:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:active:bg-gray-600'
            }`}
          >
            אחר..
          </button>
        </div>
        {useCustom && (
          <input
            type="number"
            min={5}
            max={10}
            value={customStr}
            onChange={e => handleCustomChange(e.target.value)}
            placeholder="מספר עמדות"
            autoFocus
            className="mt-2 w-32 rounded-xl bg-gray-100 px-4 py-2 text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
          />
        )}
      </div>

      {/* Station cards */}
      <div className="mb-6 flex flex-col gap-3">
        {stationForms.map((station, i) => {
          const isNewStation = isContinueMode && !sessionStationIds.has(station.id)
          const sel = newStationTimes[station.id]

          return (
            <div key={station.id} className="rounded-2xl bg-gray-100 p-4 dark:bg-gray-800">
              <p className="mb-3 text-xs font-semibold text-gray-500 dark:text-gray-400">עמדה {i + 1}</p>
              <input
                type="text"
                value={station.name}
                onChange={e => updateStation(i, { name: e.target.value })}
                placeholder={`עמדה ${i + 1}`}
                className="w-full rounded-xl bg-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
              />

              {/* Start time selection for new stations in continue mode */}
              {isNewStation && (
                <div className="mt-3 border-t border-amber-200 pt-3 dark:border-amber-800">
                  <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                    עמדה חדשה — יש לבחור שעת התחלה
                  </p>
                  <div className="flex flex-col gap-2">
                    {/* Option A: custom time */}
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name={`new-station-type-${station.id}`}
                        checked={!sel || sel.type === 'custom'}
                        onChange={() => setNewStationTime(station.id, {
                          type: 'custom',
                          time: sel?.type === 'custom' ? sel.time : (session?.timeConfig.startTime ?? '20:00'),
                        })}
                        className="shrink-0"
                      />
                      <span className="text-sm text-gray-800 dark:text-gray-200">שעת התחלה מותאמת אישית</span>
                    </label>
                    {(!sel || sel.type === 'custom') && (
                      <div className="mr-5">
                        <TimePicker
                          value={sel?.type === 'custom' ? sel.time : (session?.timeConfig.startTime ?? '20:00')}
                          onChange={t => setNewStationTime(station.id, { type: 'custom', time: t })}
                        />
                      </div>
                    )}

                    {/* Option B: inherit from previous station */}
                    {parentSchedule && parentSchedule.stations.length > 0 && (
                      <>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name={`new-station-type-${station.id}`}
                            checked={sel?.type === 'inherit'}
                            onChange={() => setNewStationTime(station.id, {
                              type: 'inherit',
                              stationConfigId: parentSchedule.stations[0].stationConfigId,
                            })}
                            className="shrink-0"
                          />
                          <span className="text-sm text-gray-800 dark:text-gray-200">התחל לפי עמדה קיימת</span>
                        </label>
                        {sel?.type === 'inherit' && (
                          <select
                            value={sel.stationConfigId}
                            onChange={e => setNewStationTime(station.id, { type: 'inherit', stationConfigId: e.target.value })}
                            className="mr-5 rounded-xl bg-gray-200 px-3 py-2 text-sm text-gray-900 outline-none dark:bg-gray-700 dark:text-gray-100"
                          >
                            {parentSchedule.stations.map(st => {
                              const lastP = st.participants[st.participants.length - 1]
                              return (
                                <option key={st.stationConfigId} value={st.stationConfigId}>
                                  {st.stationName}{lastP ? ` (${lastP.endTime})` : ''}
                                </option>
                              )
                            })}
                          </select>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-900/40 dark:text-red-300">{error}</p>}

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={() => {
            if (isShortList) setShortListSession(null)
            navigate('/')
          }}
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

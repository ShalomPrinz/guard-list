import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGroups } from '../storage/groups'
import { getStationsConfig, saveStationsConfig } from '../storage/stationsConfig'
import { useWizard, DEFAULT_TIME_CONFIG } from '../context/WizardContext'
import type { StationConfig, WizardStation } from '../types'
import StepIndicator from '../components/StepIndicator'

interface StationForm {
  id: string
  name: string
  type: StationConfig['type']
  headcountRequired: number
}

function defaultStationForm(index: number, saved?: StationConfig): StationForm {
  return {
    id: saved?.id ?? crypto.randomUUID(),
    name: saved?.name ?? `עמדה ${index + 1}`,
    type: saved?.type ?? 'time-based',
    headcountRequired: saved?.headcountRequired ?? 2,
  }
}

export default function Step1_Stations() {
  const navigate = useNavigate()
  const { session, initSession } = useWizard()

  const groups = getGroups()
  const savedConfigs = getStationsConfig()

  // ── Local form state ──────────────────────────────────────────────────────

  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    session?.groupId ?? groups[0]?.id ?? '',
  )

  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState<string>(session?.date ?? today)

  const initCount = session?.stations.length
    ? session.stations.length
    : savedConfigs.length > 0
      ? savedConfigs.length
      : 1

  const [stationCount, setStationCount] = useState(Math.min(initCount, 6))

  const [stationForms, setStationForms] = useState<StationForm[]>(() => {
    if (session?.stations.length) {
      return session.stations.map(s => ({
        id: s.config.id,
        name: s.config.name,
        type: s.config.type,
        headcountRequired: s.config.headcountRequired ?? 2,
      }))
    }
    return Array.from({ length: stationCount }, (_, i) =>
      defaultStationForm(i, savedConfigs[i]),
    )
  })

  const [error, setError] = useState('')

  // ── Sync station forms when count changes ─────────────────────────────────

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

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
  }, [stationCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Field updaters ────────────────────────────────────────────────────────

  function updateStation(index: number, patch: Partial<StationForm>) {
    setStationForms(prev =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    )
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

    // Build wizard stations (participants populated later in Step 3)
    const stations: WizardStation[] = stationForms.map(f => ({
      config: {
        id: f.id,
        name: f.name.trim() || `עמדה ${stationForms.indexOf(f) + 1}`,
        type: f.type,
        headcountRequired: f.type === 'headcount' ? f.headcountRequired : undefined,
      },
      participants: [],
      headcountParticipants: [],
    }))

    // Persist station names for next session pre-fill
    saveStationsConfig(stations.map(s => s.config))

    // Preserve timeConfig if same group, reset if group changed
    const preserveTime = session?.groupId === selectedGroupId && session?.timeConfig
    initSession({
      mode: 'new',
      groupId: selectedGroupId,
      groupName: selectedGroup.name,
      stations,
      timeConfig: preserveTime ? session!.timeConfig : { ...DEFAULT_TIME_CONFIG },
      scheduleName: session?.groupId === selectedGroupId ? (session?.scheduleName ?? '') : '',
      date,
    })

    navigate('/schedule/new/step2')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (groups.length === 0) {
    return (
      <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
        <StepIndicator current={1} total={4} />
        <p className="mb-4 text-gray-400">אין קבוצות שמורות. צור קבוצה לפני יצירת לוח שמירה.</p>
        <button
          onClick={() => navigate('/')}
          className="w-full rounded-2xl border border-gray-600 py-3 text-sm text-gray-300 active:bg-gray-800"
        >
          → חזרה לדף הבית
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <StepIndicator current={1} total={4} />
      <h1 className="mb-6 text-xl font-bold text-gray-100">הגדרת עמדות</h1>

      {/* Group selector */}
      <div className="mb-4">
        <label className="mb-1 block text-sm text-gray-400">קבוצה</label>
        {groups.length === 1 ? (
          <div className="rounded-xl bg-gray-800 px-4 py-2.5 text-gray-100">
            {groups[0].name}
            <span className="mr-2 text-xs text-gray-400">
              ({groups[0].members.filter(m => m.availability === 'base').length} זמינים)
            </span>
          </div>
        ) : (
          <select
            value={selectedGroupId}
            onChange={e => { setSelectedGroupId(e.target.value); setError('') }}
            className="w-full rounded-xl bg-gray-800 px-4 py-2.5 text-gray-100 outline-none ring-1 ring-gray-600 focus:ring-blue-500"
          >
            {groups.map(g => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.members.filter(m => m.availability === 'base').length} זמינים)
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Date */}
      <div className="mb-6">
        <label className="mb-1 block text-sm text-gray-400">תאריך</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full rounded-xl bg-gray-800 px-4 py-2.5 text-gray-100 outline-none ring-1 ring-gray-600 focus:ring-blue-500 [color-scheme:dark]"
        />
      </div>

      {/* Station count selector */}
      <div className="mb-6">
        <label className="mb-2 block text-sm text-gray-400">מספר עמדות</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6].map(n => (
            <button
              key={n}
              onClick={() => setStationCount(n)}
              className={`h-10 w-10 rounded-xl text-sm font-semibold transition-colors ${
                stationCount === n
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 active:bg-gray-600'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Station cards */}
      <div className="mb-6 flex flex-col gap-3">
        {stationForms.map((station, i) => (
          <div key={station.id} className="rounded-2xl bg-gray-800 p-4">
            <p className="mb-3 text-xs font-semibold text-gray-400">עמדה {i + 1}</p>

            {/* Station name */}
            <input
              type="text"
              value={station.name}
              onChange={e => updateStation(i, { name: e.target.value })}
              placeholder={`עמדה ${i + 1}`}
              className="mb-3 w-full rounded-xl bg-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none ring-1 ring-gray-600 focus:ring-blue-500"
            />

            {/* Type toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => updateStation(i, { type: 'time-based' })}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${
                  station.type === 'time-based'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 active:bg-gray-600'
                }`}
              >
                מבוסס-זמן
              </button>
              <button
                onClick={() => updateStation(i, { type: 'headcount' })}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${
                  station.type === 'headcount'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 active:bg-gray-600'
                }`}
              >
                כוח אדם
              </button>
            </div>

            {/* Headcount required */}
            {station.type === 'headcount' && (
              <div className="mt-3">
                <label className="mb-1 block text-xs text-gray-400">מספר משמרים נדרש</label>
                <input
                  type="number"
                  min={1}
                  value={station.headcountRequired}
                  onChange={e => updateStation(i, { headcountRequired: Math.max(1, Number(e.target.value)) })}
                  className="w-24 rounded-xl bg-gray-700 px-3 py-2 text-sm text-gray-100 outline-none ring-1 ring-gray-600 focus:ring-blue-500"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-900/40 px-4 py-2.5 text-sm text-red-300">{error}</p>}

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/')}
          className="flex-1 rounded-2xl border border-gray-600 py-3 text-sm font-medium text-gray-300 active:bg-gray-800"
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

import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  DndContext,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useWizard } from '../context/WizardContext'
import { buildStationSchedule, addDaysToDate } from '../logic/generateSchedule'
import { parseTimeToMinutes, minutesToTime, calcStationDurations, recalculateStation } from '../logic/scheduling'
import { upsertSchedule } from '../storage/schedules'
import { recordShift } from '../storage/statistics'
import { getCitations, markCitationUsed, upsertCitation } from '../storage/citations'
import { getCitationAuthorLinks, saveCitationAuthorLink, clearCitationAuthorLink } from '../storage/citationAuthorLinks'
import { getGroupById } from '../storage/groups'
import { pickRandomCitation, formatAuthorName } from '../logic/citations'
import { formatDate } from '../logic/formatting'
import StepIndicator from '../components/StepIndicator'
import DragHandle from '../components/DragHandle'
import TimePicker from '../components/TimePicker'
import Modal from '../components/Modal'
import type { Schedule, ScheduleStation, ScheduledParticipant, Citation, RoundingAlgorithm } from '../types'

// ─── Local types ──────────────────────────────────────────────────────────────

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
  roundingAlgorithm: RoundingAlgorithm
  /** Set when the user manually edits end time for this station in the timing modal. */
  endTimeOverride?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function recomputeTimes(items: ReviewItem[], startTime: string, startDate: string): ReviewItem[] {
  let absMinutes = parseTimeToMinutes(startTime)
  return items.map(item => {
    const dayOffset = Math.floor(absMinutes / 1440)
    const pStartTime = minutesToTime(absMinutes % 1440)
    const endAbs = absMinutes + item.durationMinutes
    const pEndTime = minutesToTime(endAbs % 1440)
    absMinutes = endAbs
    const [y, m, d] = startDate.split('-').map(Number)
    const dateObj = new Date(Date.UTC(y, m - 1, d + dayOffset))
    const date = dateObj.toISOString().split('T')[0]
    return { ...item, startTime: pStartTime, endTime: pEndTime, date }
  })
}

function buildReviewStations(session: NonNullable<ReturnType<typeof useWizard>['session']>): ReviewStation[] {
  const participantCounts = session.stations.map(
    s => s.participants.filter(p => !p.skipped).length,
  )

  const globalDurations = calcStationDurations({
    startTime: session.timeConfig.startTime,
    endTime: session.timeConfig.endTime,
    fixedDurationMinutes: session.timeConfig.fixedDurationMinutes,
    roundingAlgorithm: session.timeConfig.roundingAlgorithm,
    unevenMode: session.timeConfig.unevenMode,
    stationParticipantCounts: participantCounts,
  })

  return session.stations.map((ws, si) => {
    const stationRounding = ws.roundingAlgorithm ?? session.timeConfig.roundingAlgorithm

    // If station has a per-station rounding override and end time is set, recalculate independently
    let durationMinutes: number
    if (ws.roundingAlgorithm && (session.timeConfig.endTime || session.timeConfig.fixedDurationMinutes)) {
      const count = participantCounts[si] ?? 0
      const stationDurations = calcStationDurations({
        startTime: ws.startTime,
        endTime: session.timeConfig.endTime,
        fixedDurationMinutes: session.timeConfig.fixedDurationMinutes,
        roundingAlgorithm: stationRounding,
        unevenMode: session.timeConfig.unevenMode,
        stationParticipantCounts: [count],
      })
      durationMinutes = stationDurations[0]?.roundedDurationMinutes ?? 60
    } else {
      durationMinutes = globalDurations[si]?.roundedDurationMinutes ?? 60
    }

    const partsWithDuration = ws.participants
      .filter(p => !p.skipped)
      .map(p => ({ name: p.name, durationMinutes, locked: p.locked }))

    const stStartTime = ws.startTime
    const stStartDate = ws.startDate

    const scheduled = buildStationSchedule(partsWithDuration, stStartTime, stStartDate)

    return {
      stationConfigId: ws.config.id,
      stationName: ws.config.name,
      items: scheduled.map((sp, i) => ({
        id: `${ws.config.id}-${i}`,
        name: sp.name,
        durationMinutes: sp.durationMinutes,
        startTime: sp.startTime,
        endTime: sp.endTime,
        date: sp.date,
        locked: sp.locked,
      })),
      startTime: stStartTime,
      startDate: stStartDate,
      roundingAlgorithm: stationRounding,
    }
  })
}

// ─── Sortable row ─────────────────────────────────────────────────────────────

function SortableReviewRow({
  item,
  onRename,
  onDurationChange,
}: {
  item: ReviewItem
  onRename: (id: string, name: string) => void
  onDurationChange: (id: string, minutes: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(item.name)
  const [editingDuration, setEditingDuration] = useState(false)
  const [durationVal, setDurationVal] = useState(String(item.durationMinutes))
  const nameInputRef = useRef<HTMLInputElement>(null)
  const durationInputRef = useRef<HTMLInputElement>(null)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    boxShadow: isDragging ? '0 4px 16px rgba(0,0,0,0.18)' : undefined,
  }

  function commitName() {
    const trimmed = nameVal.trim()
    if (trimmed) onRename(item.id, trimmed)
    else setNameVal(item.name)
    setEditingName(false)
  }

  function commitDuration() {
    const n = parseInt(durationVal, 10)
    if (!isNaN(n) && n > 0) onDurationChange(item.id, n)
    else setDurationVal(String(item.durationMinutes))
    setEditingDuration(false)
  }

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${isDragging ? 'bg-blue-50 ring-2 ring-blue-400 dark:bg-blue-900/30 dark:ring-blue-500' : 'bg-gray-100 dark:bg-gray-700'}`}>
      {/* Drag handle */}
      <DragHandle attributes={attributes} listeners={listeners} label="גרור לסידור מחדש" />

      {/* Times */}
      <div className="w-24 shrink-0 text-xs text-gray-500 dark:text-gray-400">
        {item.startTime}–{item.endTime}
      </div>

      {/* Name */}
      {editingName ? (
        <input
          ref={nameInputRef}
          value={nameVal}
          onChange={e => setNameVal(e.target.value)}
          onBlur={commitName}
          onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameVal(item.name); setEditingName(false) } }}
          autoFocus
          className="min-w-0 flex-1 rounded bg-gray-200 px-2 py-0.5 text-sm text-gray-900 outline-none dark:bg-gray-600 dark:text-gray-100"
        />
      ) : (
        <button
          onClick={() => { setEditingName(true); setTimeout(() => nameInputRef.current?.select(), 0) }}
          className="min-w-0 flex-1 truncate text-right text-sm text-gray-900 dark:text-gray-100"
        >
          {item.name}
        </button>
      )}

      {/* Duration */}
      {editingDuration ? (
        <input
          ref={durationInputRef}
          value={durationVal}
          onChange={e => setDurationVal(e.target.value)}
          onBlur={commitDuration}
          onKeyDown={e => { if (e.key === 'Enter') commitDuration(); if (e.key === 'Escape') { setDurationVal(String(item.durationMinutes)); setEditingDuration(false) } }}
          autoFocus
          type="number"
          min={1}
          className="w-14 rounded bg-gray-200 px-2 py-0.5 text-center text-xs text-gray-900 outline-none dark:bg-gray-600 dark:text-gray-100"
        />
      ) : (
        <button
          onClick={() => { setEditingDuration(true); setTimeout(() => durationInputRef.current?.select(), 0) }}
          className="shrink-0 rounded px-2 py-0.5 text-xs text-gray-500 active:bg-gray-200 dark:text-gray-400 dark:active:bg-gray-600"
          title="ערוך משך"
        >
          {item.durationMinutes}′
        </button>
      )}

    </div>
  )
}

// ─── Collision detection ──────────────────────────────────────────────────────

const dragCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args)
  if (pointerHits.length > 0) return pointerHits
  return closestCenter(args)
}

// ─── Droppable zone ───────────────────────────────────────────────────────────

function DroppableZone({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id })
  return <div ref={setNodeRef} className="min-h-[2rem] overflow-visible">{children}</div>
}

// ─── Station card ─────────────────────────────────────────────────────────────

const ROUNDING_OPTIONS: { value: RoundingAlgorithm; label: string }[] = [
  { value: 'round-up-10', label: "עיגול מעלה ל-10 דק׳" },
  { value: 'round-up-5', label: "עיגול מעלה ל-5 דק׳" },
  { value: 'round-nearest', label: 'עיגול לדקה הקרובה' },
]

function ReviewStationCard({
  station,
  onRename,
  onDurationChange,
  onAdd,
  onTimingConfigChange,
}: {
  station: ReviewStation
  onRename: (id: string, name: string) => void
  onDurationChange: (id: string, stationId: string, minutes: number) => void
  onAdd: (stationId: string, name: string) => void
  onTimingConfigChange: (stationId: string, config: { startTime?: string; endTime?: string; roundingAlgorithm?: RoundingAlgorithm }) => void
}) {
  const [addName, setAddName] = useState('')
  const [timingModalOpen, setTimingModalOpen] = useState(false)

  const computedEndTime = station.items[station.items.length - 1]?.endTime ?? ''

  const [draftStartTime, setDraftStartTime] = useState(station.startTime)
  const [draftEndTime, setDraftEndTime] = useState(computedEndTime)

  const startDate = station.startDate
  const endDate = draftEndTime < draftStartTime ? addDaysToDate(startDate, 1) : startDate
  const crossesMidnight = startDate !== endDate
  const [draftRounding, setDraftRounding] = useState<RoundingAlgorithm>(station.roundingAlgorithm)

  function openTimingModal() {
    setDraftStartTime(station.startTime)
    setDraftEndTime(station.items[station.items.length - 1]?.endTime ?? computedEndTime)
    setDraftRounding(station.roundingAlgorithm)
    setTimingModalOpen(true)
  }

  function handleSaveTiming() {
    onTimingConfigChange(station.stationConfigId, {
      startTime: draftStartTime,
      endTime: draftEndTime,
      roundingAlgorithm: draftRounding,
    })
    setTimingModalOpen(false)
  }

  return (
    <div className="rounded-2xl bg-white p-4 dark:bg-gray-800 overflow-visible">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{station.stationName}</p>
        <button
          onClick={openTimingModal}
          className="rounded-lg bg-gray-100 p-2 text-gray-500 active:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:active:bg-gray-600"
          aria-label={`הגדרות תזמון עמדה ${station.stationName}`}
        >
          ⚙️
        </button>
      </div>

      {timingModalOpen && (
        <Modal onClose={() => setTimingModalOpen(false)} title={`הגדרות תזמון — ${station.stationName}`}>
            {/* Start time */}
            <div className="mb-4 flex items-center justify-between gap-4">
              <label className="text-sm text-gray-600 dark:text-gray-400 shrink-0">שעת התחלה:</label>
              <div className="flex items-center gap-2">
                <TimePicker value={draftStartTime} onChange={setDraftStartTime} />
                {crossesMidnight && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(startDate)}</span>
                )}
              </div>
            </div>

            {/* End time */}
            <div className="mb-4 flex items-center justify-between gap-4">
              <label className="text-sm text-gray-600 dark:text-gray-400 shrink-0">שעת סיום:</label>
              <div className="flex items-center gap-2">
                <TimePicker value={draftEndTime} onChange={setDraftEndTime} />
                {crossesMidnight && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(endDate)}</span>
                )}
              </div>
            </div>

            {/* Rounding */}
            <div className="mb-6">
              <label className="mb-2 block text-sm text-gray-600 dark:text-gray-400">עיגול משמרת:</label>
              <div className="flex flex-col gap-2">
                {ROUNDING_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                    <input
                      type="radio"
                      name={`rounding-${station.stationConfigId}`}
                      value={opt.value}
                      checked={draftRounding === opt.value}
                      onChange={() => setDraftRounding(opt.value)}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <span className="text-sm text-gray-800 dark:text-gray-200">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setTimingModalOpen(false)}
                className="flex-1 rounded-2xl border border-gray-300 py-3 text-sm font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
              >
                ביטול
              </button>
              <button
                onClick={handleSaveTiming}
                className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700"
              >
                שמור
              </button>
            </div>
        </Modal>
      )}

      <SortableContext items={station.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <DroppableZone id={station.stationConfigId}>
          <div className="flex flex-col gap-1.5">
            {station.items.map(item => (
              <SortableReviewRow
                key={item.id}
                item={item}
                onRename={onRename}
                onDurationChange={(id, mins) => onDurationChange(id, station.stationConfigId, mins)}
              />
            ))}
          </div>
        </DroppableZone>
      </SortableContext>

      {/* Add participant */}
      <div className="mt-3 flex gap-2">
        <input
          value={addName}
          onChange={e => setAddName(e.target.value)}
          placeholder="הוסף משתתף..."
          onKeyDown={e => {
            if (e.key === 'Enter' && addName.trim()) {
              onAdd(station.stationConfigId, addName.trim())
              setAddName('')
            }
          }}
          className="min-w-0 flex-1 rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
        />
        <button
          onClick={() => { if (addName.trim()) { onAdd(station.stationConfigId, addName.trim()); setAddName('') } }}
          className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700 active:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:active:bg-gray-600"
        >
          +
        </button>
      </div>
    </div>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function Step4_Review() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, updateSession, updateStations } = useWizard()

  const [stations, setStations] = useState<ReviewStation[]>(() => {
    if (!session) return []
    return buildReviewStations(session)
  })

  // Runs once on mount to apply citation from navigation state, then clears it
  // Apply a citation selected from CitationsScreen.
  useEffect(() => {
    const state = location.state as {
      selectedCitation?: Citation
    } | null
    let shouldClearState = false
    if (state?.selectedCitation) {
      setCitationModeState('collection')
      setSelectedCitation(state.selectedCitation)
      shouldClearState = true
    }
    if (shouldClearState) {
      navigate(location.pathname, { replace: true, state: null })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const defaultName = 'רשימת שמירה'
  const [scheduleName, setScheduleName] = useState(session?.scheduleName || defaultName)
  const [quote, setQuote] = useState(session?.quote ?? '')
  const [quoteAuthor, setQuoteAuthor] = useState(session?.quoteAuthor ?? '')
  const [citationMode, setCitationModeState] = useState<'random' | 'collection' | 'manual'>(
    session?.citationMode ?? 'manual'
  )
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(() => {
    if (!session?.citationId) return null
    return getCitations().find(c => c.id === session.citationId) ?? null
  })
  const [error, setError] = useState('')
  // Warrior linked to the current DB citation (random or collection mode)
  const [citationLinkedMemberId, setCitationLinkedMemberId] = useState<string>(() => {
    if (!session?.citationId) return ''
    const citation = getCitations().find(c => c.id === session.citationId)
    if (!citation?.author) return ''
    const link = getCitationAuthorLinks()[citation.author]
    return link && link !== 'skip' ? link : ''
  })
  // Manual mode: save citation to the DB collection
  const [saveToCollection, setSaveToCollection] = useState(session?.saveToCollection ?? true)
  const [autoFormatAuthor, setAutoFormatAuthor] = useState(session?.autoFormatAuthor ?? true)
  const [manualLinkedMemberId, setManualLinkedMemberId] = useState('')

  function setCitationMode(mode: 'random' | 'collection' | 'manual') {
    setCitationModeState(mode)
    if (mode === 'random') {
      const all = getCitations()
      const picked = pickRandomCitation(all)
      setSelectedCitation(picked ?? null)
    } else if (mode === 'collection') {
      setSelectedCitation(null)
    }
  }

  function handleRerollCitation() {
    const all = getCitations()
    const picked = pickRandomCitation(all)
    setSelectedCitation(picked ?? null)
  }

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
    useSensor(PointerSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Snapshot of stations at drag-start — used to restore on cancel or to detect cross-station moves in onDragEnd.
  const stationsSnapshotRef = useRef<ReviewStation[] | null>(null)

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  // Sync warrior-link dropdown when the selected citation changes (reroll / collection pick)
  useEffect(() => {
    if (!selectedCitation?.author) { setCitationLinkedMemberId(''); return }
    const link = getCitationAuthorLinks()[selectedCitation.author]
    setCitationLinkedMemberId(link && link !== 'skip' ? link : '')
  }, [selectedCitation])

  useEffect(() => { if (!session) navigate('/fallback') }, [session, navigate])
  if (!session) return null

  const groupMembers = getGroupById(session.groupId)?.members ?? []

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleRename(itemId: string, newName: string) {
    setStations(prev => prev.map(st => ({
      ...st,
      items: st.items.map(it => it.id === itemId ? { ...it, name: newName } : it),
    })))
  }

  function handleDurationChange(itemId: string, stationId: string, minutes: number) {
    setStations(prev => prev.map(st => {
      if (st.stationConfigId !== stationId) return st
      const newItems = st.items.map(it => it.id === itemId ? { ...it, durationMinutes: minutes } : it)
      return { ...st, items: recomputeTimes(newItems, st.startTime, st.startDate) }
    }))
  }

  function handleTimingConfigChange(stationId: string, config: {
    startTime?: string; endTime?: string; roundingAlgorithm?: RoundingAlgorithm
  }) {
    setStations(prev => prev.map(st => {
      if (st.stationConfigId !== stationId) return st
      const resolvedRounding = config.roundingAlgorithm ?? st.roundingAlgorithm
      const newStartTime = config.startTime ?? st.startTime
      const parts = st.items.map(it => ({ name: it.name, locked: it.locked }))
      if (parts.length === 0) return { ...st, roundingAlgorithm: resolvedRounding, startTime: newStartTime }

      if (config.endTime) {
        const recalculated = recalculateStation(parts, newStartTime, st.startDate, config.endTime, resolvedRounding)
        const newItems: ReviewItem[] = recalculated.map((sp, j) => ({
          id: st.items[j]?.id ?? `${stationId}-recalc-${j}`,
          name: sp.name,
          durationMinutes: sp.durationMinutes,
          startTime: sp.startTime,
          endTime: sp.endTime,
          date: sp.date,
          locked: sp.locked,
        }))
        return { ...st, items: newItems, startTime: newStartTime, roundingAlgorithm: resolvedRounding, endTimeOverride: config.endTime }
      }

      return { ...st, items: recomputeTimes(st.items, newStartTime, st.startDate), startTime: newStartTime, roundingAlgorithm: resolvedRounding }
    }))

    if (config.roundingAlgorithm && session) {
      const updated = session.stations.map(ws =>
        ws.config.id === stationId ? { ...ws, roundingAlgorithm: config.roundingAlgorithm } : ws
      )
      updateStations(updated)
    }
  }

  function handleAdd(stationId: string, name: string) {
    setStations(prev => prev.map(st => {
      if (st.stationConfigId !== stationId) return st
      const lastItem = st.items[st.items.length - 1]
      const duration = lastItem?.durationMinutes ?? 60
      const newItem: ReviewItem = {
        id: `${stationId}-add-${Date.now()}`,
        name,
        durationMinutes: duration,
        startTime: '',
        endTime: '',
        date: st.startDate,
        locked: false,
      }
      const newItems = recomputeTimes([...st.items, newItem], st.startTime, st.startDate)
      return { ...st, items: newItems }
    }))
  }

  // onDragOver: fires continuously as the pointer moves.
  // Cross-station: immediately move the item to the hovered position in the target station
  // so target items shift apart to preview insertion — same pattern as Step3_Order.
  // No time recalculation here; that happens once in onDragEnd.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || active.id === over.id) return

    const activeIdStr = String(active.id)
    const overIdStr = String(over.id)

    setStations(prev => {
      const srcIdx = prev.findIndex(st => st.items.some(i => i.id === activeIdStr))
      if (srcIdx === -1) return prev

      let dstIdx = prev.findIndex(st => st.items.some(i => i.id === overIdStr))
      if (dstIdx === -1) dstIdx = prev.findIndex(st => st.stationConfigId === overIdStr)
      if (dstIdx === -1 || dstIdx === srcIdx) return prev

      const activeItem = prev[srcIdx].items.find(i => i.id === activeIdStr)
      if (!activeItem) return prev

      return prev.map((st, idx) => {
        if (idx === srcIdx) return { ...st, items: st.items.filter(i => i.id !== activeIdStr) }
        if (idx === dstIdx) {
          const items = [...st.items]
          const pos = items.findIndex(i => i.id === overIdStr)
          if (pos >= 0) items.splice(pos, 0, activeItem)
          else items.push(activeItem)
          return { ...st, items }
        }
        return st
      })
    })
  }

  // onDragEnd: finalize same-station sort or accept cross-station move already done by onDragOver.
  // Recalculates durations for all stations after any reorder (counts may have changed).
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    const snap = stationsSnapshotRef.current
    stationsSnapshotRef.current = null

    if (!over) {
      if (snap) setStations(snap)
      return
    }

    if (!session) return

    const activeIdStr = String(active.id)
    const overIdStr = String(over.id)

    // Find where the item currently is (may have been moved by onDragOver)
    const curStIdx = stations.findIndex(st => st.items.some(i => i.id === activeIdStr))
    if (curStIdx === -1) return

    const curStation = stations[curStIdx]

    // Detect cross-station move: compare current station to snapshot's station
    const originalStation = snap?.find(st => st.items.some(i => i.id === activeIdStr))
    const isCrossStation = originalStation && originalStation.stationConfigId !== curStation.stationConfigId

    if (isCrossStation) {
      // Guard: disallow if the source station would have been left empty
      const srcSnap = snap?.find(st => st.stationConfigId === originalStation!.stationConfigId)
      if (srcSnap && srcSnap.items.length <= 1) {
        setError('לא ניתן להעביר — העמדה תישאר ריקה')
        if (snap) setStations(snap)
        return
      }
    }

    // Finalize within-station position (arrayMove if over an item in the same station)
    const oldIdx = curStation.items.findIndex(i => i.id === activeIdStr)
    const newIdx = curStation.items.findIndex(i => i.id === overIdStr)
    let reordered = stations
    if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) {
      reordered = stations.map((st, i) =>
        i === curStIdx ? { ...st, items: arrayMove(st.items, oldIdx, newIdx) } : st
      )
    }

    // Recalculate durations for all stations (participant counts may have changed).
    // Stations that have a user-edited end time override keep their custom timing via
    // recalculateStation; only stations without an override use the global session config.
    const counts = reordered.map(s => s.items.length)
    const durations = calcStationDurations({
      startTime: session.timeConfig.startTime,
      endTime: session.timeConfig.endTime,
      fixedDurationMinutes: session.timeConfig.fixedDurationMinutes,
      roundingAlgorithm: session.timeConfig.roundingAlgorithm,
      unevenMode: session.timeConfig.unevenMode,
      stationParticipantCounts: counts,
    })

    setStations(reordered.map((st, idx) => {
      if (st.endTimeOverride && st.items.length > 0) {
        // Station has a user-set end time — preserve it by recalculating from that end time.
        const parts = st.items.map(it => ({ name: it.name, locked: it.locked }))
        const recalculated = recalculateStation(parts, st.startTime, st.startDate, st.endTimeOverride, st.roundingAlgorithm)
        const newItems: ReviewItem[] = recalculated.map((sp, j) => ({
          id: st.items[j]?.id ?? `${st.stationConfigId}-drag-${j}`,
          name: sp.name,
          durationMinutes: sp.durationMinutes,
          startTime: sp.startTime,
          endTime: sp.endTime,
          date: sp.date,
          locked: sp.locked,
        }))
        return { ...st, items: newItems }
      }
      const dur = durations[idx]?.roundedDurationMinutes ?? 60
      const newItems = st.items.map(it => ({ ...it, durationMinutes: dur }))
      return { ...st, items: recomputeTimes(newItems, st.startTime, st.startDate) }
    }))
  }

  function handleDragCancel() {
    if (stationsSnapshotRef.current) setStations(stationsSnapshotRef.current)
    stationsSnapshotRef.current = null
  }

  // ── Create schedule ────────────────────────────────────────────────────────

  function handleCreate() {
    if (!session) return
    const name = scheduleName.trim() || defaultName

    const hasParticipants = stations.some(st => st.items.length > 0)
    if (!hasParticipants) {
      setError('יש להוסיף לפחות משתתף אחד')
      return
    }

    const isFirstSave = !session.createdScheduleId
    const scheduleId = session.createdScheduleId ?? crypto.randomUUID()

    // Resolve citation for the schedule
    let finalQuote: string | undefined
    let finalQuoteAuthor: string | undefined
    let usedCitationId: string | undefined
    if ((citationMode === 'random' || citationMode === 'collection') && selectedCitation) {
      finalQuote = selectedCitation.text
      finalQuoteAuthor = selectedCitation.author || undefined
      usedCitationId = selectedCitation.id
    } else if (citationMode === 'manual') {
      finalQuote = quote.trim() || undefined
      finalQuoteAuthor = quoteAuthor.trim() || undefined
    }

    const scheduleStations: ScheduleStation[] = stations.map(st => {
      const participants: ScheduledParticipant[] = st.items.map(item => ({
        name: item.name,
        startTime: item.startTime,
        endTime: item.endTime,
        date: item.date,
        durationMinutes: item.durationMinutes,
        locked: item.locked,
        skipped: false,
      }))
      return {
        stationConfigId: st.stationConfigId,
        stationName: st.stationName,
        stationType: 'time-based',
        participants,
      }
    })

    const schedule: Schedule = {
      id: scheduleId,
      name,
      groupId: session.groupId,
      createdAt: new Date().toISOString(),
      date: session.date,
      parentScheduleId: session.parentScheduleId,
      stations: scheduleStations,
      unevenDistributionMode: session.timeConfig.unevenMode,
      quote: finalQuote,
      quoteAuthor: finalQuoteAuthor,
    }

    upsertSchedule(schedule)

    // Mark DB citation as used (idempotent — storage helper guards duplicates)
    if (usedCitationId) {
      markCitationUsed(usedCitationId, scheduleId)
    }

    // Save manual citation to collection if requested, and warrior link if provided
    if (citationMode === 'manual' && finalQuote) {
      const formattedAuthor = finalQuoteAuthor ? formatAuthorName(finalQuoteAuthor) : ''
      if (saveToCollection) {
        upsertCitation({ id: crypto.randomUUID(), text: finalQuote, author: formattedAuthor, usedInListIds: [scheduleId] })
      }
      if (manualLinkedMemberId && formattedAuthor) {
        saveCitationAuthorLink(formattedAuthor, manualLinkedMemberId)
      }
    }

    if (isFirstSave) {
      for (const st of scheduleStations) {
        for (const p of st.participants) {
          recordShift(p.name, {
            scheduleId,
            scheduleName: name,
            stationName: st.stationName,
            date: p.date,
            startTime: p.startTime,
            endTime: p.endTime,
            durationMinutes: p.durationMinutes,
          })
        }
      }
    }

    const updatedStations: typeof session.stations = session.stations.map(ws => {
      const rs = stations.find(s => s.stationConfigId === ws.config.id)
      if (!rs) return ws
      return {
        ...ws,
        participants: rs.items.map(item => ({
          name: item.name,
          locked: item.locked,
          skipped: false,
        })),
      }
    })

    updateSession({
      scheduleName: name,
      createdScheduleId: scheduleId,
      stations: updatedStations,
      quote: finalQuote,
      quoteAuthor: finalQuoteAuthor,
      citationMode,
      citationId: usedCitationId,
    })

    navigate(`/schedule/${scheduleId}/result`)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="animate-fadein mx-auto max-w-lg touch-pan-y px-4 py-6">
      <StepIndicator current={4} total={4} />
      <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-gray-100">סקירה ועריכה</h1>

      {/* Schedule name */}
      <div className="mb-4">
        <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">שם לוח השמירה</label>
        <input
          value={scheduleName}
          onChange={e => setScheduleName(e.target.value)}
          placeholder={defaultName}
          className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
        />
      </div>

      {/* Stations */}
      <DndContext
        sensors={sensors}
        collisionDetection={dragCollisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={() => { stationsSnapshotRef.current = stations }}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="mb-6 flex flex-col gap-4">
          {stations.map(st => (
            <ReviewStationCard
              key={st.stationConfigId}
              station={st}
              onRename={handleRename}
              onDurationChange={handleDurationChange}
              onAdd={handleAdd}
              onTimingConfigChange={handleTimingConfigChange}
            />
          ))}
        </div>

      </DndContext>

      {/* Citation section */}
      <div className="mb-6">
        <label className="mb-2 block text-sm text-gray-500 dark:text-gray-400">ציטוט</label>

        {/* Mode toggle */}
        <div className="mb-3 flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          {(['random', 'collection', 'manual'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setCitationMode(mode)}
              className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                citationMode === mode
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                  : 'text-gray-500 active:text-gray-700 dark:text-gray-400'
              }`}
            >
              {mode === 'random' ? 'ציטוט אקראי' : mode === 'collection' ? 'בחר מהאוסף' : 'ציטוט ידני'}
            </button>
          ))}
        </div>

        {/* Random mode */}
        {citationMode === 'random' && (
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
            {selectedCitation ? (
              <>
                <p className="mb-1 text-sm text-gray-900 dark:text-gray-100">
                  ״{selectedCitation.text}״
                </p>
                {selectedCitation.author && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">— {selectedCitation.author}</p>
                )}
                <button
                  onClick={handleRerollCitation}
                  className="mt-3 text-xs text-blue-600 dark:text-blue-400"
                >
                  הגרל שוב
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">אין ציטוטים זמינים.</p>
            )}
          </div>
        )}

        {/* Collection mode */}
        {citationMode === 'collection' && (
          <>
            {selectedCitation ? (
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
                <p className="mb-1 text-sm text-gray-900 dark:text-gray-100">
                  ״{selectedCitation.text}״
                </p>
                {selectedCitation.author && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">— {selectedCitation.author}</p>
                )}
                <button
                  onClick={() => navigate('/citations', { state: { selectionMode: true } })}
                  className="mt-3 text-xs text-blue-600 dark:text-blue-400"
                >
                  שנה בחירה
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate('/citations', { state: { selectionMode: true } })}
                className="w-full rounded-xl border border-dashed border-gray-300 py-4 text-sm text-blue-600 dark:border-gray-600 dark:text-blue-400"
              >
                בחר מהאוסף →
              </button>
            )}
          </>
        )}

        {/* Warrior link — shown when a DB citation with an author is selected (random or collection) */}
        {(citationMode === 'random' || citationMode === 'collection') && selectedCitation?.author && groupMembers.length > 0 && (
          <div className="mt-3">
            <label className="mb-1 block text-xs text-gray-400 dark:text-gray-500">לוחם מקושר (אופציונלי)</label>
            <select
              value={citationLinkedMemberId}
              onChange={e => {
                const val = e.target.value
                setCitationLinkedMemberId(val)
                if (val) saveCitationAuthorLink(selectedCitation.author, val)
                else clearCitationAuthorLink(selectedCitation.author)
              }}
              className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 outline-none dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">ללא שיוך</option>
              {groupMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Manual mode */}
        {citationMode === 'manual' && (
          <>
            <textarea
              value={quote}
              onChange={e => setQuote(e.target.value)}
              placeholder="הוסף ציטוט..."
              rows={2}
              className="w-full resize-none rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
            />
            {quote.trim() && (
              <>
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="text-sm text-gray-500 dark:text-gray-400">מחבר הציטוט</label>
                    <div className="flex min-h-[44px] items-center gap-2">
                      <span className="text-xs text-gray-400 dark:text-gray-500">עיצוב אוטומטי של שם</span>
                      <button
                        role="switch"
                        aria-checked={autoFormatAuthor}
                        onClick={() => {
                          const next = !autoFormatAuthor
                          setAutoFormatAuthor(next)
                          updateSession({ autoFormatAuthor: next })
                        }}
                        className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
                          autoFormatAuthor ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                            autoFormatAuthor ? 'left-0.5 translate-x-5' : 'left-0.5 translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                  <input
                    value={quoteAuthor}
                    onChange={e => setQuoteAuthor(e.target.value)}
                    onBlur={() => {
                      if (!autoFormatAuthor) return
                      const formatted = formatAuthorName(quoteAuthor)
                      setQuoteAuthor(formatted)
                      updateSession({ quoteAuthor: formatted })
                    }}
                    placeholder="שם המחבר..."
                    className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
                  />
                </div>
                {groupMembers.length > 0 && (
                  <div className="mt-3">
                    <label className="mb-1 block text-xs text-gray-400 dark:text-gray-500">שייך ללוחם (אופציונלי)</label>
                    <select
                      value={manualLinkedMemberId}
                      onChange={e => {
                        const val = e.target.value
                        setManualLinkedMemberId(val)
                        if (val && !quoteAuthor.trim()) {
                          const warrior = groupMembers.find(m => m.id === val)
                          if (warrior) setQuoteAuthor(formatAuthorName(warrior.name))
                        }
                      }}
                      className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 outline-none dark:bg-gray-800 dark:text-gray-100"
                    >
                      <option value="">ללא שיוך</option>
                      {groupMembers.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="mt-3 flex min-h-[44px] items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">שמור לאוסף</span>
                  <button
                    role="switch"
                    aria-checked={saveToCollection}
                    onClick={() => {
                      const next = !saveToCollection
                      setSaveToCollection(next)
                      updateSession({ saveToCollection: next })
                    }}
                    className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
                      saveToCollection ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                        saveToCollection ? 'left-0.5 translate-x-5' : 'left-0.5 translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-900/40 dark:text-red-300">{error}</p>}

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/schedule/new/step3')}
          className="flex-1 rounded-2xl border border-gray-300 py-3 text-sm font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
        >
          ← חזרה
        </button>
        <button
          onClick={handleCreate}
          className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700"
        >
          צור לוח שמירה ✓
        </button>
      </div>

    </div>
  )
}

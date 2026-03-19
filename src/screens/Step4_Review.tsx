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
  type DragEndEvent,
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
import { buildStationSchedule } from '../logic/generateSchedule'
import { parseTimeToMinutes, minutesToTime, calcStationDurations } from '../logic/scheduling'
import { upsertSchedule } from '../storage/schedules'
import { recordShift } from '../storage/statistics'
import StepIndicator from '../components/StepIndicator'
import DragHandle from '../components/DragHandle'
import type { Schedule, ScheduleStation, ScheduledParticipant } from '../types'

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

  const durations = calcStationDurations({
    startTime: session.timeConfig.startTime,
    endTime: session.timeConfig.endTime,
    fixedDurationMinutes: session.timeConfig.fixedDurationMinutes,
    roundingAlgorithm: session.timeConfig.roundingAlgorithm,
    unevenMode: session.timeConfig.unevenMode,
    stationParticipantCounts: participantCounts,
  })

  return session.stations.map((ws, si) => {
    const durationMinutes = durations[si]?.roundedDurationMinutes ?? 60

    const partsWithDuration = ws.participants
      .filter(p => !p.skipped)
      .map(p => ({ name: p.name, durationMinutes, locked: p.locked }))

    const stStartTime = ws.startTimeOverride ?? session.timeConfig.startTime
    const stStartDate = ws.startDateOverride ?? session.date

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
    }
  })
}

// ─── Sortable row ─────────────────────────────────────────────────────────────

function SortableReviewRow({
  item,
  stationId,
  allStations,
  onRename,
  onDurationChange,
  onRemove,
  onMove,
}: {
  item: ReviewItem
  stationId: string
  allStations: ReviewStation[]
  onRename: (id: string, name: string) => void
  onDurationChange: (id: string, minutes: number) => void
  onRemove: (id: string, stationId: string) => void
  onMove: (itemId: string, fromStationId: string, toStationId: string) => void
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
    opacity: isDragging ? 0.3 : 1,
  }

  const otherStations = allStations.filter(s => s.stationConfigId !== stationId)

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
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 dark:bg-gray-700">
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

      {/* Move to station */}
      {otherStations.length > 0 && (
        <select
          value=""
          onChange={e => { if (e.target.value) onMove(item.id, stationId, e.target.value) }}
          className="shrink-0 rounded bg-gray-200 px-1 py-0.5 text-xs text-gray-700 outline-none dark:bg-gray-600 dark:text-gray-300"
          title="העבר לעמדה"
        >
          <option value="">↔</option>
          {otherStations.map(s => (
            <option key={s.stationConfigId} value={s.stationConfigId}>{s.stationName}</option>
          ))}
        </select>
      )}

      {/* Remove */}
      <button
        onClick={() => onRemove(item.id, stationId)}
        className="shrink-0 text-red-500 active:text-red-400 dark:text-red-400 dark:active:text-red-300"
        aria-label="הסר"
      >
        ✕
      </button>
    </div>
  )
}

// ─── Droppable zone ───────────────────────────────────────────────────────────

function DroppableZone({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id })
  return <div ref={setNodeRef} className="min-h-[2rem]">{children}</div>
}

// ─── Station card ─────────────────────────────────────────────────────────────

function ReviewStationCard({
  station,
  allStations,
  onRename,
  onDurationChange,
  onRemove,
  onMove,
  onAdd,
}: {
  station: ReviewStation
  allStations: ReviewStation[]
  onRename: (id: string, name: string) => void
  onDurationChange: (id: string, stationId: string, minutes: number) => void
  onRemove: (id: string, stationId: string) => void
  onMove: (itemId: string, fromStationId: string, toStationId: string) => void
  onAdd: (stationId: string, name: string) => void
}) {
  const [addName, setAddName] = useState('')

  return (
    <div className="rounded-2xl bg-white p-4 dark:bg-gray-800">
      <p className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">{station.stationName}</p>

      <SortableContext items={station.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <DroppableZone id={station.stationConfigId}>
          <div className="flex flex-col gap-1.5">
            {station.items.map(item => (
              <SortableReviewRow
                key={item.id}
                item={item}
                stationId={station.stationConfigId}
                allStations={allStations}
                onRename={onRename}
                onDurationChange={(id, mins) => onDurationChange(id, station.stationConfigId, mins)}
                onRemove={onRemove}
                onMove={onMove}
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
  const { session, updateSession } = useWizard()

  const [stations, setStations] = useState<ReviewStation[]>(() => {
    if (!session) return []
    return buildReviewStations(session)
  })

  // Apply recalculated station data coming back from RecalculateScreen
  useEffect(() => {
    const state = location.state as { recalculatedStation?: { stationConfigId: string; items: ReviewItem[] } } | null
    if (state?.recalculatedStation) {
      const { stationConfigId, items } = state.recalculatedStation
      setStations(prev => prev.map(st =>
        st.stationConfigId === stationConfigId ? { ...st, items } : st
      ))
      // Clear the state so re-renders don't re-apply
      navigate(location.pathname, { replace: true, state: null })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const defaultName = 'רשימת שמירה'
  const [scheduleName, setScheduleName] = useState(session?.scheduleName || defaultName)
  const [quote, setQuote] = useState(session?.quote ?? '')
  const [quoteAuthor, setQuoteAuthor] = useState(session?.quoteAuthor ?? '')
  const [error, setError] = useState('')

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 1000, tolerance: 5 } }),
    useSensor(PointerSensor, { activationConstraint: { delay: 1000, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  if (!session) {
    return (
      <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
        <p className="text-gray-500 dark:text-gray-400">אין סשן פעיל. <button onClick={() => navigate('/')} className="text-blue-600 underline dark:text-blue-400">חזרה לדף הבית</button></p>
      </div>
    )
  }

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

  function handleRemove(itemId: string, stationId: string) {
    setStations(prev => prev.map(st => {
      if (st.stationConfigId !== stationId) return st
      const newItems = st.items.filter(it => it.id !== itemId)
      return { ...st, items: recomputeTimes(newItems, st.startTime, st.startDate) }
    }))
  }

  function handleMove(itemId: string, fromStationId: string, toStationId: string) {
    if (!session) return
    const fromSt = stations.find(s => s.stationConfigId === fromStationId)
    const item = fromSt?.items.find(i => i.id === itemId)
    if (!item) return

    if (fromSt && fromSt.items.length <= 1) {
      setError('לא ניתן להעביר — העמדה תישאר ריקה')
      return
    }

    setError('')

    const moved = stations.map(st => {
      if (st.stationConfigId === fromStationId) {
        return { ...st, items: st.items.filter(i => i.id !== itemId) }
      }
      if (st.stationConfigId === toStationId) {
        return { ...st, items: [...st.items, { ...item, id: `${toStationId}-${Date.now()}` }] }
      }
      return st
    })

    const counts = moved.map(s => s.items.length)
    const durations = calcStationDurations({
      startTime: session.timeConfig.startTime,
      endTime: session.timeConfig.endTime,
      fixedDurationMinutes: session.timeConfig.fixedDurationMinutes,
      roundingAlgorithm: session.timeConfig.roundingAlgorithm,
      unevenMode: session.timeConfig.unevenMode,
      stationParticipantCounts: counts,
    })

    setStations(moved.map((st, idx) => {
      const dur = durations[idx]?.roundedDurationMinutes ?? 60
      const newItems = st.items.map(it => ({ ...it, durationMinutes: dur }))
      return { ...st, items: recomputeTimes(newItems, st.startTime, st.startDate) }
    }))
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const activeIdStr = String(active.id)
    const overIdStr = String(over.id)

    const fromStation = stations.find(st => st.items.some(i => i.id === activeIdStr))
    if (!fromStation) return

    const toStation = stations.find(st => st.stationConfigId === overIdStr)
    if (toStation && toStation.stationConfigId !== fromStation.stationConfigId) {
      handleMove(activeIdStr, fromStation.stationConfigId, toStation.stationConfigId)
      return
    }

    const toItemStation = stations.find(st => st.items.some(i => i.id === overIdStr))
    if (!toItemStation) return

    if (fromStation.stationConfigId === toItemStation.stationConfigId) {
      const oldIndex = fromStation.items.findIndex(i => i.id === activeIdStr)
      const newIndex = fromStation.items.findIndex(i => i.id === overIdStr)
      if (oldIndex !== newIndex) {
        setStations(prev => prev.map(st => {
          if (st.stationConfigId !== fromStation.stationConfigId) return st
          const newItems = arrayMove(st.items, oldIndex, newIndex)
          return { ...st, items: recomputeTimes(newItems, st.startTime, st.startDate) }
        }))
      }
    } else {
      handleMove(activeIdStr, fromStation.stationConfigId, toItemStation.stationConfigId)
    }
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
      quote: quote.trim() || undefined,
      quoteAuthor: quoteAuthor.trim() || undefined,
    }

    upsertSchedule(schedule)

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

    updateSession({ scheduleName: name, createdScheduleId: scheduleId, stations: updatedStations, quote: quote.trim() || undefined, quoteAuthor: quoteAuthor.trim() || undefined })
    navigate(`/schedule/${scheduleId}/result`)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
      <StepIndicator current={4} total={4} />
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => navigate('/schedule/new/recalculate', { state: { reviewStations: stations } })}
          className="rounded-xl bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-800 active:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:active:bg-gray-600"
        >
          חישוב זמנים מחדש
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">סקירה ועריכה</h1>
      </div>

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
        collisionDetection={closestCenter}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragEnd={handleDragEnd}
      >
        <div className="mb-6 flex flex-col gap-4">
          {stations.map(st => (
            <ReviewStationCard
              key={st.stationConfigId}
              station={st}
              allStations={stations}
              onRename={handleRename}
              onDurationChange={handleDurationChange}
              onRemove={handleRemove}
              onMove={handleMove}
              onAdd={handleAdd}
            />
          ))}
        </div>

      </DndContext>

      {/* Quote */}
      <div className="mb-4">
        <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">ציטוט (אופציונלי)</label>
        <textarea
          value={quote}
          onChange={e => setQuote(e.target.value)}
          placeholder="הוסף ציטוט..."
          rows={2}
          className="w-full resize-none rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
        />
      </div>
      {quote.trim() && (
        <div className="mb-6">
          <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">מחבר הציטוט</label>
          <input
            value={quoteAuthor}
            onChange={e => setQuoteAuthor(e.target.value)}
            placeholder="שם המחבר..."
            className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
          />
        </div>
      )}

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

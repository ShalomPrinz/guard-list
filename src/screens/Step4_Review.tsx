import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
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
import { addSchedule } from '../storage/schedules'
import { recordShift } from '../storage/statistics'
import StepIndicator from '../components/StepIndicator'
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
  stationType: 'time-based' | 'headcount'
  items: ReviewItem[]
  headcountNames: string[]
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
  return session.stations.map(ws => {
    if (ws.config.type === 'headcount') {
      return {
        stationConfigId: ws.config.id,
        stationName: ws.config.name,
        stationType: 'headcount' as const,
        items: [],
        headcountNames: ws.headcountParticipants,
        startTime: session.timeConfig.startTime,
        startDate: session.date,
      }
    }

    const baseParticipants = session.stations
      .filter(s => s.config.type === 'time-based')
      .map(s => s.participants.filter(p => !p.skipped).length)

    const stationIdx = session.stations
      .filter(s => s.config.type === 'time-based')
      .findIndex(s => s.config.id === ws.config.id)

    const durations = calcStationDurations({
      startTime: session.timeConfig.startTime,
      endTime: session.timeConfig.endTime,
      fixedDurationMinutes: session.timeConfig.fixedDurationMinutes,
      roundingAlgorithm: session.timeConfig.roundingAlgorithm,
      unevenMode: session.timeConfig.unevenMode,
      stationParticipantCounts: baseParticipants,
    })

    const durationMinutes = durations[stationIdx]?.roundedDurationMinutes ?? 60

    const partsWithDuration = ws.participants
      .filter(p => !p.skipped)
      .map(p => ({ name: p.name, durationMinutes, locked: p.locked }))

    const scheduled = buildStationSchedule(partsWithDuration, session.timeConfig.startTime, session.date)

    return {
      stationConfigId: ws.config.id,
      stationName: ws.config.name,
      stationType: 'time-based' as const,
      items: scheduled.map((sp, i) => ({
        id: `${ws.config.id}-${i}`,
        name: sp.name,
        durationMinutes: sp.durationMinutes,
        startTime: sp.startTime,
        endTime: sp.endTime,
        date: sp.date,
        locked: sp.locked,
      })),
      headcountNames: [],
      startTime: session.timeConfig.startTime,
      startDate: session.date,
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
  isDragging,
}: {
  item: ReviewItem
  stationId: string
  allStations: ReviewStation[]
  onRename: (id: string, name: string) => void
  onDurationChange: (id: string, minutes: number) => void
  onRemove: (id: string, stationId: string) => void
  onMove: (itemId: string, fromStationId: string, toStationId: string) => void
  isDragging: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
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

  const otherStations = allStations.filter(s => s.stationConfigId !== stationId && s.stationType === 'time-based')

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
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-xl bg-gray-700 px-3 py-2">
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-gray-500 active:cursor-grabbing"
        aria-label="גרור לסידור מחדש"
      >
        ⠿
      </button>

      {/* Times */}
      <div className="w-24 shrink-0 text-xs text-gray-400">
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
          className="min-w-0 flex-1 rounded bg-gray-600 px-2 py-0.5 text-sm text-gray-100 outline-none"
        />
      ) : (
        <button
          onClick={() => { setEditingName(true); setTimeout(() => nameInputRef.current?.select(), 0) }}
          className="min-w-0 flex-1 truncate text-right text-sm text-gray-100"
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
          className="w-14 rounded bg-gray-600 px-2 py-0.5 text-center text-xs text-gray-100 outline-none"
        />
      ) : (
        <button
          onClick={() => { setEditingDuration(true); setTimeout(() => durationInputRef.current?.select(), 0) }}
          className="shrink-0 rounded px-2 py-0.5 text-xs text-gray-400 active:bg-gray-600"
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
          className="shrink-0 rounded bg-gray-600 px-1 py-0.5 text-xs text-gray-300 outline-none"
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
        className="shrink-0 text-red-400 active:text-red-300"
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
  activeId,
  onRename,
  onDurationChange,
  onRemove,
  onMove,
  onAdd,
}: {
  station: ReviewStation
  allStations: ReviewStation[]
  activeId: string | null
  onRename: (id: string, name: string) => void
  onDurationChange: (id: string, stationId: string, minutes: number) => void
  onRemove: (id: string, stationId: string) => void
  onMove: (itemId: string, fromStationId: string, toStationId: string) => void
  onAdd: (stationId: string, name: string) => void
}) {
  const [addName, setAddName] = useState('')

  if (station.stationType === 'headcount') {
    return (
      <div className="rounded-2xl bg-gray-800 p-4">
        <p className="mb-2 text-sm font-semibold text-gray-200">{station.stationName}</p>
        <p className="mb-1 text-xs text-gray-400">כוח אדם ({station.headcountNames.length})</p>
        {station.headcountNames.map((n, i) => (
          <div key={i} className="py-0.5 text-sm text-gray-300">{n}</div>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-gray-800 p-4">
      <p className="mb-3 text-sm font-semibold text-gray-200">{station.stationName}</p>

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
                isDragging={activeId === item.id}
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
          className="min-w-0 flex-1 rounded-xl bg-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none ring-1 ring-gray-600 focus:ring-blue-500"
        />
        <button
          onClick={() => { if (addName.trim()) { onAdd(station.stationConfigId, addName.trim()); setAddName('') } }}
          className="rounded-xl bg-gray-700 px-3 py-2 text-sm text-gray-300 active:bg-gray-600"
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
  const { session, updateSession, resetSession } = useWizard()

  const [stations, setStations] = useState<ReviewStation[]>(() => {
    if (!session) return []
    return buildReviewStations(session)
  })

  const defaultName = session ? `שמירה ${session.date}` : ''
  const [scheduleName, setScheduleName] = useState(session?.scheduleName || defaultName)
  const [quote, setQuote] = useState('')
  const [quoteAuthor, setQuoteAuthor] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (!session) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <p className="text-gray-400">אין סשן פעיל. <button onClick={() => navigate('/')} className="text-blue-400 underline">חזרה לדף הבית</button></p>
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
    setStations(prev => {
      const fromSt = prev.find(s => s.stationConfigId === fromStationId)
      const item = fromSt?.items.find(i => i.id === itemId)
      if (!item) return prev
      return prev.map(st => {
        if (st.stationConfigId === fromStationId) {
          const newItems = st.items.filter(i => i.id !== itemId)
          return { ...st, items: recomputeTimes(newItems, st.startTime, st.startDate) }
        }
        if (st.stationConfigId === toStationId) {
          const newItems = [...st.items, { ...item, id: `${toStationId}-${Date.now()}` }]
          return { ...st, items: recomputeTimes(newItems, st.startTime, st.startDate) }
        }
        return st
      })
    })
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

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const activeIdStr = String(active.id)
    const overIdStr = String(over.id)

    // Find which station the dragged item belongs to
    const fromStation = stations.find(st => st.items.some(i => i.id === activeIdStr))
    if (!fromStation) return

    // Check if dropped on a station zone (not an item)
    const toStation = stations.find(st => st.stationConfigId === overIdStr)
    if (toStation && toStation.stationConfigId !== fromStation.stationConfigId) {
      handleMove(activeIdStr, fromStation.stationConfigId, toStation.stationConfigId)
      return
    }

    // Same station sort
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
      // Cross-station: move between stations
      handleMove(activeIdStr, fromStation.stationConfigId, toItemStation.stationConfigId)
    }
  }

  const activeItem = activeId
    ? stations.flatMap(s => s.items).find(i => i.id === activeId)
    : null

  // ── Create schedule ────────────────────────────────────────────────────────

  function handleCreate() {
    if (!session) return
    const name = scheduleName.trim() || defaultName

    // Validate
    const hasParticipants = stations.some(st =>
      st.stationType === 'time-based' ? st.items.length > 0 : st.headcountNames.length > 0
    )
    if (!hasParticipants) {
      setError('יש להוסיף לפחות משתתף אחד')
      return
    }

    const scheduleId = crypto.randomUUID()

    const scheduleStations: ScheduleStation[] = stations.map(st => {
      if (st.stationType === 'headcount') {
        return {
          stationConfigId: st.stationConfigId,
          stationName: st.stationName,
          stationType: 'headcount',
          participants: [],
          headcountParticipants: st.headcountNames,
        }
      }
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

    addSchedule(schedule)

    // Record statistics for time-based stations only
    for (const st of scheduleStations) {
      if (st.stationType !== 'time-based') continue
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

    updateSession({ scheduleName: name })
    resetSession()
    navigate(`/schedule/${scheduleId}/result`)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <StepIndicator current={4} total={4} />
      <h1 className="mb-6 text-xl font-bold text-gray-100">סקירה ועריכה</h1>

      {/* Schedule name */}
      <div className="mb-4">
        <label className="mb-1 block text-sm text-gray-400">שם לוח השמירה</label>
        <input
          value={scheduleName}
          onChange={e => setScheduleName(e.target.value)}
          placeholder={defaultName}
          className="w-full rounded-xl bg-gray-800 px-4 py-2.5 text-gray-100 outline-none ring-1 ring-gray-600 focus:ring-blue-500"
        />
      </div>

      {/* Stations */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="mb-6 flex flex-col gap-4">
          {stations.map(st => (
            <ReviewStationCard
              key={st.stationConfigId}
              station={st}
              allStations={stations}
              activeId={activeId}
              onRename={handleRename}
              onDurationChange={handleDurationChange}
              onRemove={handleRemove}
              onMove={handleMove}
              onAdd={handleAdd}
            />
          ))}
        </div>

        <DragOverlay>
          {activeItem && (
            <div className="flex items-center gap-2 rounded-xl bg-gray-600 px-3 py-2 shadow-xl">
              <span className="w-24 text-xs text-gray-400">{activeItem.startTime}–{activeItem.endTime}</span>
              <span className="text-sm text-gray-100">{activeItem.name}</span>
              <span className="text-xs text-gray-400">{activeItem.durationMinutes}′</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Quote */}
      <div className="mb-4">
        <label className="mb-1 block text-sm text-gray-400">ציטוט (אופציונלי)</label>
        <textarea
          value={quote}
          onChange={e => setQuote(e.target.value)}
          placeholder="הוסף ציטוט..."
          rows={2}
          className="w-full resize-none rounded-xl bg-gray-800 px-4 py-2.5 text-sm text-gray-100 outline-none ring-1 ring-gray-600 focus:ring-blue-500"
        />
      </div>
      {quote.trim() && (
        <div className="mb-6">
          <label className="mb-1 block text-sm text-gray-400">מחבר הציטוט</label>
          <input
            value={quoteAuthor}
            onChange={e => setQuoteAuthor(e.target.value)}
            placeholder="שם המחבר..."
            className="w-full rounded-xl bg-gray-800 px-4 py-2.5 text-sm text-gray-100 outline-none ring-1 ring-gray-600 focus:ring-blue-500"
          />
        </div>
      )}

      {error && <p className="mb-4 rounded-xl bg-red-900/40 px-4 py-2.5 text-sm text-red-300">{error}</p>}

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/schedule/new/step3')}
          className="flex-1 rounded-2xl border border-gray-600 py-3 text-sm font-medium text-gray-300 active:bg-gray-800"
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

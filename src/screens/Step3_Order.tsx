import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
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
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getGroupById } from '../storage/groups'
import { getScheduleById } from '../storage/schedules'
import { useWizard } from '../context/WizardContext'
import { shuffleArray, distributeParticipants } from '../logic'
import { buildContinueRoundQueue, buildContinueRoundStations } from '../logic/continueRound'
import { calcStationDurations } from '../logic/scheduling'
import type { Member, Schedule, WizardSession, WizardStation } from '../types'
import StepIndicator from '../components/StepIndicator'
import DragHandle from '../components/DragHandle'
import AvailabilityToggle from '../components/AvailabilityToggle'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParticipantItem {
  id: string
  name: string
  locked: boolean
  availability: 'base' | 'home'
}

interface StationState {
  stationConfigId: string
  stationName: string
  participants: ParticipantItem[]
}

interface OrderState {
  stations: StationState[]
  unassigned: ParticipantItem[]
}

// ─── Init helper ──────────────────────────────────────────────────────────────

function initOrderState(session: WizardSession, allMembers: Member[], previousSchedule?: Schedule): OrderState {
  const baseMembers = allMembers.filter(m => m.availability === 'base').map(m => m.name)

  let stations: StationState[]
  let assignedNames: Set<string>

  if (session.stations.some(ws => ws.participants.length > 0)) {
    // Restoring from session (Back navigation)
    assignedNames = new Set(session.stations.flatMap(ws => ws.participants.map(p => p.name)))
    stations = session.stations.map(ws => ({
      stationConfigId: ws.config.id,
      stationName: ws.config.name,
      participants: ws.participants.map(p => ({ ...p, id: crypto.randomUUID(), availability: 'base' as const })),
    }))
  } else if (session.mode === 'continue' && previousSchedule) {
    // Continue round: smart ordering algorithm
    const queue = buildContinueRoundQueue(previousSchedule, allMembers)
    const wizardStations = buildContinueRoundStations(queue, session.stations, previousSchedule)
    assignedNames = new Set(wizardStations.flatMap(ws => ws.participants.map(p => p.name)))
    stations = wizardStations.map(ws => ({
      stationConfigId: ws.config.id,
      stationName: ws.config.name,
      participants: ws.participants.map(p => ({ ...p, id: crypto.randomUUID(), availability: 'base' as const })),
    }))
  } else {
    // First visit: distribute base members across stations
    const shuffled = shuffleArray(baseMembers)
    const counts = distributeParticipants(baseMembers.length, session.stations.length)
    assignedNames = new Set<string>()

    stations = session.stations.map((ws, si) => {
      const offset = counts.slice(0, si).reduce((a, b) => a + b, 0)
      const mine = shuffled.slice(offset, offset + counts[si])
      mine.forEach(n => assignedNames.add(n))
      return {
        stationConfigId: ws.config.id,
        stationName: ws.config.name,
        participants: mine.map(name => ({ id: crypto.randomUUID(), name, locked: false, availability: 'base' as const })),
      }
    })
  }

  const unassigned: ParticipantItem[] = allMembers
    .filter(m => !assignedNames.has(m.name))
    .map(m => ({ id: crypto.randomUUID(), name: m.name, locked: false, availability: m.availability }))

  return { stations, unassigned }
}

// ─── Sortable row (in station) ────────────────────────────────────────────────

function SortableRow({
  item,
  onToggleLock,
  onToggleAvailability,
  onRemove,
}: {
  item: ParticipantItem
  onToggleLock: () => void
  onToggleAvailability: (status: 'base' | 'home') => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined, boxShadow: isDragging ? '0 4px 16px rgba(0,0,0,0.18)' : undefined }}
      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${isDragging ? 'bg-blue-50 ring-2 ring-blue-400 dark:bg-blue-900/30 dark:ring-blue-500' : 'bg-gray-100 dark:bg-gray-700'}`}
    >
      <DragHandle attributes={attributes} listeners={listeners} />

      <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-gray-100">
        {item.name}
      </span>

      <button
        onClick={onToggleLock}
        className={`shrink-0 rounded-lg px-2 py-0.5 text-xs ${item.locked ? 'bg-yellow-700/80 text-yellow-100' : 'text-gray-400 active:text-yellow-600 dark:text-gray-500 dark:active:text-yellow-300'}`}
      >
        {item.locked ? '🔒' : '🔓'}
      </button>

      <AvailabilityToggle status={item.availability} onChange={onToggleAvailability} />

      <button onClick={onRemove} className="shrink-0 text-gray-400 active:text-red-500 dark:text-gray-600 dark:active:text-red-400" aria-label="הסר">
        ✕
      </button>
    </div>
  )
}

// ─── Unassigned row ───────────────────────────────────────────────────────────

function UnassignedRow({
  item,
  onToggleAvailability,
}: {
  item: ParticipantItem
  onToggleAvailability: (status: 'base' | 'home') => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const isHome = item.availability === 'home'

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined, boxShadow: isDragging ? '0 4px 16px rgba(0,0,0,0.18)' : undefined }}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 ${isDragging ? 'bg-blue-50 ring-2 ring-blue-400 dark:bg-blue-900/30 dark:ring-blue-500' : isHome ? 'bg-gray-50 dark:bg-gray-800/60' : 'bg-gray-100 dark:bg-gray-700'}`}
    >
      <DragHandle attributes={attributes} listeners={listeners} label="גרור לא משובץ" />

      <span className={`min-w-0 flex-1 truncate text-sm ${isHome ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
        {item.name}
      </span>

      <AvailabilityToggle status={item.availability} onChange={onToggleAvailability} />
    </div>
  )
}

// ─── Droppable zone ───────────────────────────────────────────────────────────

function DroppableZone({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={`min-h-8 rounded-xl transition-colors overflow-visible ${isOver ? 'ring-1 ring-blue-500/40' : ''}`}>
      {children}
    </div>
  )
}

// ─── Collision detection ──────────────────────────────────────────────────────
// Use pointer position first (better cross-container detection on mobile touch),
// fallback to closest center for same-container sort previews.

const dragCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args)
  if (pointerHits.length > 0) return pointerHits
  return closestCenter(args)
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function Step3_Order() {
  const navigate = useNavigate()
  const { session, updateStations } = useWizard()

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { if (!session) navigate('/fallback') }, [session, navigate])
  if (!session) return null

  const group = getGroupById(session.groupId)
  const allMembers = group?.members ?? []

  const previousSchedule = session.mode === 'continue' && session.parentScheduleId
    ? getScheduleById(session.parentScheduleId)
    : undefined

  // ── State ─────────────────────────────────────────────────────────────────

  const [orderState, setOrderState] = useState<OrderState>(() =>
    initOrderState(session, allMembers, previousSchedule)
  )
  // Snapshot saved on drag start — restored on cancel or release-over-nothing
  const [snapshot, setSnapshot] = useState<OrderState | null>(null)

  // ── Sensors (300ms hold to activate drag) ────────────────────────────────

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
    useSensor(PointerSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ── DnD helpers ───────────────────────────────────────────────────────────

  // Locate which container an item ID belongs to in prev state.
  // Returns { inUnassigned: true } or { stationIdx: number } or null if not found.
  function findContainer(prev: OrderState, itemId: string): { inUnassigned: true } | { stationIdx: number } | null {
    if (prev.unassigned.some(p => p.id === itemId)) return { inUnassigned: true }
    const idx = prev.stations.findIndex(s => s.participants.some(p => p.id === itemId))
    if (idx !== -1) return { stationIdx: idx }
    return null
  }

  // Resolve which container a drop target (over.id) belongs to.
  // over.id can be a participant id, a droppable zone id (droppable-<configId>), or
  // 'droppable-unassigned'.
  function findTargetContainer(prev: OrderState, overId: string): { inUnassigned: true } | { stationIdx: number } | null {
    if (overId === 'droppable-unassigned' || prev.unassigned.some(p => p.id === overId)) return { inUnassigned: true }
    const byItem = prev.stations.findIndex(s => s.participants.some(p => p.id === overId))
    if (byItem !== -1) return { stationIdx: byItem }
    const byZone = prev.stations.findIndex(s => `droppable-${s.stationConfigId}` === overId)
    if (byZone !== -1) return { stationIdx: byZone }
    return null
  }

  function onDragStart() {
    // Snapshot full state so we can restore it on cancel / drop-over-nothing
    setSnapshot(orderState)
  }

  // onDragOver: fires continuously as the pointer moves.
  // When crossing into a different container, immediately move the item there
  // at the hovered position so target-container items shift apart to preview insertion.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || active.id === over.id) return

    const aId = String(active.id)
    const oId = String(over.id)

    setOrderState(prev => {
      const src = findContainer(prev, aId)
      const dst = findTargetContainer(prev, oId)
      if (!src || !dst) return prev

      // Same container — SortableContext CSS transforms handle the preview; finalize in onDragEnd
      const srcInUnassigned = 'inUnassigned' in src
      const dstInUnassigned = 'inUnassigned' in dst
      if (srcInUnassigned === dstInUnassigned &&
          (srcInUnassigned || (src as { stationIdx: number }).stationIdx === (dst as { stationIdx: number }).stationIdx)) {
        return prev
      }

      // Get the active item object
      const activeItem = srcInUnassigned
        ? prev.unassigned.find(p => p.id === aId)
        : prev.stations['stationIdx' in src ? src.stationIdx : 0].participants.find(p => p.id === aId)
      if (!activeItem) return prev

      // Remove from source container
      let newUnassigned = srcInUnassigned
        ? prev.unassigned.filter(p => p.id !== aId)
        : prev.unassigned
      let newStations = srcInUnassigned
        ? prev.stations
        : prev.stations.map((s, i) =>
            i === (src as { stationIdx: number }).stationIdx
              ? { ...s, participants: s.participants.filter(p => p.id !== aId) }
              : s
          )

      // Insert into target container at the hovered position
      if (dstInUnassigned) {
        const dstPos = newUnassigned.findIndex(p => p.id === oId)
        const originalMember = allMembers.find(m => m.name === activeItem.name)
        const movedItem: ParticipantItem = { ...activeItem, availability: originalMember?.availability ?? 'base' }
        newUnassigned = [...newUnassigned]
        if (dstPos >= 0) newUnassigned.splice(dstPos, 0, movedItem)
        else newUnassigned.push(movedItem)
      } else {
        const toIdx = (dst as { stationIdx: number }).stationIdx
        const targetParts = [...newStations[toIdx].participants]
        const dstPos = targetParts.findIndex(p => p.id === oId)
        const movedItem: ParticipantItem = { id: activeItem.id, name: activeItem.name, locked: false, availability: 'base' }
        if (dstPos >= 0) targetParts.splice(dstPos, 0, movedItem)
        else targetParts.push(movedItem)
        newStations = newStations.map((s, i) => i === toIdx ? { ...s, participants: targetParts } : s)
      }

      return { stations: newStations, unassigned: newUnassigned }
    })
  }

  // onDragEnd: finalize same-container sort; restore snapshot on cancel (over = null).
  function onDragEnd({ active, over }: DragEndEvent) {
    setSnapshot(null)

    if (!over) {
      // Released over nothing — restore to pre-drag state
      if (snapshot) setSnapshot(null), setOrderState(snapshot)
      return
    }
    if (active.id === over.id) return

    const aId = String(active.id)
    const oId = String(over.id)

    setOrderState(prev => {
      const src = findContainer(prev, aId)
      const dst = findTargetContainer(prev, oId)
      if (!src || !dst) return prev

      const srcInUnassigned = 'inUnassigned' in src
      const dstInUnassigned = 'inUnassigned' in dst
      const sameContainer = srcInUnassigned === dstInUnassigned &&
        (srcInUnassigned || (src as { stationIdx: number }).stationIdx === (dst as { stationIdx: number }).stationIdx)

      if (!sameContainer) return prev // cross-container already handled by onDragOver

      // Same container: do arrayMove to finalize the sort
      if (srcInUnassigned) {
        const fromPos = prev.unassigned.findIndex(p => p.id === aId)
        const toPos = prev.unassigned.findIndex(p => p.id === oId)
        if (fromPos < 0 || toPos < 0 || fromPos === toPos) return prev
        return { ...prev, unassigned: arrayMove(prev.unassigned, fromPos, toPos) }
      } else {
        const stIdx = (src as { stationIdx: number }).stationIdx
        const fromPos = prev.stations[stIdx].participants.findIndex(p => p.id === aId)
        const toPos = prev.stations[stIdx].participants.findIndex(p => p.id === oId)
        if (fromPos < 0 || toPos < 0 || fromPos === toPos) return prev
        return {
          ...prev,
          stations: prev.stations.map((s, i) =>
            i === stIdx ? { ...s, participants: arrayMove(s.participants, fromPos, toPos) } : s
          ),
        }
      }
    })
  }

  // onDragCancel: fired on keyboard Escape — restore snapshot
  function onDragCancel() {
    if (snapshot) setOrderState(snapshot)
    setSnapshot(null)
  }

  // ── Shuffle ───────────────────────────────────────────────────────────────

  function shuffleStation(si: number) {
    setOrderState(prev => {
      const s = prev.stations[si]
      const unlockedIdx = s.participants.map((p, i) => (p.locked ? -1 : i)).filter(i => i >= 0)
      const shuffled = shuffleArray(s.participants.filter(p => !p.locked))
      const next = [...s.participants]
      unlockedIdx.forEach((idx, k) => { next[idx] = shuffled[k] })
      return { ...prev, stations: prev.stations.map((st, i) => (i === si ? { ...st, participants: next } : st)) }
    })
  }

  function reLottery() {
    setOrderState(prev => {
      const allUnlocked: ParticipantItem[] = []
      const lockedByStation = new Map<number, { idx: number; item: ParticipantItem }[]>()

      prev.stations.forEach((s, si) => {
        const locked: { idx: number; item: ParticipantItem }[] = []
        s.participants.forEach((p, pi) => {
          if (p.locked) locked.push({ idx: pi, item: p })
          else allUnlocked.push(p)
        })
        lockedByStation.set(si, locked)
      })

      const pool = shuffleArray(allUnlocked)
      let poolIdx = 0

      const newStations = prev.stations.map((s, si) => {
        const locked = lockedByStation.get(si) ?? []
        const result: ParticipantItem[] = Array(s.participants.length).fill(null)
        locked.forEach(({ idx, item }) => { result[idx] = item })
        for (let i = 0; i < result.length; i++) {
          if (!result[i]) result[i] = pool[poolIdx++]
        }
        return { ...s, participants: result.filter(Boolean) }
      })

      return { ...prev, stations: newStations }
    })
  }

  // ── Participant mutations ─────────────────────────────────────────────────

  function patchParticipant(si: number, id: string, patch: Partial<ParticipantItem>) {
    setOrderState(prev => ({
      ...prev,
      stations: prev.stations.map((s, i) =>
        i === si ? { ...s, participants: s.participants.map(p => (p.id === id ? { ...p, ...patch } : p)) } : s
      ),
    }))
  }

  function removeFromStation(si: number, id: string) {
    setOrderState(prev => {
      const station = prev.stations[si]
      const removed = station.participants.find(p => p.id === id)
      if (!removed) return prev
      const originalMember = allMembers.find(m => m.name === removed.name)
      const availability = originalMember?.availability ?? 'base'
      return {
        stations: prev.stations.map((s, i) =>
          i === si ? { ...s, participants: s.participants.filter(p => p.id !== id) } : s
        ),
        unassigned: [...prev.unassigned, { ...removed, availability }],
      }
    })
  }

  // Toggle availability for a participant currently in a station.
  // Base → Home: move to unassigned as 'home'.
  function toggleAvailabilityInStation(si: number, id: string) {
    setOrderState(prev => {
      const station = prev.stations[si]
      const item = station.participants.find(p => p.id === id)
      if (!item) return prev
      return {
        stations: prev.stations.map((s, i) =>
          i === si ? { ...s, participants: s.participants.filter(p => p.id !== id) } : s
        ),
        unassigned: [...prev.unassigned, { ...item, availability: 'home' }],
      }
    })
  }

  // Toggle availability for a participant in the unassigned section (session-only).
  function toggleAvailabilityInUnassigned(id: string, newStatus: 'base' | 'home') {
    setOrderState(prev => ({
      ...prev,
      unassigned: prev.unassigned.map(p => p.id === id ? { ...p, availability: newStatus } : p),
    }))
  }

  // ── Next ──────────────────────────────────────────────────────────────────

  function handleNext() {
    if (!session) return
    const updated: WizardStation[] = session.stations.map((ws, si) => {
      const s = orderState.stations[si]
      return {
        ...ws,
        participants: s.participants.map(({ name, locked }) => ({ name, locked })),
      }
    })
    updateStations(updated)
    navigate('/schedule/new/step4')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const { stations, unassigned } = orderState

  const stationDurations = calcStationDurations({
    startTime: session.timeConfig.startTime,
    endTime: session.timeConfig.endTime,
    fixedDurationMinutes: session.timeConfig.fixedDurationMinutes,
    roundingAlgorithm: session.timeConfig.roundingAlgorithm,
    unevenMode: session.timeConfig.unevenMode,
    stationParticipantCounts: stations.map(s => s.participants.length),
  })

  return (
    <div className="animate-fadein mx-auto max-w-lg touch-pan-y px-4 py-6">
      <StepIndicator current={3} total={4} />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">סדר שומרים</h1>
        <button
          onClick={reLottery}
          className="rounded-xl bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-800 active:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:active:bg-gray-600"
        >
          הגרלה מחדש
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={dragCollisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="flex flex-col gap-4">
          {stations.map((station, si) => (
            <div key={station.stationConfigId} className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800 overflow-visible">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{station.stationName}</p>
                <button
                  onClick={() => shuffleStation(si)}
                  className="rounded-lg bg-gray-200 px-2.5 py-1 text-xs text-gray-700 active:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:active:bg-gray-600"
                >
                  ערבב
                </button>
              </div>
              {stationDurations[si]?.roundedDurationMinutes > 0 && (
                <p className="mb-2 w-full text-right text-xs text-gray-500 dark:text-gray-400">
                  זמן שמירה לכל לוחם: {stationDurations[si].roundedDurationMinutes} דקות
                </p>
              )}

              <SortableContext items={station.participants.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <DroppableZone id={`droppable-${station.stationConfigId}`}>
                  <div className="flex flex-col gap-1.5">
                    {station.participants.length === 0 && (
                      <p className="py-3 text-center text-xs text-gray-400 dark:text-gray-600">גרור שומר לכאן</p>
                    )}
                    {station.participants.map(item => (
                      <SortableRow
                        key={item.id}
                        item={item}
                        onToggleLock={() => patchParticipant(si, item.id, { locked: !item.locked })}
                        onToggleAvailability={(newStatus) => {
                          if (newStatus === 'home') toggleAvailabilityInStation(si, item.id)
                          // Base is the default for station items; no-op if toggling to 'base'
                        }}
                        onRemove={() => removeFromStation(si, item.id)}
                      />
                    ))}
                  </div>
                </DroppableZone>
              </SortableContext>
            </div>
          ))}

          {/* Unassigned section — always rendered as a valid drop target */}
          <div className="rounded-2xl border-2 border-dashed border-gray-300 p-4 dark:border-gray-600 overflow-visible">
            <p className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">לא משובצים</p>
            <SortableContext items={unassigned.map(p => p.id)} strategy={verticalListSortingStrategy}>
              <DroppableZone id="droppable-unassigned">
                <div className="flex flex-col gap-1.5">
                  {unassigned.length === 0 && (
                    <p className="py-3 text-center text-xs text-gray-400 dark:text-gray-600">גרור לוחם לכאן להוצאה מהרשימה</p>
                  )}
                  {unassigned.map(item => (
                    <UnassignedRow
                      key={item.id}
                      item={item}
                      onToggleAvailability={(newStatus) => toggleAvailabilityInUnassigned(item.id, newStatus)}
                    />
                  ))}
                </div>
              </DroppableZone>
            </SortableContext>
          </div>
        </div>

      </DndContext>

      <div className="mt-6 flex gap-3">
        <button
          onClick={() => navigate('/schedule/new/step2')}
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

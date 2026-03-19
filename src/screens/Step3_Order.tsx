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
  type DragEndEvent,
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
import { useWizard } from '../context/WizardContext'
import { shuffleArray, distributeParticipants } from '../logic'
import type { Member, WizardSession, WizardStation } from '../types'
import StepIndicator from '../components/StepIndicator'
import DragHandle from '../components/DragHandle'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParticipantItem {
  id: string
  name: string
  locked: boolean
  skipped: boolean
  availability?: 'base' | 'home'
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

function initOrderState(session: WizardSession, allMembers: Member[]): OrderState {
  const baseMembers = allMembers.filter(m => m.availability === 'base').map(m => m.name)

  let stations: StationState[]
  let assignedNames: Set<string>

  if (session.stations.some(ws => ws.participants.length > 0)) {
    // Restoring from session (Back navigation)
    assignedNames = new Set(session.stations.flatMap(ws => ws.participants.map(p => p.name)))
    stations = session.stations.map(ws => ({
      stationConfigId: ws.config.id,
      stationName: ws.config.name,
      participants: ws.participants.map(p => ({ ...p, id: crypto.randomUUID() })),
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
        participants: mine.map(name => ({ id: crypto.randomUUID(), name, locked: false, skipped: false })),
      }
    })
  }

  const unassigned: ParticipantItem[] = allMembers
    .filter(m => !assignedNames.has(m.name))
    .map(m => ({ id: crypto.randomUUID(), name: m.name, locked: false, skipped: false, availability: m.availability }))

  return { stations, unassigned }
}

// ─── Sortable row (in station) ────────────────────────────────────────────────

function SortableRow({
  item,
  onToggleLock,
  onToggleSkip,
  onRemove,
}: {
  item: ParticipantItem
  onToggleLock: () => void
  onToggleSkip: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${item.skipped ? 'bg-gray-100/50 dark:bg-gray-700/50' : 'bg-gray-100 dark:bg-gray-700'}`}
    >
      <DragHandle attributes={attributes} listeners={listeners} />

      <span className={`min-w-0 flex-1 truncate text-sm ${item.skipped ? 'text-gray-400 line-through dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
        {item.name}
      </span>

      <button
        onClick={onToggleLock}
        className={`shrink-0 rounded-lg px-2 py-0.5 text-xs ${item.locked ? 'bg-yellow-700/80 text-yellow-100' : 'text-gray-400 active:text-yellow-600 dark:text-gray-500 dark:active:text-yellow-300'}`}
      >
        {item.locked ? '🔒' : '🔓'}
      </button>

      <button
        onClick={onToggleSkip}
        className={`shrink-0 rounded-lg px-2 py-0.5 text-xs ${item.skipped ? 'bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-300' : 'text-gray-400 active:text-gray-600 dark:text-gray-500 dark:active:text-gray-300'}`}
      >
        {item.skipped ? 'מדולג' : 'דלג'}
      </button>

      <button onClick={onRemove} className="shrink-0 text-gray-400 active:text-red-500 dark:text-gray-600 dark:active:text-red-400" aria-label="הסר">
        ✕
      </button>
    </div>
  )
}

// ─── Unassigned row ───────────────────────────────────────────────────────────

function UnassignedRow({ item }: { item: ParticipantItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const isHome = item.availability === 'home'

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 ${isHome ? 'bg-gray-50 dark:bg-gray-800/60' : 'bg-gray-100 dark:bg-gray-700'}`}
    >
      <DragHandle attributes={attributes} listeners={listeners} label="גרור לא משובץ" />

      <span className={`min-w-0 flex-1 truncate text-sm ${isHome ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
        {item.name}
      </span>

      {isHome && (
        <span className="shrink-0 rounded-lg bg-gray-200 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          בית
        </span>
      )}
    </div>
  )
}

// ─── Droppable zone ───────────────────────────────────────────────────────────

function DroppableZone({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={`min-h-8 rounded-xl transition-colors ${isOver ? 'ring-1 ring-blue-500/40' : ''}`}>
      {children}
    </div>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function Step3_Order() {
  const navigate = useNavigate()
  const { session, updateStations } = useWizard()

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  if (!session) { navigate('/schedule/new/step1'); return null }

  const group = getGroupById(session.groupId)
  const allMembers = group?.members ?? []

  // ── State ─────────────────────────────────────────────────────────────────

  const [orderState, setOrderState] = useState<OrderState>(() =>
    initOrderState(session, allMembers)
  )

  // ── Sensors (1000ms hold to activate drag) ────────────────────────────────

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 1000, tolerance: 5 } }),
    useSensor(PointerSensor, { activationConstraint: { delay: 1000, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ── DnD helpers ───────────────────────────────────────────────────────────

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return

    const aId = String(active.id)
    const oId = String(over.id)
    const { stations, unassigned } = orderState

    const isFromUnassigned = unassigned.some(p => p.id === aId)
    const isOverUnassigned = oId === 'droppable-unassigned' || unassigned.some(p => p.id === oId)
    const srcStationIdx = isFromUnassigned ? -1 : stations.findIndex(s => s.participants.some(p => p.id === aId))

    // ── Reorder within unassigned ──────────────────────────────────────────
    if (isFromUnassigned && isOverUnassigned) {
      const srcPos = unassigned.findIndex(p => p.id === aId)
      const dstPos = unassigned.findIndex(p => p.id === oId)
      if (srcPos !== -1 && dstPos !== -1) {
        setOrderState(prev => ({ ...prev, unassigned: arrayMove(prev.unassigned, srcPos, dstPos) }))
      }
      return
    }

    // ── Unassigned → Station ───────────────────────────────────────────────
    if (isFromUnassigned && !isOverUnassigned) {
      const srcItem = unassigned.find(p => p.id === aId)
      if (!srcItem) return

      let dstStationIdx = stations.findIndex(s => `droppable-${s.stationConfigId}` === oId)
      if (dstStationIdx === -1) dstStationIdx = stations.findIndex(s => s.participants.some(p => p.id === oId))
      if (dstStationIdx === -1) return

      const dstParticipantIdx = stations[dstStationIdx].participants.findIndex(p => p.id === oId)
      const movedItem: ParticipantItem = { id: srcItem.id, name: srcItem.name, locked: false, skipped: false }

      setOrderState(prev => ({
        unassigned: prev.unassigned.filter(p => p.id !== aId),
        stations: prev.stations.map((s, si) => {
          if (si !== dstStationIdx) return s
          const parts = [...s.participants]
          if (dstParticipantIdx === -1) parts.push(movedItem)
          else parts.splice(dstParticipantIdx, 0, movedItem)
          return { ...s, participants: parts }
        }),
      }))
      return
    }

    // ── Station → Unassigned ───────────────────────────────────────────────
    if (!isFromUnassigned && isOverUnassigned) {
      if (srcStationIdx === -1) return
      const srcItem = stations[srcStationIdx].participants.find(p => p.id === aId)
      if (!srcItem) return

      const originalMember = allMembers.find(m => m.name === srcItem.name)
      const availability = originalMember?.availability ?? 'base'
      const movedItem: ParticipantItem = { ...srcItem, availability }
      const dstPos = unassigned.findIndex(p => p.id === oId)

      setOrderState(prev => {
        const newUnassigned = [...prev.unassigned]
        if (dstPos === -1) newUnassigned.push(movedItem)
        else newUnassigned.splice(dstPos, 0, movedItem)
        return {
          unassigned: newUnassigned,
          stations: prev.stations.map((s, si) =>
            si === srcStationIdx ? { ...s, participants: s.participants.filter(p => p.id !== aId) } : s
          ),
        }
      })
      return
    }

    // ── Station → Station ──────────────────────────────────────────────────
    if (srcStationIdx === -1) return
    const srcPos = stations[srcStationIdx].participants.findIndex(p => p.id === aId)

    const dstItemStationIdx = stations.findIndex(s => s.participants.some(p => p.id === oId))
    if (dstItemStationIdx !== -1) {
      const dstPos = stations[dstItemStationIdx].participants.findIndex(p => p.id === oId)
      if (srcStationIdx === dstItemStationIdx) {
        setOrderState(prev => ({
          ...prev,
          stations: prev.stations.map((s, i) =>
            i === srcStationIdx ? { ...s, participants: arrayMove(s.participants, srcPos, dstPos) } : s
          ),
        }))
      } else {
        setOrderState(prev => {
          const newStations = prev.stations.map(s => ({ ...s, participants: [...s.participants] }))
          const [moved] = newStations[srcStationIdx].participants.splice(srcPos, 1)
          newStations[dstItemStationIdx].participants.splice(dstPos, 0, moved)
          return { ...prev, stations: newStations }
        })
      }
      return
    }

    const dstZoneIdx = stations.findIndex(s => `droppable-${s.stationConfigId}` === oId)
    if (dstZoneIdx !== -1 && dstZoneIdx !== srcStationIdx) {
      setOrderState(prev => {
        const newStations = prev.stations.map(s => ({ ...s, participants: [...s.participants] }))
        const [moved] = newStations[srcStationIdx].participants.splice(srcPos, 1)
        newStations[dstZoneIdx].participants.push(moved)
        return { ...prev, stations: newStations }
      })
    }
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

  // ── Next ──────────────────────────────────────────────────────────────────

  function handleNext() {
    if (!session) return
    const updated: WizardStation[] = session.stations.map((ws, si) => {
      const s = orderState.stations[si]
      return {
        ...ws,
        participants: s.participants.map(({ name, locked, skipped }) => ({ name, locked, skipped })),
      }
    })
    updateStations(updated)
    navigate('/schedule/new/step4')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const { stations, unassigned } = orderState

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
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
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragEnd={onDragEnd}
      >
        <div className="flex flex-col gap-4">
          {stations.map((station, si) => (
            <div key={station.stationConfigId} className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{station.stationName}</p>
                <button
                  onClick={() => shuffleStation(si)}
                  className="rounded-lg bg-gray-200 px-2.5 py-1 text-xs text-gray-700 active:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:active:bg-gray-600"
                >
                  ערבב
                </button>
              </div>

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
                        onToggleSkip={() => patchParticipant(si, item.id, { skipped: !item.skipped })}
                        onRemove={() => removeFromStation(si, item.id)}
                      />
                    ))}
                  </div>
                </DroppableZone>
              </SortableContext>
            </div>
          ))}

          {/* Unassigned section — shown when some members are not in any station */}
          {unassigned.length > 0 && (
            <div className="rounded-2xl border-2 border-dashed border-gray-300 p-4 dark:border-gray-600">
              <p className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">לא משובצים</p>
              <SortableContext items={unassigned.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <DroppableZone id="droppable-unassigned">
                  <div className="flex flex-col gap-1.5">
                    {unassigned.map(item => (
                      <UnassignedRow key={item.id} item={item} />
                    ))}
                  </div>
                </DroppableZone>
              </SortableContext>
            </div>
          )}
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

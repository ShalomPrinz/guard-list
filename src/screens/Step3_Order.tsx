import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
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
import type { WizardParticipant, WizardStation } from '../types'
import StepIndicator from '../components/StepIndicator'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParticipantItem extends WizardParticipant {
  id: string // local UUID for DnD (not persisted)
}

interface StationState {
  stationConfigId: string
  stationName: string
  participants: ParticipantItem[]
}

// ─── Sortable row ─────────────────────────────────────────────────────────────

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
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none text-lg text-gray-400 dark:text-gray-500 active:cursor-grabbing"
        aria-label="גרור"
      >
        ⠿
      </button>

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
  const baseMembers = group?.members.filter(m => m.availability === 'base').map(m => m.name) ?? []

  // ── Initialize ────────────────────────────────────────────────────────────

  const [stations, setStations] = useState<StationState[]>(() => {
    const shuffled = shuffleArray(baseMembers)
    const counts = distributeParticipants(baseMembers.length, session.stations.length)

    return session.stations.map((ws, si) => {
      // Restore from session if already set (Back navigation)
      if (ws.participants.length > 0) {
        return {
          stationConfigId: ws.config.id,
          stationName: ws.config.name,
          participants: ws.participants.map(p => ({ ...p, id: crypto.randomUUID() })),
        }
      }

      // First visit: slice from shuffled pool
      const offset = counts.slice(0, si).reduce((a, b) => a + b, 0)
      const mine = shuffled.slice(offset, offset + counts[si])

      return {
        stationConfigId: ws.config.id,
        stationName: ws.config.name,
        participants: mine.map(name => ({ id: crypto.randomUUID(), name, locked: false, skipped: false })),
      }
    })
  })

  // ── DnD ───────────────────────────────────────────────────────────────────

  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const findOwnerStation = useCallback(
    (itemId: string) => stations.findIndex(s => s.participants.some(p => p.id === itemId)),
    [stations],
  )

  const activeItem = activeId
    ? stations.flatMap(s => s.participants).find(p => p.id === activeId)
    : null

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id))
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over || active.id === over.id) return

    const aId = String(active.id)
    const oId = String(over.id)
    const srcIdx = findOwnerStation(aId)
    if (srcIdx === -1) return
    const srcPos = stations[srcIdx].participants.findIndex(p => p.id === aId)

    // Over a participant item?
    const dstItemStation = stations.findIndex(s => s.participants.some(p => p.id === oId))
    if (dstItemStation !== -1) {
      const dstPos = stations[dstItemStation].participants.findIndex(p => p.id === oId)
      if (srcIdx === dstItemStation) {
        setStations(prev =>
          prev.map((s, i) =>
            i === srcIdx ? { ...s, participants: arrayMove(s.participants, srcPos, dstPos) } : s,
          ),
        )
      } else {
        setStations(prev => {
          const next = prev.map(s => ({ ...s, participants: [...s.participants] }))
          const [moved] = next[srcIdx].participants.splice(srcPos, 1)
          next[dstItemStation].participants.splice(dstPos, 0, moved)
          return next
        })
      }
      return
    }

    // Over a droppable station zone?
    const dstZone = stations.findIndex(s => `droppable-${s.stationConfigId}` === oId)
    if (dstZone !== -1 && dstZone !== srcIdx) {
      setStations(prev => {
        const next = prev.map(s => ({ ...s, participants: [...s.participants] }))
        const [moved] = next[srcIdx].participants.splice(srcPos, 1)
        next[dstZone].participants.push(moved)
        return next
      })
    }
  }

  // ── Shuffle ───────────────────────────────────────────────────────────────

  function shuffleStation(si: number) {
    setStations(prev => {
      const s = prev[si]
      const unlockedIdx = s.participants.map((p, i) => (p.locked ? -1 : i)).filter(i => i >= 0)
      const shuffled = shuffleArray(s.participants.filter(p => !p.locked))
      const next = [...s.participants]
      unlockedIdx.forEach((idx, k) => { next[idx] = shuffled[k] })
      return prev.map((st, i) => (i === si ? { ...st, participants: next } : st))
    })
  }

  function reLottery() {
    setStations(prev => {
      const allUnlocked: ParticipantItem[] = []
      const lockedByStation = new Map<number, { idx: number; item: ParticipantItem }[]>()

      prev.forEach((s, si) => {
        const locked: { idx: number; item: ParticipantItem }[] = []
        s.participants.forEach((p, pi) => {
          if (p.locked) locked.push({ idx: pi, item: p })
          else allUnlocked.push(p)
        })
        lockedByStation.set(si, locked)
      })

      const pool = shuffleArray(allUnlocked)
      let poolIdx = 0

      return prev.map((s, si) => {
        const locked = lockedByStation.get(si) ?? []
        const result: ParticipantItem[] = Array(s.participants.length).fill(null)
        locked.forEach(({ idx, item }) => { result[idx] = item })
        for (let i = 0; i < result.length; i++) {
          if (!result[i]) result[i] = pool[poolIdx++]
        }
        return { ...s, participants: result.filter(Boolean) }
      })
    })
  }

  // ── Participant mutations ─────────────────────────────────────────────────

  function patchParticipant(si: number, id: string, patch: Partial<ParticipantItem>) {
    setStations(prev =>
      prev.map((s, i) =>
        i === si ? { ...s, participants: s.participants.map(p => (p.id === id ? { ...p, ...patch } : p)) } : s,
      ),
    )
  }

  function removeFromStation(si: number, id: string) {
    setStations(prev =>
      prev.map((s, i) => (i === si ? { ...s, participants: s.participants.filter(p => p.id !== id) } : s)),
    )
  }

  // ── Next ──────────────────────────────────────────────────────────────────

  function handleNext() {
    if (!session) return
    const updated: WizardStation[] = session.stations.map((ws, si) => {
      const s = stations[si]
      return {
        ...ws,
        participants: s.participants.map(({ name, locked, skipped }) => ({ name, locked, skipped })),
      }
    })
    updateStations(updated)
    navigate('/schedule/new/step4')
  }

  // ── Render ────────────────────────────────────────────────────────────────

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

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
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
        </div>

        <DragOverlay>
          {activeItem && (
            <div className="flex items-center gap-2 rounded-xl bg-gray-200 px-3 py-2.5 shadow-xl dark:bg-gray-600">
              <span className="text-gray-500 dark:text-gray-400">⠿</span>
              <span className="text-sm text-gray-900 dark:text-gray-100">{activeItem.name}</span>
            </div>
          )}
        </DragOverlay>
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

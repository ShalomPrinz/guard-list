import type { Statistics, ShiftRecord } from '../types'

const KEY = 'statistics'

const EMPTY: Statistics = { participants: {} }

export function getStatistics(storage: Storage = window.localStorage): Statistics {
  const raw = storage.getItem(KEY)
  if (!raw) return structuredClone(EMPTY)
  try {
    return JSON.parse(raw) as Statistics
  } catch {
    return structuredClone(EMPTY)
  }
}

export function saveStatistics(stats: Statistics, storage: Storage = window.localStorage): void {
  storage.setItem(KEY, JSON.stringify(stats))
}

export function resetStatistics(storage: Storage = window.localStorage): void {
  storage.removeItem(KEY)
}

export function recordShift(
  participantName: string,
  record: ShiftRecord,
  storage: Storage = window.localStorage,
): void {
  const stats = getStatistics(storage)
  if (!stats.participants[participantName]) {
    stats.participants[participantName] = { totalShifts: 0, totalMinutes: 0, history: [] }
  }
  const p = stats.participants[participantName]
  p.totalShifts += 1
  p.totalMinutes += record.durationMinutes
  p.history.push(record)
  saveStatistics(stats, storage)
}

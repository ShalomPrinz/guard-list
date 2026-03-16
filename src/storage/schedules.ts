import type { Schedule } from '../types'

const KEY = 'schedules'

export function getSchedules(storage: Storage = window.localStorage): Schedule[] {
  const raw = storage.getItem(KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as Schedule[]
  } catch {
    return []
  }
}

export function saveSchedules(schedules: Schedule[], storage: Storage = window.localStorage): void {
  storage.setItem(KEY, JSON.stringify(schedules))
}

export function getScheduleById(id: string, storage: Storage = window.localStorage): Schedule | undefined {
  return getSchedules(storage).find(s => s.id === id)
}

export function addSchedule(schedule: Schedule, storage: Storage = window.localStorage): void {
  const schedules = getSchedules(storage)
  schedules.push(schedule)
  saveSchedules(schedules, storage)
}

export function deleteSchedule(id: string, storage: Storage = window.localStorage): void {
  saveSchedules(getSchedules(storage).filter(s => s.id !== id), storage)
}

export function updateScheduleName(id: string, name: string, storage: Storage = window.localStorage): void {
  saveSchedules(getSchedules(storage).map(s => s.id === id ? { ...s, name } : s), storage)
}

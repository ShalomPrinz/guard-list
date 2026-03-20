import type { Schedule } from '../types'
import { kvSet, kvDel } from './cloudStorage'

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
  void kvSet('schedules:' + schedule.groupId + ':' + schedule.id, schedule)
}

export function deleteSchedule(id: string, storage: Storage = window.localStorage): void {
  const schedule = getScheduleById(id, storage)
  saveSchedules(getSchedules(storage).filter(s => s.id !== id), storage)
  if (schedule) void kvDel('schedules:' + schedule.groupId + ':' + id)
}

export function updateScheduleName(id: string, name: string, storage: Storage = window.localStorage): void {
  saveSchedules(getSchedules(storage).map(s => s.id === id ? { ...s, name } : s), storage)
  const updated = getScheduleById(id, storage)
  if (updated) void kvSet('schedules:' + updated.groupId + ':' + id, updated)
}

export function upsertSchedule(schedule: Schedule, storage: Storage = window.localStorage): void {
  const schedules = getSchedules(storage)
  const idx = schedules.findIndex(s => s.id === schedule.id)
  if (idx >= 0) {
    schedules[idx] = schedule
  } else {
    schedules.push(schedule)
  }
  saveSchedules(schedules, storage)
  void kvSet('schedules:' + schedule.groupId + ':' + schedule.id, schedule)
}

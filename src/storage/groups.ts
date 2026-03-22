import type { Group } from '../types'
import { kvSet, kvDel } from './cloudStorage'

const KEY = 'groups'

export function getGroups(storage: Storage = window.localStorage): Group[] {
  const raw = storage.getItem(KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Group[]
    // Migration: apply default role: 'warrior' for any member missing the field
    return parsed.map(g => ({
      ...g,
      members: g.members.map(m => ({ ...m, role: m.role ?? 'warrior' })),
    }))
  } catch {
    return []
  }
}

export function saveGroups(groups: Group[], storage: Storage = window.localStorage): void {
  storage.setItem(KEY, JSON.stringify(groups))
}

export function getGroupById(id: string, storage: Storage = window.localStorage): Group | undefined {
  return getGroups(storage).find(g => g.id === id)
}

export function upsertGroup(group: Group, storage: Storage = window.localStorage): void {
  const groups = getGroups(storage)
  const idx = groups.findIndex(g => g.id === group.id)
  if (idx >= 0) {
    groups[idx] = group
  } else {
    groups.push(group)
  }
  saveGroups(groups, storage)
  void kvSet('groups:' + group.id, group)
}

export function deleteGroup(id: string, storage: Storage = window.localStorage): void {
  saveGroups(getGroups(storage).filter(g => g.id !== id), storage)
  void kvDel('groups:' + id)
}

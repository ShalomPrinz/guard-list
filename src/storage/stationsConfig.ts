import type { StationConfig } from '../types'

const KEY = 'stations_config'

export function getStationsConfig(storage: Storage = window.localStorage): StationConfig[] {
  const raw = storage.getItem(KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as StationConfig[]
  } catch {
    return []
  }
}

export function saveStationsConfig(configs: StationConfig[], storage: Storage = window.localStorage): void {
  storage.setItem(KEY, JSON.stringify(configs))
}

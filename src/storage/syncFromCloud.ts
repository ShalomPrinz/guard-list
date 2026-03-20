import type { Group, StationConfig, Schedule, Citation, ParticipantStats } from '../types'
import { kvGet, kvList } from './cloudStorage'
import { getGroups, upsertGroup } from './groups'
import { getStationsConfig, saveStationsConfig } from './stationsConfig'
import { getSchedules, upsertSchedule } from './schedules'
import { getCitations, upsertCitation } from './citations'
import { getStatistics, saveStatistics } from './statistics'
import { getTheme, saveTheme } from './theme'

/**
 * Backfills all six KV namespaces into localStorage on app startup.
 * Only writes data that does not already exist locally — never overwrites.
 * Safe to call multiple times (idempotent). Catches all errors silently.
 */
export async function syncFromCloud(): Promise<void> {
  // Groups
  try {
    const keys = await kvList('groups:')
    const localIds = new Set(getGroups().map(g => g.id))
    for (const key of keys) {
      const id = key.replace('groups:', '')
      if (!localIds.has(id)) {
        const group = await kvGet<Group>(key)
        if (group) upsertGroup(group)
      }
    }
  } catch { /* silent */ }

  // Station configs
  try {
    const keys = await kvList('stationConfigs:')
    const localConfigs = getStationsConfig()
    const localIds = new Set(localConfigs.map(c => c.id))
    const newConfigs: StationConfig[] = []
    for (const key of keys) {
      const id = key.replace('stationConfigs:', '')
      if (!localIds.has(id)) {
        const config = await kvGet<StationConfig>(key)
        if (config) newConfigs.push(config)
      }
    }
    if (newConfigs.length > 0) {
      saveStationsConfig([...localConfigs, ...newConfigs])
    }
  } catch { /* silent */ }

  // Schedules
  try {
    const keys = await kvList('schedules:')
    const localIds = new Set(getSchedules().map(s => s.id))
    for (const key of keys) {
      // key format: schedules:{groupId}:{scheduleId}
      const parts = key.split(':')
      const id = parts[parts.length - 1]
      if (!localIds.has(id)) {
        const schedule = await kvGet<Schedule>(key)
        if (schedule) upsertSchedule(schedule)
      }
    }
  } catch { /* silent */ }

  // Citations
  try {
    const keys = await kvList('citations:')
    const localIds = new Set(getCitations().map(c => c.id))
    for (const key of keys) {
      const id = key.replace('citations:', '')
      if (!localIds.has(id)) {
        const citation = await kvGet<Citation>(key)
        if (citation) upsertCitation(citation)
      }
    }
  } catch { /* silent */ }

  // Statistics (per-participant)
  try {
    const keys = await kvList('statistics:')
    const stats = getStatistics()
    let changed = false
    for (const key of keys) {
      const name = key.replace('statistics:', '')
      if (!stats.participants[name]) {
        const participantStats = await kvGet<ParticipantStats>(key)
        if (participantStats) {
          stats.participants[name] = participantStats
          changed = true
        }
      }
    }
    if (changed) saveStatistics(stats)
  } catch { /* silent */ }

  // Prefs (theme)
  try {
    if (getTheme() === null) {
      const prefs = await kvGet<{ theme: 'dark' | 'light' }>('prefs:global')
      if (prefs?.theme) saveTheme(prefs.theme)
    }
  } catch { /* silent */ }
}

import type { Group, StationConfig, Schedule, Citation, ParticipantStats } from '../types'
import { kvGet, kvList, kvMGet, kvSet, kvCrossReadGroupMember } from './cloudStorage'
import { getUsername } from './userStorage'
import { getGroups, upsertGroup } from './groups'
import { getStationsConfig, saveStationsConfig } from './stationsConfig'
import { getSchedules, upsertSchedule } from './schedules'
import { getCitations, upsertCitation, deleteCitationSilent } from './citations'
import { getStatistics, saveStatistics } from './statistics'
import { getTheme, saveTheme } from './theme'
import { getLocalGroup } from './citationShare'

/**
 * Backfills all six KV namespaces into localStorage on app startup.
 * Only writes data that does not already exist locally — never overwrites.
 * Safe to call multiple times (idempotent). Catches all errors silently.
 * Returns immediately if no username is set or if already synced.
 */
export async function syncFromCloud(): Promise<void> {
  if (getUsername() === null) return
  if (localStorage.getItem('synced')) return

  // Groups
  try {
    const keys = await kvList('groups:')
    const localIds = new Set(getGroups().map(g => g.id))
    const missingKeys = keys.filter(key => !localIds.has(key.replace('groups:', '')))
    if (missingKeys.length > 0) {
      const values = await kvMGet<Group>(missingKeys)
      for (const group of values) {
        if (group) upsertGroup(group)
      }
    }
  } catch { /* silent */ }

  // Station configs
  try {
    const keys = await kvList('stationConfigs:')
    const localConfigs = getStationsConfig()
    const localIds = new Set(localConfigs.map(c => c.id))
    const missingKeys = keys.filter(key => !localIds.has(key.replace('stationConfigs:', '')))
    if (missingKeys.length > 0) {
      const values = await kvMGet<StationConfig>(missingKeys)
      const newConfigs = values.filter((v): v is StationConfig => v !== null)
      if (newConfigs.length > 0) {
        saveStationsConfig([...localConfigs, ...newConfigs])
      }
    }
  } catch { /* silent */ }

  // Schedules
  try {
    const keys = await kvList('schedules:')
    const localIds = new Set(getSchedules().map(s => s.id))
    const missingKeys = keys.filter(key => {
      const parts = key.split(':')
      const id = parts[parts.length - 1]
      return !localIds.has(id)
    })
    if (missingKeys.length > 0) {
      const values = await kvMGet<Schedule>(missingKeys)
      for (const schedule of values) {
        if (schedule) upsertSchedule(schedule)
      }
    }
  } catch { /* silent */ }

  // Citations
  try {
    const keys = await kvList('citations:')
    const localIds = new Set(getCitations().map(c => c.id))
    const missingKeys = keys.filter(key => !localIds.has(key.replace('citations:', '')))
    if (missingKeys.length > 0) {
      const values = await kvMGet<Citation>(missingKeys)
      for (const citation of values) {
        if (citation) upsertCitation(citation)
      }
    }
  } catch { /* silent */ }

  // Statistics (per-participant)
  try {
    const keys = await kvList('statistics:')
    const stats = getStatistics()
    const missingKeys = keys.filter(key => !stats.participants[key.replace('statistics:', '')])
    if (missingKeys.length > 0) {
      const values = await kvMGet<ParticipantStats>(missingKeys)
      let changed = false
      for (let i = 0; i < missingKeys.length; i++) {
        const participantStats = values[i]
        if (participantStats) {
          const name = missingKeys[i].replace('statistics:', '')
          stats.participants[name] = participantStats
          changed = true
        }
      }
      if (changed) saveStatistics(stats)
    }
  } catch { /* silent */ }

  // Prefs (theme)
  try {
    if (getTheme() === null) {
      const prefs = await kvGet<{ theme: 'dark' | 'light' }>('prefs:global')
      if (prefs?.theme) saveTheme(prefs.theme)
    }
  } catch { /* silent */ }

  // Citation sharing: sync all group member citations
  try {
    const group = getLocalGroup()
    if (group !== null) {
      const currentUser = getUsername()
      const otherMembers = group.members.filter(m => m !== currentUser)
      for (const member of otherMembers) {
        try {
          const result = await kvCrossReadGroupMember(member)
          if (result !== null) {
            const localIds = new Set(getCitations().map(c => c.id))
            for (const citation of result.citations) {
              if (!localIds.has(citation.id)) upsertCitation(citation)
            }
            for (const deletedId of result.deleteLog) {
              if (localIds.has(deletedId)) deleteCitationSilent(deletedId)
            }
          }
          // null means member may have left — skip silently, Sharing Center handles refresh
        } catch { /* silent */ }
      }
    }
  } catch { /* silent */ }

  localStorage.setItem('synced', '1')
}

/**
 * Uploads all existing localStorage data to KV under the current username.
 * Called once at registration when the device already has local data.
 * Requires username to be set in localStorage before calling.
 * Catches all errors silently.
 */
export async function pushLocalToCloud(): Promise<void> {
  if (getUsername() === null) return

  // Groups
  for (const group of getGroups()) {
    await kvSet('groups:' + group.id, group)
  }

  // Station configs
  for (const config of getStationsConfig()) {
    await kvSet('stationConfigs:' + config.id, config)
  }

  // Schedules
  for (const schedule of getSchedules()) {
    await kvSet('schedules:' + schedule.groupId + ':' + schedule.id, schedule)
  }

  // Citations
  for (const citation of getCitations()) {
    await kvSet('citations:' + citation.id, citation)
  }

  // Statistics
  const stats = getStatistics()
  for (const [name, participantStats] of Object.entries(stats.participants)) {
    await kvSet('statistics:' + name, participantStats as ParticipantStats)
  }

  // Prefs
  const theme = getTheme()
  if (theme) {
    await kvSet('prefs:global', { theme })
  }
}

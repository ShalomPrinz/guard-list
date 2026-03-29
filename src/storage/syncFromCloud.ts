import type { Group, StationConfig, Schedule, Citation, ParticipantStats, CitationShareRequest } from '../types'
import { kvGet, kvList, kvSet, kvDel, kvCrossReadPartner } from './cloudStorage'
import { getUsername } from './userStorage'
import { getGroups, upsertGroup } from './groups'
import { getStationsConfig, saveStationsConfig } from './stationsConfig'
import { getSchedules, upsertSchedule } from './schedules'
import { getCitations, upsertCitation, deleteCitationSilent } from './citations'
import { getStatistics, saveStatistics } from './statistics'
import { getTheme, saveTheme } from './theme'
import {
  getOutgoingRequest,
  getShareStatus,
  setShareStatus,
  clearOutgoingRequest,
  getLocalIncomingRequest,
  setLocalIncomingRequest,
  clearShareStatus,
} from './citationShare'

/**
 * Backfills all six KV namespaces into localStorage on app startup.
 * Only writes data that does not already exist locally — never overwrites.
 * Safe to call multiple times (idempotent). Catches all errors silently.
 * Returns immediately if no username is set.
 */
export async function syncFromCloud(): Promise<void> {
  if (getUsername() === null) return
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

  // Citation sharing: check for accept notification (our outgoing request was accepted)
  try {
    const outgoing = getOutgoingRequest()
    const currentStatus = getShareStatus()
    if (outgoing !== null && currentStatus === null) {
      const notification = await kvGet<{ byUsername: string; at: number }>('share:acceptNotification')
      if (notification?.byUsername) {
        setShareStatus({ partnerUsername: notification.byUsername, since: notification.at })
        clearOutgoingRequest()
        void kvDel('share:acceptNotification')
      }
    }
  } catch { /* silent */ }

  // Citation sharing: check for incoming request in KV
  try {
    if (getLocalIncomingRequest() === null && getShareStatus() === null) {
      const req = await kvGet<CitationShareRequest>('share:incomingRequest')
      if (req?.fromUsername) {
        setLocalIncomingRequest(req)
      }
    }
  } catch { /* silent */ }

  // Citation sharing: sync partner citations (bidirectional pull)
  try {
    const status = getShareStatus()
    if (status !== null) {
      const result = await kvCrossReadPartner(status.partnerUsername)
      if (result !== null) {
        const localIds = new Set(getCitations().map(c => c.id))
        for (const citation of result.citations) {
          if (!localIds.has(citation.id)) {
            upsertCitation(citation)
          }
        }
        for (const deletedId of result.deleteLog) {
          if (localIds.has(deletedId)) {
            deleteCitationSilent(deletedId)
          }
        }
      } else {
        // crossRead returned null → partner stopped sharing or unauthorized → stop on our side too
        clearShareStatus()
      }
    }
  } catch { /* silent */ }
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

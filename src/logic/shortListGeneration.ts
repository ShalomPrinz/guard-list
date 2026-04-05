import type { Schedule, StationConfig, Member } from '../types'
import { getGroupById } from '../storage/groups'
import { buildStationSchedule } from './generateSchedule'

/**
 * Generate a short-list schedule by:
 * 1. Loading the group and filtering base-available members
 * 2. Calculating total warriors as numberOfWarriors * numberOfStations
 * 3. Randomly shuffling and selecting total warriors
 * 4. Distributing them evenly across stations with uniform duration (round-robin)
 * 5. Building the schedule with the provided name
 *
 * numberOfWarriors is interpreted as "warriors per station", not total.
 */
export function generateShortListSchedule(
  groupId: string,
  stations: StationConfig[],
  startHour: number,
  minutesPerWarrior: number,
  numberOfWarriors: number,
  nameOrStorage?: string | Storage,
  storage?: Storage,
): Schedule | null {
  // Handle overloads: name can be string or Storage (for backward compatibility)
  let name: string | undefined
  let actualStorage: Storage | undefined

  if (typeof nameOrStorage === 'string') {
    name = nameOrStorage
    actualStorage = storage
  } else if (nameOrStorage && typeof nameOrStorage === 'object') {
    // It's a Storage object passed as the 6th argument (old signature)
    actualStorage = nameOrStorage
  }
  const group = getGroupById(groupId, actualStorage)
  if (!group) return null

  // Filter to only base-available members
  const availableMembers = group.members.filter(m => m.availability === 'base')

  // numberOfWarriors is per-station; calculate total
  const totalWarriors = numberOfWarriors * stations.length

  // Check if enough warriors available
  if (availableMembers.length < totalWarriors) {
    return null
  }

  // Randomly shuffle and select totalWarriors
  const shuffled = shuffleArray(availableMembers)
  const selectedWarriors = shuffled.slice(0, totalWarriors)

  // Distribute warriors across stations (round-robin)
  const stationParticipants: Map<string, Member[]> = new Map()
  stations.forEach(s => stationParticipants.set(s.id, []))

  selectedWarriors.forEach((warrior, idx) => {
    const stationIdx = idx % stations.length
    const stationId = stations[stationIdx].id
    stationParticipants.get(stationId)?.push(warrior)
  })

  // Build schedule for each station
  const today = new Date().toISOString().split('T')[0]
  const startTimeStr = `${String(startHour).padStart(2, '0')}:00`

  const scheduleStations = stations.map(station => {
    const warriors = stationParticipants.get(station.id) ?? []
    const participants = buildStationSchedule(
      warriors.map(w => ({
        name: w.name,
        durationMinutes: minutesPerWarrior,
        locked: false,
      })),
      startTimeStr,
      today,
    )

    return {
      stationConfigId: station.id,
      stationName: station.name,
      stationType: 'time-based' as const,
      participants,
    }
  })

  return {
    id: crypto.randomUUID(),
    name: name || 'רשימת שמירה',
    groupId,
    createdAt: new Date().toISOString(),
    date: today,
    stations: scheduleStations,
    unevenDistributionMode: 'equal-duration',
  }
}

/** Fisher-Yates shuffle — returns a new array. */
function shuffleArray<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

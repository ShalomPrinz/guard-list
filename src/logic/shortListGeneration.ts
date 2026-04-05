import type { Schedule, StationConfig, Member } from '../types'
import { getGroupById } from '../storage/groups'
import { buildStationSchedule } from './generateSchedule'

/**
 * Generate a short-list schedule by:
 * 1. Loading the group and filtering base-available members
 * 2. Randomly shuffling and selecting numberOfWarriors
 * 3. Distributing them evenly across stations with uniform duration
 * 4. Building the schedule
 */
export function generateShortListSchedule(
  groupId: string,
  stations: StationConfig[],
  startHour: number,
  minutesPerWarrior: number,
  numberOfWarriors: number,
  storage?: Storage,
): Schedule | null {
  const group = getGroupById(groupId, storage)
  if (!group) return null

  // Filter to only base-available members
  const availableMembers = group.members.filter(m => m.availability === 'base')

  // Check if enough warriors available
  if (availableMembers.length < numberOfWarriors) {
    return null
  }

  // Randomly shuffle and select numberOfWarriors
  const shuffled = shuffleArray(availableMembers)
  const selectedWarriors = shuffled.slice(0, numberOfWarriors)

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
    name: 'רשימה קצרה',
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

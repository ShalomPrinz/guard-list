import type { Schedule, WizardStation, WizardParticipant } from '../types'
import { shuffleArray } from './generateSchedule'

// ─── Internal helpers ─────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * Convert a YYYY-MM-DD date and HH:MM time to a sortable number.
 * Always use this (not timeToMinutes alone) when participants may span midnight.
 */
export function datetimeToSortKey(date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number)
  return (y * 12 * 31 + (mo - 1) * 31 + (d - 1)) * 1440 + timeToMinutes(time)
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UnifiedSchedule {
  name: string
  quote?: string
  quoteAuthor?: string
  stations: Array<{
    stationName: string
    participants: Array<{ name: string; startTime: string; date: string; durationMinutes: number }>
  }>
}

// ─── Continue round ordering ──────────────────────────────────────────────────

/**
 * Build the ordered queue of warrior names for a continuation round.
 *
 * 1. Warriors absent from the previous round go first (shuffled among themselves).
 * 2. Warriors who appeared in the previous round are sorted by their earliest
 *    start time ascending; ties are broken randomly.
 * 3. Warriors marked 'home' are excluded entirely.
 */
export function buildContinueRoundQueue(
  previousSchedule: Schedule,
  groupMembers: ReadonlyArray<{ name: string; availability: 'base' | 'home' }>,
): string[] {
  const baseMembers = groupMembers.filter(m => m.availability === 'base').map(m => m.name)
  const baseMembersSet = new Set(baseMembers)

  // Collect earliest start datetime per warrior from previous round
  const prevWarriorTimes = new Map<string, number>()
  for (const station of previousSchedule.stations) {
    for (const p of station.participants) {
      const key = datetimeToSortKey(p.date, p.startTime)
      if (!prevWarriorTimes.has(p.name) || key < prevWarriorTimes.get(p.name)!) {
        prevWarriorTimes.set(p.name, key)
      }
    }
  }

  // Warriors absent from previous round (among base members) — prepend, shuffled
  const newWarriors = baseMembers.filter(name => !prevWarriorTimes.has(name))

  // Warriors from previous round who are still base — sorted by start time, ties broken randomly
  const prevEntries: Array<{ name: string; mins: number; rand: number }> = []
  for (const [name, mins] of prevWarriorTimes) {
    if (baseMembersSet.has(name)) {
      prevEntries.push({ name, mins, rand: Math.random() })
    }
  }
  prevEntries.sort((a, b) => a.mins - b.mins || a.rand - b.rand)

  return [...shuffleArray(newWarriors), ...prevEntries.map(e => e.name)]
}

/**
 * Assign warriors from the ordered queue to stations using round-robin,
 * then apply a best-effort station rotation pass to reduce same-station repeats.
 */
export function buildContinueRoundStations(
  queue: string[],
  stations: ReadonlyArray<WizardStation>,
  previousSchedule: Schedule,
): WizardStation[] {
  const stationCount = stations.length
  if (stationCount === 0) return [...stations]

  // Map: warrior name → stationConfigId they were in during the previous round
  const prevStationOf = new Map<string, string>()
  for (const st of previousSchedule.stations) {
    for (const p of st.participants) {
      prevStationOf.set(p.name, st.stationConfigId)
    }
  }

  // Round-robin assignment
  const assigned: string[][] = Array.from({ length: stationCount }, () => [])
  queue.forEach((name, idx) => {
    assigned[idx % stationCount].push(name)
  })

  // Best-effort rotation: swap two warriors between stations if the swap
  // eliminates both of their same-station repeats without creating new ones.
  for (let si = 0; si < stationCount; si++) {
    for (let pi = 0; pi < assigned[si].length; pi++) {
      const name = assigned[si][pi]
      if (prevStationOf.get(name) !== stations[si].config.id) continue

      let swapped = false
      for (let sj = 0; sj < stationCount && !swapped; sj++) {
        if (sj === si) continue
        for (let pj = 0; pj < assigned[sj].length && !swapped; pj++) {
          const partner = assigned[sj][pj]
          const nameWouldRepeat = prevStationOf.get(name) === stations[sj].config.id
          const partnerWouldRepeat = prevStationOf.get(partner) === stations[si].config.id
          if (!nameWouldRepeat && !partnerWouldRepeat) {
            assigned[si][pi] = partner
            assigned[sj][pj] = name
            swapped = true
          }
        }
      }
    }
  }

  return stations.map((ws, si) => ({
    ...ws,
    participants: assigned[si].map((name): WizardParticipant => ({ name })),
  }))
}

// ─── Unite schedules ──────────────────────────────────────────────────────────

/**
 * Merge a parent schedule and its child (continued) schedule into a single
 * unified view.  Uses the parent's name, quote, and quoteAuthor.
 * Per station: combines parent participants + child participants,
 * sorted by start time ascending.  Does NOT persist to localStorage.
 */
export function uniteSchedules(parent: Schedule, child: Schedule): UnifiedSchedule {
  // Preserve station order: parent stations first, then child-only stations
  const stationNames: string[] = []
  const seen = new Set<string>()
  for (const st of parent.stations) {
    if (!seen.has(st.stationName)) { stationNames.push(st.stationName); seen.add(st.stationName) }
  }
  for (const st of child.stations) {
    if (!seen.has(st.stationName)) { stationNames.push(st.stationName); seen.add(st.stationName) }
  }

  const stations = stationNames.map(stationName => {
    const parentParts = (parent.stations.find(s => s.stationName === stationName)?.participants ?? [])
      .map(p => ({ name: p.name, startTime: p.startTime, date: p.date, durationMinutes: p.durationMinutes }))
    const childParts = (child.stations.find(s => s.stationName === stationName)?.participants ?? [])
      .map(p => ({ name: p.name, startTime: p.startTime, date: p.date, durationMinutes: p.durationMinutes }))

    const combined = [...parentParts, ...childParts]
    combined.sort((a, b) => datetimeToSortKey(a.date, a.startTime) - datetimeToSortKey(b.date, b.startTime))
    return { stationName, participants: combined }
  })

  return {
    name: parent.name,
    quote: parent.quote,
    quoteAuthor: parent.quoteAuthor,
    stations,
  }
}

/**
 * Format a unified schedule for WhatsApp sharing (same format as regular schedules).
 */
export function formatUnifiedScheduleForWhatsApp(unified: UnifiedSchedule): string {
  const lines: string[] = [`🔒 ${unified.name}`]
  for (const st of unified.stations) {
    lines.push('')
    lines.push(`📍 ${st.stationName}`)
    for (const p of st.participants) {
      lines.push(`${p.startTime} ${p.name}`)
    }
  }
  if (unified.quote) {
    lines.push('')
    lines.push(`"${unified.quote}"${unified.quoteAuthor ? ` (${unified.quoteAuthor})` : ''}`)
  }
  return lines.join('\n')
}

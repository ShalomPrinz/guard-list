import type { Citation } from '../types'

/**
 * Format an author name to initial + family name.
 * "יוסי ישראלי" → "י. ישראלי"
 * "דוד בן גוריון" → "ד. בן גוריון"
 * Single word → unchanged
 */
export function formatAuthorName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return trimmed
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return trimmed
  const initial = parts[0].charAt(0) + '.'
  const rest = parts.slice(1).join(' ')
  return `${initial} ${rest}`
}

/**
 * Pick a random citation preferring unused ones (usedInListIds.length === 0).
 * Falls back to the citation(s) with fewest usedInListIds if all are used.
 * Returns undefined if the array is empty.
 */
export function pickRandomCitation(citations: Citation[]): Citation | undefined {
  if (citations.length === 0) return undefined
  const unused = citations.filter(c => c.usedInListIds.length === 0)
  if (unused.length > 0) {
    return unused[Math.floor(Math.random() * unused.length)]
  }
  const minUses = Math.min(...citations.map(c => c.usedInListIds.length))
  const leastUsed = citations.filter(c => c.usedInListIds.length === minUses)
  return leastUsed[Math.floor(Math.random() * leastUsed.length)]
}

// ─── Time formatting ──────────────────────────────────────────────────────────

/**
 * Format a time value to "HH:MM" (24-hour, zero-padded).
 * Accepts either a "HH:MM" string (returned as-is) or a Date object.
 */
export function formatTime(time: Date | string): string {
  if (time instanceof Date) {
    const h = String(time.getHours()).padStart(2, '0')
    const m = String(time.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }
  return time
}

// ─── Date formatting ──────────────────────────────────────────────────────────

/**
 * Format a date value to "DD/MM/YYYY".
 * Accepts either a "YYYY-MM-DD" string or a Date object.
 */
export function formatDate(date: Date | string): string {
  if (date instanceof Date) {
    const d = String(date.getDate()).padStart(2, '0')
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const y = date.getFullYear()
    return `${d}/${m}/${y}`
  }
  // "YYYY-MM-DD" → "DD/MM/YYYY"
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

// ─── Midnight crossover ───────────────────────────────────────────────────────

/**
 * Returns true if the given end time is earlier than or equal to start time,
 * indicating the schedule crosses midnight.
 */
export function crossesMidnight(startTime: string, endTime: string): boolean {
  if (!endTime) return false
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  return toMins(endTime) <= toMins(startTime)
}

/**
 * Compute the end date of a schedule given start date and times.
 * Returns start date + 1 day when the time range crosses midnight; otherwise start date.
 */
export function computeEndDate(startDate: string, startTime: string, endTime: string): string {
  if (!startTime || !endTime) return startDate
  if (crossesMidnight(startTime, endTime)) {
    const [y, m, d] = startDate.split('-').map(Number)
    const next = new Date(Date.UTC(y, m - 1, d + 1))
    return next.toISOString().split('T')[0]
  }
  return startDate
}

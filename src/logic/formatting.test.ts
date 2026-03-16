import { describe, it, expect } from 'vitest'
import { formatTime, formatDate, crossesMidnight, computeEndDate } from './formatting'

// ─── formatTime ──────────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('returns an HH:MM string as-is', () => {
    expect(formatTime('20:00')).toBe('20:00')
    expect(formatTime('00:00')).toBe('00:00')
    expect(formatTime('08:05')).toBe('08:05')
    expect(formatTime('23:59')).toBe('23:59')
  })

  it('formats a Date object to HH:MM', () => {
    const d = new Date(2026, 2, 16, 14, 30) // 14:30 local time
    expect(formatTime(d)).toBe('14:30')
  })

  it('zero-pads hours and minutes', () => {
    const d = new Date(2026, 0, 1, 8, 5) // 08:05
    expect(formatTime(d)).toBe('08:05')
  })
})

// ─── formatDate ──────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('converts YYYY-MM-DD to DD/MM/YYYY', () => {
    expect(formatDate('2026-03-16')).toBe('16/03/2026')
    expect(formatDate('2026-01-01')).toBe('01/01/2026')
    expect(formatDate('2026-12-31')).toBe('31/12/2026')
  })

  it('zero-pads day and month from string', () => {
    expect(formatDate('2026-01-05')).toBe('05/01/2026')
  })

  it('formats a Date object to DD/MM/YYYY', () => {
    const d = new Date(2026, 2, 16) // March 16, 2026 (month 0-indexed)
    expect(formatDate(d)).toBe('16/03/2026')
  })

  it('zero-pads day and month from Date', () => {
    const d = new Date(2026, 0, 5) // Jan 5
    expect(formatDate(d)).toBe('05/01/2026')
  })
})

// ─── crossesMidnight ─────────────────────────────────────────────────────────

describe('crossesMidnight', () => {
  it('returns false when end time is after start time (same day)', () => {
    expect(crossesMidnight('20:00', '22:00')).toBe(false)
    expect(crossesMidnight('08:00', '16:00')).toBe(false)
    expect(crossesMidnight('00:00', '23:59')).toBe(false)
  })

  it('returns true when end time is before start time (crosses midnight)', () => {
    expect(crossesMidnight('22:00', '06:00')).toBe(true)
    expect(crossesMidnight('23:30', '00:30')).toBe(true)
    expect(crossesMidnight('20:00', '04:00')).toBe(true)
  })

  it('returns true when end time equals start time (full-day wrap)', () => {
    expect(crossesMidnight('20:00', '20:00')).toBe(true)
  })

  it('returns false when end time is empty string', () => {
    expect(crossesMidnight('20:00', '')).toBe(false)
  })
})

// ─── computeEndDate ──────────────────────────────────────────────────────────

describe('computeEndDate', () => {
  it('returns start date when schedule does not cross midnight', () => {
    expect(computeEndDate('2026-03-16', '20:00', '22:00')).toBe('2026-03-16')
    expect(computeEndDate('2026-03-16', '08:00', '16:00')).toBe('2026-03-16')
  })

  it('returns start date + 1 when schedule crosses midnight', () => {
    expect(computeEndDate('2026-03-16', '22:00', '06:00')).toBe('2026-03-17')
    expect(computeEndDate('2026-03-16', '23:00', '01:00')).toBe('2026-03-17')
  })

  it('handles month boundary crossover', () => {
    expect(computeEndDate('2026-03-31', '23:00', '01:00')).toBe('2026-04-01')
  })

  it('handles year boundary crossover', () => {
    expect(computeEndDate('2026-12-31', '23:00', '01:00')).toBe('2027-01-01')
  })

  it('returns start date when end time is empty', () => {
    expect(computeEndDate('2026-03-16', '20:00', '')).toBe('2026-03-16')
  })

  it('returns start date when start time is empty', () => {
    expect(computeEndDate('2026-03-16', '', '22:00')).toBe('2026-03-16')
  })
})

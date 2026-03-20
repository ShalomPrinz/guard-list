import { describe, it, expect } from 'vitest'
import { formatAuthorName, pickRandomCitation } from './citations'
import type { Citation } from '../types'

describe('formatAuthorName', () => {
  it('formats first name + last name to initial + last name', () => {
    expect(formatAuthorName('יוסי ישראלי')).toBe('י. ישראלי')
  })

  it('formats multi-word name: initial + rest unchanged', () => {
    expect(formatAuthorName('דוד בן גוריון')).toBe('ד. בן גוריון')
  })

  it('leaves single word unchanged', () => {
    expect(formatAuthorName('ישראלי')).toBe('ישראלי')
  })

  it('leaves empty string unchanged', () => {
    expect(formatAuthorName('')).toBe('')
  })

  it('trims leading/trailing whitespace', () => {
    expect(formatAuthorName('  יוסי ישראלי  ')).toBe('י. ישראלי')
  })

  it('collapses internal whitespace', () => {
    expect(formatAuthorName('יוסי   ישראלי')).toBe('י. ישראלי')
  })
})

describe('pickRandomCitation', () => {
  function makeCitation(id: string, usedInListIds: string[] = []): Citation {
    return { id, text: `text-${id}`, author: 'author', usedInListIds }
  }

  it('returns undefined for empty array', () => {
    expect(pickRandomCitation([])).toBeUndefined()
  })

  it('picks an unused citation when available', () => {
    const used = makeCitation('a', ['s1'])
    const unused = makeCitation('b', [])
    const result = pickRandomCitation([used, unused])
    expect(result?.id).toBe('b')
  })

  it('picks from unused pool when multiple unused exist', () => {
    const used = makeCitation('a', ['s1'])
    const unused1 = makeCitation('b', [])
    const unused2 = makeCitation('c', [])
    const result = pickRandomCitation([used, unused1, unused2])
    expect(['b', 'c']).toContain(result?.id)
  })

  it('falls back to least-used citation when all are used', () => {
    const heavy = makeCitation('a', ['s1', 's2', 's3'])
    const light = makeCitation('b', ['s1'])
    const result = pickRandomCitation([heavy, light])
    expect(result?.id).toBe('b')
  })

  it('returns the only citation even when used', () => {
    const c = makeCitation('a', ['s1'])
    expect(pickRandomCitation([c])?.id).toBe('a')
  })
})

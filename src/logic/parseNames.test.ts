import { describe, it, expect } from 'vitest'
import { parseNames } from './parseNames'

describe('parseNames', () => {
  it('splits on newlines', () => {
    expect(parseNames('Alice\nBob\nCharlie')).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  it('splits on commas', () => {
    expect(parseNames('Alice,Bob,Charlie')).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  it('splits on mixed commas and newlines', () => {
    expect(parseNames('Alice, Bob\nCharlie')).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  it('trims whitespace around names', () => {
    expect(parseNames('  Alice  ,  Bob  ')).toEqual(['Alice', 'Bob'])
  })

  it('removes exact duplicates (case-insensitive)', () => {
    expect(parseNames('Alice\nALICE\nalice')).toEqual(['Alice'])
  })

  it('preserves casing of first occurrence', () => {
    expect(parseNames('Alice\nalice\nALICE')).toEqual(['Alice'])
  })

  it('ignores blank lines and empty segments', () => {
    expect(parseNames('Alice\n\nBob\n,Charlie')).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  it('returns empty array for empty input', () => {
    expect(parseNames('')).toEqual([])
  })

  it('returns empty array for whitespace-only input', () => {
    expect(parseNames('   \n  ,  ')).toEqual([])
  })

  it('handles single name', () => {
    expect(parseNames('Alice')).toEqual(['Alice'])
  })
})

import { describe, it, expect } from 'vitest'
import { getTheme, saveTheme } from './theme'
import { createLocalStorageMock } from '../tests/localStorageMock'

describe('getTheme', () => {
  it('returns null when no theme is stored', () => {
    const store = createLocalStorageMock()
    expect(getTheme(store)).toBeNull()
  })

  it('returns "dark" when stored value is "dark"', () => {
    const store = createLocalStorageMock()
    store.setItem('theme', 'dark')
    expect(getTheme(store)).toBe('dark')
  })

  it('returns "light" when stored value is "light"', () => {
    const store = createLocalStorageMock()
    store.setItem('theme', 'light')
    expect(getTheme(store)).toBe('light')
  })

  it('returns null for an unrecognised value', () => {
    const store = createLocalStorageMock()
    store.setItem('theme', 'banana')
    expect(getTheme(store)).toBeNull()
  })
})

describe('saveTheme', () => {
  it('persists "dark" to storage', () => {
    const store = createLocalStorageMock()
    saveTheme('dark', store)
    expect(store.getItem('theme')).toBe('dark')
  })

  it('persists "light" to storage', () => {
    const store = createLocalStorageMock()
    saveTheme('light', store)
    expect(store.getItem('theme')).toBe('light')
  })

  it('overwrites a previous value', () => {
    const store = createLocalStorageMock()
    saveTheme('dark', store)
    saveTheme('light', store)
    expect(store.getItem('theme')).toBe('light')
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'
import { getUsername, setUsername, clearUsername, getOrCreateDeviceId } from './userStorage'

describe('userStorage', () => {
  beforeEach(() => {
    const storage = createLocalStorageMock()
    vi.stubGlobal('localStorage', storage)
  })

  it('getUsername returns null when key is absent', () => {
    expect(getUsername()).toBeNull()
  })

  it('getUsername returns the stored value after setUsername', () => {
    setUsername('Alice')
    expect(getUsername()).toBe('alice')
  })

  it('setUsername trims whitespace', () => {
    setUsername('  bob  ')
    expect(getUsername()).toBe('bob')
  })

  it('setUsername lowercases the value', () => {
    setUsername('CHARLIE')
    expect(getUsername()).toBe('charlie')
  })

  it('setUsername trims and lowercases together', () => {
    setUsername('  DaVid  ')
    expect(getUsername()).toBe('david')
  })

  it('clearUsername removes the stored value', () => {
    setUsername('eve')
    clearUsername()
    expect(getUsername()).toBeNull()
  })
})

describe('getOrCreateDeviceId', () => {
  beforeEach(() => {
    const storage = createLocalStorageMock()
    vi.stubGlobal('localStorage', storage)
  })

  it('returns a non-empty string', () => {
    expect(getOrCreateDeviceId().length).toBeGreaterThan(0)
  })

  it('returns the same ID on subsequent calls', () => {
    const first = getOrCreateDeviceId()
    const second = getOrCreateDeviceId()
    expect(first).toBe(second)
  })

  it('returns different IDs for different localStorage instances', () => {
    const id1 = getOrCreateDeviceId()
    vi.stubGlobal('localStorage', createLocalStorageMock())
    const id2 = getOrCreateDeviceId()
    expect(id1).not.toBe(id2)
  })
})

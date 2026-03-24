import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'
import { getUsername, setUsername, clearUsername, getOrCreateDeviceId, isValidUsername } from './userStorage'

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

describe('isValidUsername', () => {
  it('accepts normal alphanumeric usernames', () => {
    expect(isValidUsername('alice')).toBe(true)
    expect(isValidUsername('bob123')).toBe(true)
    expect(isValidUsername('user-name')).toBe(true)
  })

  it('accepts Hebrew usernames (existing users must not be locked out)', () => {
    expect(isValidUsername('שלום')).toBe(true)
    expect(isValidUsername('יוסי')).toBe(true)
  })

  it('rejects usernames shorter than 2 characters', () => {
    expect(isValidUsername('a')).toBe(false)
    expect(isValidUsername('')).toBe(false)
  })

  it('rejects usernames longer than 64 characters', () => {
    expect(isValidUsername('a'.repeat(65))).toBe(false)
  })

  it('rejects the colon character (KV namespace separator)', () => {
    // SECURITY: colon in username would break namespace enforcement
    expect(isValidUsername('user:name')).toBe(false)
    expect(isValidUsername(':admin')).toBe(false)
  })

  it('rejects Redis glob characters that could escape key patterns', () => {
    // SECURITY: these chars could be used to enumerate or escape namespaces
    expect(isValidUsername('user*')).toBe(false)
    expect(isValidUsername('user?')).toBe(false)
    expect(isValidUsername('user[a]')).toBe(false)
    expect(isValidUsername('user^')).toBe(false)
  })

  it('setUsername throws for usernames containing invalid characters', () => {
    expect(() => setUsername('bad:user')).toThrow()
    expect(() => setUsername('a')).toThrow()
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

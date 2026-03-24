import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'

// Un-mock cloudStorage so we test the real implementation.
vi.unmock('./cloudStorage')

import { kvGet, kvSet, kvDel, kvList, kvGetRaw, kvSetRaw, isKvAvailable } from './cloudStorage'

function mockFetch(responseBody: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(responseBody),
    }),
  )
}

describe('cloudStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    const storage = createLocalStorageMock()
    // Pre-set a username so KV helpers are active by default
    storage.setItem('username', 'testuser')
    vi.stubGlobal('localStorage', storage)
  })

  describe('isKvAvailable', () => {
    it('is true', () => {
      expect(isKvAvailable).toBe(true)
    })
  })

  describe('username prefixing', () => {
    it('kvGet sends key prefixed with username and includes username field', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ value: null }) })
      vi.stubGlobal('fetch', fetchMock)

      await kvGet('groups:g1')

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.key).toBe('testuser:groups:g1')
      // SECURITY: username must be sent separately so server can enforce namespace ownership
      expect(body.username).toBe('testuser')
    })

    it('kvSet sends key prefixed with username', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
      vi.stubGlobal('fetch', fetchMock)

      await kvSet('groups:g1', { id: 'g1' })

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.key).toBe('testuser:groups:g1')
    })

    it('kvDel sends key prefixed with username', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
      vi.stubGlobal('fetch', fetchMock)

      await kvDel('groups:g1')

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.key).toBe('testuser:groups:g1')
    })

    it('kvList sends prefix prefixed with username', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ keys: [] }) })
      vi.stubGlobal('fetch', fetchMock)

      await kvList('groups:')

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.prefix).toBe('testuser:groups:')
    })

    it('kvList strips username prefix from returned keys', async () => {
      mockFetch({ keys: ['testuser:groups:g1', 'testuser:groups:g2'] })
      const result = await kvList('groups:')
      expect(result).toEqual(['groups:g1', 'groups:g2'])
    })
  })

  describe('null username bail-out', () => {
    beforeEach(() => {
      const storage = createLocalStorageMock()
      // No username set
      vi.stubGlobal('localStorage', storage)
    })

    it('kvGet returns null and warns when username is null', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      const result = await kvGet('groups:g1')

      expect(result).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalled()
    })

    it('kvSet does not call fetch when username is null', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      await kvSet('groups:g1', {})

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('kvDel does not call fetch when username is null', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      await kvDel('groups:g1')

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('kvList returns empty array when username is null', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      const result = await kvList('groups:')

      expect(result).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('kvGet', () => {
    it('returns the value from the KV response', async () => {
      mockFetch({ value: { id: 'g1' } })
      const result = await kvGet<{ id: string }>('groups:g1')
      expect(result).toEqual({ id: 'g1' })
    })

    it('returns null when value is null', async () => {
      mockFetch({ value: null })
      const result = await kvGet('groups:missing')
      expect(result).toBeNull()
    })

    it('returns null and logs on HTTP error', async () => {
      mockFetch({}, false)
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const result = await kvGet('groups:g1')
      expect(result).toBeNull()
      expect(spy).toHaveBeenCalled()
    })

    it('returns null and logs on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const result = await kvGet('groups:g1')
      expect(result).toBeNull()
      expect(spy).toHaveBeenCalled()
    })
  })

  describe('kvSet', () => {
    it('posts the correct action and key/value (with username prefix)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })
      vi.stubGlobal('fetch', fetchMock)

      await kvSet('groups:g1', { id: 'g1' })

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/kv',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'set', key: 'testuser:groups:g1', value: { id: 'g1' }, username: 'testuser' }),
        }),
      )
    })

    it('does not throw on HTTP error', async () => {
      mockFetch({}, false)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      await expect(kvSet('groups:g1', {})).resolves.not.toThrow()
    })

    it('does not throw on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      await expect(kvSet('groups:g1', {})).resolves.not.toThrow()
    })
  })

  describe('kvDel', () => {
    it('posts the correct action and key (with username prefix)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })
      vi.stubGlobal('fetch', fetchMock)

      await kvDel('groups:g1')

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/kv',
        expect.objectContaining({
          body: JSON.stringify({ action: 'del', key: 'testuser:groups:g1', username: 'testuser' }),
        }),
      )
    })

    it('does not throw on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      await expect(kvDel('groups:g1')).resolves.not.toThrow()
    })
  })

  describe('kvGetRaw / kvSetRaw', () => {
    it('kvGetRaw sends rawGet action and the key without any prefix', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ value: 'device-token-123' }) })
      vi.stubGlobal('fetch', fetchMock)

      const result = await kvGetRaw<string>('shalom:device')

      expect(result).toBe('device-token-123')
      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.action).toBe('rawGet') // SECURITY: must use rawGet, not plain 'get'
      expect(body.key).toBe('shalom:device')
    })

    it('kvGetRaw works even when username is null', async () => {
      const noUsernameStorage = createLocalStorageMock()
      vi.stubGlobal('localStorage', noUsernameStorage)
      mockFetch({ value: 'abc' })

      const result = await kvGetRaw<string>('somekey')
      expect(result).toBe('abc')
    })

    it('kvSetRaw sends rawSet action and the key without any prefix', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
      vi.stubGlobal('fetch', fetchMock)

      await kvSetRaw('shalom:device', 'device-token-123')

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.action).toBe('rawSet') // SECURITY: must use rawSet, not plain 'set'
      expect(body.key).toBe('shalom:device')
      expect(body.value).toBe('device-token-123')
    })

    it('kvGetRaw returns null on error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')))
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const result = await kvGetRaw('shalom:device')
      expect(result).toBeNull()
    })
  })

  describe('kvList', () => {
    it('returns keys (stripped of username prefix) from the KV response', async () => {
      mockFetch({ keys: ['testuser:groups:g1', 'testuser:groups:g2'] })
      const result = await kvList('groups:')
      expect(result).toEqual(['groups:g1', 'groups:g2'])
    })

    it('returns empty array on HTTP error', async () => {
      mockFetch({}, false)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const result = await kvList('groups:')
      expect(result).toEqual([])
    })

    it('returns empty array on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const result = await kvList('groups:')
      expect(result).toEqual([])
    })
  })
})

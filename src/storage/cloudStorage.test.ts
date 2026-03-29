import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'

// Un-mock cloudStorage so we test the real implementation.
vi.unmock('./cloudStorage')

import { kvGet, kvSet, kvDel, kvList, kvGetRaw, kvSetRaw, isKvAvailable, kvCrossSet, kvCrossReadPartner } from './cloudStorage'

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

      const result = await kvGetRaw<string>('device:shalom')

      expect(result).toBe('device-token-123')
      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.action).toBe('rawGet') // SECURITY: must use rawGet, not plain 'get'
      expect(body.key).toBe('device:shalom')
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

      await kvSetRaw('device:shalom', 'device-token-123')

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.action).toBe('rawSet') // SECURITY: must use rawSet, not plain 'set'
      expect(body.key).toBe('device:shalom')
      expect(body.value).toBe('device-token-123')
    })

    it('kvGetRaw returns null on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')))
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const result = await kvGetRaw('device:shalom')
      expect(result).toBeNull()
    })

    it('kvGetRaw returns null on HTTP error (e.g. server rejects key with 400)', async () => {
      mockFetch({}, false)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const result = await kvGetRaw('device:shalom')
      expect(result).toBeNull()
    })

    it('kvSetRaw does not throw on HTTP error (e.g. server rejects key with 400)', async () => {
      mockFetch({}, false)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      await expect(kvSetRaw('device:shalom', 'token')).resolves.not.toThrow()
    })

    it('kvSetRaw does not throw on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      await expect(kvSetRaw('device:shalom', 'token')).resolves.not.toThrow()
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

  describe('kvCrossSet', () => {
    it('returns ok on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) }))
      const result = await kvCrossSet('otheruser', 'share:incomingRequest', { fromUsername: 'testuser', sentAt: 1 })
      expect(result).toBe('ok')
    })

    it('sends correct action, username, targetUsername, key, and value', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) })
      vi.stubGlobal('fetch', fetchMock)

      await kvCrossSet('otheruser', 'share:acceptNotification', { byUsername: 'testuser', at: 123 })

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.action).toBe('crossSet')
      expect(body.username).toBe('testuser')
      expect(body.targetUsername).toBe('otheruser')
      expect(body.key).toBe('share:acceptNotification')
      expect(body.value).toEqual({ byUsername: 'testuser', at: 123 })
    })

    it('returns already_pending on HTTP 409', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({ error: 'Target already has a pending request' }) }))
      const result = await kvCrossSet('otheruser', 'share:incomingRequest', {})
      expect(result).toBe('already_pending')
    })

    it('returns error on other HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({ error: 'Key not allowed' }) }))
      const result = await kvCrossSet('otheruser', 'share:incomingRequest', {})
      expect(result).toBe('error')
    })

    it('returns error on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
      const result = await kvCrossSet('otheruser', 'share:incomingRequest', {})
      expect(result).toBe('error')
    })

    it('returns error when username is null', async () => {
      const noUsernameStorage = createLocalStorageMock()
      vi.stubGlobal('localStorage', noUsernameStorage)
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const result = await kvCrossSet('otheruser', 'share:incomingRequest', {})

      expect(result).toBe('error')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('kvCrossReadPartner', () => {
    it('returns citations and deleteLog on success', async () => {
      const payload = {
        citations: [{ id: 'c1', text: 'quote', author: 'א. בן', usedInListIds: [] }],
        deleteLog: ['c2'],
      }
      mockFetch(payload)
      const result = await kvCrossReadPartner('partneruser')
      expect(result).toEqual(payload)
    })

    it('sends correct action, username, and partnerUsername', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ citations: [], deleteLog: [] }) })
      vi.stubGlobal('fetch', fetchMock)

      await kvCrossReadPartner('partneruser')

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.action).toBe('crossRead')
      expect(body.username).toBe('testuser')
      expect(body.partnerUsername).toBe('partneruser')
    })

    it('returns null on HTTP 403 (partner stopped sharing)', async () => {
      mockFetch({ error: 'Not authorized' }, false)
      const result = await kvCrossReadPartner('partneruser')
      expect(result).toBeNull()
    })

    it('returns null on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
      const result = await kvCrossReadPartner('partneruser')
      expect(result).toBeNull()
    })

    it('returns null when username is null', async () => {
      const noUsernameStorage = createLocalStorageMock()
      vi.stubGlobal('localStorage', noUsernameStorage)
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const result = await kvCrossReadPartner('partneruser')

      expect(result).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})

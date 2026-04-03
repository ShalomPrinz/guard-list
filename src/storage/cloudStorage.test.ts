import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'

// Un-mock cloudStorage so we test the real implementation.
vi.unmock('./cloudStorage')

import { kvGet, kvSet, kvDel, kvList, kvGetRaw, kvSetRaw, isKvAvailable, kvCrossSet, kvCrossReadGroupMember, kvListGuestCitations, kvDeleteGuestCitation, kvMGet, kvGroupCreate, kvGroupJoin, kvGroupLeave, kvGroupGetMembers, kvGetBackupSuspension } from './cloudStorage'

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

  describe('kvMGet', () => {
    it('sends prefixed keys and returns values array', async () => {
      const val1 = { id: 'c1', text: 'quote1', author: 'א. ב', submittedAt: 1000 }
      const val2 = { id: 'c2', text: 'quote2', author: 'ג. ד', submittedAt: 2000 }
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ values: [val1, val2] }) })
      vi.stubGlobal('fetch', fetchMock)

      const result = await kvMGet<typeof val1>(['guestCitations:c1', 'guestCitations:c2'])

      expect(result).toEqual([val1, val2])
      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.action).toBe('mget')
      expect(body.keys).toEqual(['testuser:guestCitations:c1', 'testuser:guestCitations:c2'])
      expect(body.username).toBe('testuser')
    })

    it('returns all-null array when keys is empty', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const result = await kvMGet([])

      expect(result).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns all-null array when username is null', async () => {
      const noUsernameStorage = createLocalStorageMock()
      vi.stubGlobal('localStorage', noUsernameStorage)
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const result = await kvMGet(['guestCitations:c1'])

      expect(result).toEqual([null])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns all-null array and logs on HTTP error', async () => {
      mockFetch({}, false)
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const result = await kvMGet(['guestCitations:c1', 'guestCitations:c2'])

      expect(result).toEqual([null, null])
      expect(spy).toHaveBeenCalled()
    })

    it('returns all-null array and logs on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const result = await kvMGet(['guestCitations:c1'])

      expect(result).toEqual([null])
      expect(spy).toHaveBeenCalled()
    })
  })

  describe('kvCrossSet', () => {
    it('returns ok on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) }))
      const result = await kvCrossSet('otheruser', 'share:groupInvitation', { groupId: 'grp_1', fromUsername: 'testuser', sentAt: 1 })
      expect(result).toBe('ok')
    })

    it('sends correct action, username, targetUsername, key, and value', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) })
      vi.stubGlobal('fetch', fetchMock)

      await kvCrossSet('otheruser', 'share:acceptNotification', { byUsername: 'testuser', groupId: 'grp_1', at: 123 })

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.action).toBe('crossSet')
      expect(body.username).toBe('testuser')
      expect(body.targetUsername).toBe('otheruser')
      expect(body.key).toBe('share:acceptNotification')
      expect(body.value).toEqual({ byUsername: 'testuser', groupId: 'grp_1', at: 123 })
    })

    it('returns already_pending on HTTP 409', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({ error: 'Target already has a pending invitation' }) }))
      const result = await kvCrossSet('otheruser', 'share:groupInvitation', {})
      expect(result).toBe('already_pending')
    })

    it('returns error on other HTTP error and logs console.error with status and body', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('{"error":"Key not allowed"}'),
        json: () => Promise.resolve({ error: 'Key not allowed' }),
      }))
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const result = await kvCrossSet('otheruser', 'share:groupInvitation', {})
      expect(result).toBe('error')
      expect(spy).toHaveBeenCalledWith('[kv] crossSet failed: HTTP', 403, '{"error":"Key not allowed"}')
    })

    it('returns error on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
      const result = await kvCrossSet('otheruser', 'share:groupInvitation', {})
      expect(result).toBe('error')
    })

    it('returns error when username is null', async () => {
      const noUsernameStorage = createLocalStorageMock()
      vi.stubGlobal('localStorage', noUsernameStorage)
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const result = await kvCrossSet('otheruser', 'share:groupInvitation', {})

      expect(result).toBe('error')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('kvCrossReadGroupMember', () => {
    it('returns citations and deleteLog on success', async () => {
      const payload = {
        citations: [{ id: 'c1', text: 'quote', author: 'א. בן', usedInListIds: [] }],
        deleteLog: ['c2'],
      }
      mockFetch(payload)
      const result = await kvCrossReadGroupMember('partneruser')
      expect(result).toEqual(payload)
    })

    it('sends correct action, username, and partnerUsername', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ citations: [], deleteLog: [] }) })
      vi.stubGlobal('fetch', fetchMock)

      await kvCrossReadGroupMember('partneruser')

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.action).toBe('crossRead')
      expect(body.username).toBe('testuser')
      expect(body.partnerUsername).toBe('partneruser')
    })

    it('returns null on HTTP 403 (not in same group)', async () => {
      mockFetch({ error: 'not in same group' }, false)
      const result = await kvCrossReadGroupMember('partneruser')
      expect(result).toBeNull()
    })

    it('returns null on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
      const result = await kvCrossReadGroupMember('partneruser')
      expect(result).toBeNull()
    })

    it('returns null when username is null', async () => {
      const noUsernameStorage = createLocalStorageMock()
      vi.stubGlobal('localStorage', noUsernameStorage)
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const result = await kvCrossReadGroupMember('partneruser')

      expect(result).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('kvGroupCreate', () => {
    it('returns groupId on success', async () => {
      mockFetch({ groupId: 'grp_test_abc' })
      const result = await kvGroupCreate()
      expect(result).toEqual({ groupId: 'grp_test_abc' })
    })

    it('sends correct action and username', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ groupId: 'grp_1' }) })
      vi.stubGlobal('fetch', fetchMock)
      await kvGroupCreate()
      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.action).toBe('groupCreate')
      expect(body.username).toBe('testuser')
    })

    it('returns null on HTTP error', async () => {
      mockFetch({}, false)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const result = await kvGroupCreate()
      expect(result).toBeNull()
    })

    it('returns null when username is null', async () => {
      const noUsernameStorage = createLocalStorageMock()
      vi.stubGlobal('localStorage', noUsernameStorage)
      const result = await kvGroupCreate()
      expect(result).toBeNull()
    })
  })

  describe('kvGroupJoin', () => {
    it('returns ok on success', async () => {
      mockFetch({ ok: true })
      const result = await kvGroupJoin('grp_test')
      expect(result).toBe('ok')
    })

    it('returns error on HTTP error', async () => {
      mockFetch({}, false)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const result = await kvGroupJoin('grp_test')
      expect(result).toBe('error')
    })

    it('returns error when username is null', async () => {
      const noUsernameStorage = createLocalStorageMock()
      vi.stubGlobal('localStorage', noUsernameStorage)
      const result = await kvGroupJoin('grp_test')
      expect(result).toBe('error')
    })
  })

  describe('kvGroupLeave', () => {
    it('returns ok on success', async () => {
      mockFetch({ ok: true })
      const result = await kvGroupLeave('grp_test')
      expect(result).toBe('ok')
    })

    it('returns error on HTTP error', async () => {
      mockFetch({}, false)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const result = await kvGroupLeave('grp_test')
      expect(result).toBe('error')
    })

    it('returns error when username is null', async () => {
      const noUsernameStorage = createLocalStorageMock()
      vi.stubGlobal('localStorage', noUsernameStorage)
      const result = await kvGroupLeave('grp_test')
      expect(result).toBe('error')
    })
  })

  describe('kvGroupGetMembers', () => {
    it('returns members array on success', async () => {
      mockFetch({ members: ['alice', 'bob'] })
      const result = await kvGroupGetMembers('grp_test')
      expect(result).toEqual(['alice', 'bob'])
    })

    it('returns null on HTTP error', async () => {
      mockFetch({}, false)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const result = await kvGroupGetMembers('grp_test')
      expect(result).toBeNull()
    })

    it('returns null when username is null', async () => {
      const noUsernameStorage = createLocalStorageMock()
      vi.stubGlobal('localStorage', noUsernameStorage)
      const result = await kvGroupGetMembers('grp_test')
      expect(result).toBeNull()
    })
  })

  describe('kvListGuestCitations', () => {
    it('returns submissions sorted by submittedAt ascending', async () => {
      const sub1 = { id: 'id1', text: 'quote1', author: 'א. בן', submittedAt: 2000 }
      const sub2 = { id: 'id2', text: 'quote2', author: 'ב. גד', submittedAt: 1000 }
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ keys: ['testuser:guestCitations:id1', 'testuser:guestCitations:id2'] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ values: [sub1, sub2] }) })
      vi.stubGlobal('fetch', fetchMock)

      const result = await kvListGuestCitations()

      expect(result).toEqual([sub2, sub1])
      // Only 2 fetch calls: 1 list + 1 mget
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('returns empty array when username is null', async () => {
      const noUsernameStorage = createLocalStorageMock()
      vi.stubGlobal('localStorage', noUsernameStorage)
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const result = await kvListGuestCitations()

      expect(result).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('filters out null values from kvMGet', async () => {
      const sub1 = { id: 'id1', text: 'quote1', author: 'א. בן', submittedAt: 1000 }
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ keys: ['testuser:guestCitations:id1', 'testuser:guestCitations:id2'] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ values: [sub1, null] }) })
      vi.stubGlobal('fetch', fetchMock)

      const result = await kvListGuestCitations()

      expect(result).toEqual([sub1])
      // Only 2 fetch calls: 1 list + 1 mget
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('returns empty array when list returns no keys', async () => {
      mockFetch({ keys: [] })
      const result = await kvListGuestCitations()
      expect(result).toEqual([])
    })

    it('returns empty array on fetch error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const result = await kvListGuestCitations()
      expect(result).toEqual([])
    })
  })

  describe('kvGetBackupSuspension', () => {
    it('uses checkBackupSuspension action, not get', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ suspended: false }) })
      vi.stubGlobal('fetch', fetchMock)

      await kvGetBackupSuspension()

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.action).toBe('checkBackupSuspension')
      expect(body.username).toBe('testuser')
    })

    it('returns suspendedUntil when server says suspended: true', async () => {
      const ts = Date.now() + 12 * 60 * 60 * 1000
      mockFetch({ suspended: true, suspendedUntil: ts })
      const result = await kvGetBackupSuspension()
      expect(result).toBe(ts)
    })

    it('returns null when server says suspended: false', async () => {
      mockFetch({ suspended: false })
      const result = await kvGetBackupSuspension()
      expect(result).toBeNull()
    })

    it('SECURITY: returns active suspension even when client Date.now() is spoofed to MAX_SAFE_INTEGER', async () => {
      const ts = Date.now() + 12 * 60 * 60 * 1000
      mockFetch({ suspended: true, suspendedUntil: ts })
      // Simulate a user overriding Date.now to bypass the old client-side check
      vi.spyOn(Date, 'now').mockReturnValue(Number.MAX_SAFE_INTEGER)

      const result = await kvGetBackupSuspension()

      // Server said suspended: true — client must honor it regardless of local Date.now()
      expect(result).toBe(ts)
    })

    it('SECURITY: returns null when server says not suspended, even when client Date.now() is spoofed to 0', async () => {
      mockFetch({ suspended: false })
      vi.spyOn(Date, 'now').mockReturnValue(0)

      const result = await kvGetBackupSuspension()

      expect(result).toBeNull()
    })

    it('returns null on HTTP error', async () => {
      mockFetch({}, false)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const result = await kvGetBackupSuspension()
      expect(result).toBeNull()
    })

    it('returns null when username is null', async () => {
      const noUsernameStorage = createLocalStorageMock()
      vi.stubGlobal('localStorage', noUsernameStorage)
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const result = await kvGetBackupSuspension()

      expect(result).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('kvDeleteGuestCitation', () => {
    it('calls kvDel with the correct guest citations key', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })
      vi.stubGlobal('fetch', fetchMock)

      await kvDeleteGuestCitation('abc-123')

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(body.action).toBe('del')
      expect(body.key).toBe('testuser:guestCitations:abc-123')
    })

    it('does not throw on error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      await expect(kvDeleteGuestCitation('abc-123')).resolves.not.toThrow()
    })
  })
})

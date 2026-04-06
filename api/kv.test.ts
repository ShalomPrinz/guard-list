import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures kvMock is defined before the vi.mock factory executes
const kvMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
  scan: vi.fn(),
  mget: vi.fn(),
}))

const ratelimitMock = vi.hoisted(() => ({
  limit: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => kvMock),
}))

vi.mock('@upstash/ratelimit', () => {
  const RatelimitMock = vi.fn().mockImplementation(() => ratelimitMock)
  RatelimitMock.slidingWindow = vi.fn().mockReturnValue({})
  return { Ratelimit: RatelimitMock }
})

// Provide required env vars before handler module evaluates
process.env.KV_REST_API_URL = 'https://mock.upstash.io'
process.env.KV_REST_API_TOKEN = 'mock-token'

import handler from './kv'

// ── helpers ────────────────────────────────────────────────────────────────────

interface ReqOpts {
  method?: string
  contentType?: string | false // false = omit header entirely
  contentLength?: number
  origin?: string | null // null = omit header
  xForwardedFor?: string
}

function makeReq(body: unknown, opts: ReqOpts = {}): Request {
  const {
    method = 'POST',
    contentType = 'application/json',
    contentLength,
    origin,
    xForwardedFor,
  } = opts

  const headers = new Headers()
  if (contentType !== false) headers.set('content-type', contentType)
  if (contentLength !== undefined) headers.set('content-length', String(contentLength))
  if (origin !== undefined && origin !== null) headers.set('origin', origin)
  if (xForwardedFor) headers.set('x-forwarded-for', xForwardedFor)

  return new Request('http://localhost/api/kv', {
    method,
    headers,
    body: method !== 'GET' ? JSON.stringify(body) : undefined,
  })
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe('api/kv handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ALLOWED_ORIGIN
    delete process.env.VERCEL_URL
    kvMock.get.mockResolvedValue(null)
    kvMock.set.mockResolvedValue('OK')
    kvMock.del.mockResolvedValue(1)
    kvMock.keys.mockResolvedValue([])
    kvMock.scan.mockResolvedValue([0, []])
    kvMock.mget.mockResolvedValue([])
    ratelimitMock.limit.mockResolvedValue({ success: true })
  })

  // ── method check ──────────────────────────────────────────────────────────
  describe('method check', () => {
    it('rejects GET with 405', async () => {
      const res = await handler(makeReq({}, { method: 'GET' }))
      expect(res.status).toBe(405)
    })
  })

  // ── origin check ─────────────────────────────────────────────────────────
  describe('origin check', () => {
    it('rejects absent Origin header when ALLOWED_ORIGIN is set', async () => {
      process.env.ALLOWED_ORIGIN = 'https://myapp.vercel.app'
      // no origin header → origin header value is null → should be rejected
      const res = await handler(
        makeReq({ action: 'get', username: 'alice', key: 'alice:ns:id' }, { origin: null }),
      )
      expect(res.status).toBe(403)
    })

    it('rejects mismatched origin when ALLOWED_ORIGIN is set', async () => {
      process.env.ALLOWED_ORIGIN = 'https://myapp.vercel.app'
      const res = await handler(
        makeReq(
          { action: 'get', username: 'alice', key: 'alice:ns:id' },
          { origin: 'https://attacker.com' },
        ),
      )
      expect(res.status).toBe(403)
    })

    it('allows matching origin when ALLOWED_ORIGIN is set', async () => {
      process.env.ALLOWED_ORIGIN = 'https://myapp.vercel.app'
      const res = await handler(
        makeReq(
          { action: 'get', username: 'alice', key: 'alice:ns:id' },
          { origin: 'https://myapp.vercel.app' },
        ),
      )
      expect(res.status).toBe(200)
    })

    it('allows any origin when ALLOWED_ORIGIN is not set', async () => {
      // no env var, no origin header — should pass through
      const res = await handler(
        makeReq({ action: 'get', username: 'alice', key: 'alice:ns:id' }),
      )
      expect(res.status).toBe(200)
    })
  })

  // ── rate limit check ─────────────────────────────────────────────────────
  describe('rate limit check', () => {
    it('returns 429 when ratelimit.limit returns success=false', async () => {
      ratelimitMock.limit.mockResolvedValue({ success: false })
      const res = await handler(makeReq({ action: 'get', username: 'alice', key: 'alice:ns:id' }))
      expect(res.status).toBe(429)
      const body = await res.json() as { error: string }
      expect(body.error).toBe('Too many requests')
    })

    it('passes through when ratelimit.limit returns success=true', async () => {
      ratelimitMock.limit.mockResolvedValue({ success: true })
      const res = await handler(makeReq({ action: 'get', username: 'alice', key: 'alice:ns:id' }))
      expect(res.status).toBe(200)
    })
  })

  // ── content-type check ───────────────────────────────────────────────────
  describe('content-type check', () => {
    it('rejects missing content-type with 415', async () => {
      const res = await handler(
        makeReq({ action: 'get', username: 'alice', key: 'alice:ns:id' }, { contentType: false }),
      )
      expect(res.status).toBe(415)
    })

    it('rejects wrong content-type (text/plain) with 415', async () => {
      const res = await handler(
        makeReq(
          { action: 'get', username: 'alice', key: 'alice:ns:id' },
          { contentType: 'text/plain' },
        ),
      )
      expect(res.status).toBe(415)
    })

    it('accepts application/json with charset', async () => {
      const res = await handler(
        makeReq(
          { action: 'get', username: 'alice', key: 'alice:ns:id' },
          { contentType: 'application/json; charset=utf-8' },
        ),
      )
      expect(res.status).toBe(200)
    })
  })

  // ── content-length check ─────────────────────────────────────────────────
  describe('content-length check', () => {
    it('rejects content-length > 65536 with 413', async () => {
      const res = await handler(
        makeReq(
          { action: 'get', username: 'alice', key: 'alice:ns:id' },
          { contentLength: 65_537 },
        ),
      )
      expect(res.status).toBe(413)
    })

    it('allows content-length at the limit (65536)', async () => {
      const res = await handler(
        makeReq(
          { action: 'get', username: 'alice', key: 'alice:ns:id' },
          { contentLength: 65_536 },
        ),
      )
      expect(res.status).toBe(200)
    })

    it('allows missing content-length header (defaults to 0)', async () => {
      const res = await handler(
        makeReq({ action: 'get', username: 'alice', key: 'alice:ns:id' }),
      )
      expect(res.status).toBe(200)
    })
  })

  // ── username validation & normalization ──────────────────────────────────
  describe('username normalization', () => {
    it('accepts username with leading/trailing whitespace (trims before namespace check)', async () => {
      // "  alice  " trims to "alice" → expectedPrefix is "alice:" → key matches
      const res = await handler(
        makeReq({ action: 'get', username: '  alice  ', key: 'alice:ns:id' }),
      )
      expect(res.status).toBe(200)
    })

    it('accepts uppercase username (lowercases before namespace check)', async () => {
      // "ALICE" lowercases to "alice" → expectedPrefix is "alice:" → key matches
      const res = await handler(
        makeReq({ action: 'get', username: 'ALICE', key: 'alice:ns:id' }),
      )
      expect(res.status).toBe(200)
    })

    it('rejects username shorter than 2 chars after trimming', async () => {
      const res = await handler(
        makeReq({ action: 'get', username: 'a', key: 'a:ns:id' }),
      )
      expect(res.status).toBe(400)
    })

    it('rejects username containing colon (namespace separator)', async () => {
      const res = await handler(
        makeReq({ action: 'get', username: 'ali:ce', key: 'ali:ce:ns:id' }),
      )
      expect(res.status).toBe(400)
    })

    it('rejects username containing glob wildcard *', async () => {
      const res = await handler(
        makeReq({ action: 'get', username: 'alice*', key: 'alice*:ns:id' }),
      )
      expect(res.status).toBe(400)
    })

    it('rejects username containing glob character ?', async () => {
      const res = await handler(
        makeReq({ action: 'get', username: 'ali?e', key: 'ali?e:ns:id' }),
      )
      expect(res.status).toBe(400)
    })
  })

  // ── list action — suffix glob injection ──────────────────────────────────
  describe('list action — suffix glob injection prevention', () => {
    it('allows safe alphanumeric suffix', async () => {
      const res = await handler(
        makeReq({ action: 'list', username: 'alice', prefix: 'alice:schedules:' }),
      )
      expect(res.status).toBe(200)
    })

    it('allows empty suffix (list all keys for user)', async () => {
      const res = await handler(
        makeReq({ action: 'list', username: 'alice', prefix: 'alice:' }),
      )
      expect(res.status).toBe(200)
    })

    it('rejects suffix containing * wildcard with 400', async () => {
      const res = await handler(
        makeReq({ action: 'list', username: 'alice', prefix: 'alice:*' }),
      )
      expect(res.status).toBe(400)
    })

    it('rejects suffix containing ? with 400', async () => {
      const res = await handler(
        makeReq({ action: 'list', username: 'alice', prefix: 'alice:sche?ules:' }),
      )
      expect(res.status).toBe(400)
    })

    it('rejects suffix containing [ with 400', async () => {
      const res = await handler(
        makeReq({ action: 'list', username: 'alice', prefix: 'alice:[abc' }),
      )
      expect(res.status).toBe(400)
    })

    it('rejects list prefix outside caller namespace with 403', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const res = await handler(
        makeReq({ action: 'list', username: 'alice', prefix: 'bob:schedules:' }),
      )
      expect(res.status).toBe(403)
      warn.mockRestore()
    })

    it('returns keys matching prefix in response body', async () => {
      kvMock.keys.mockResolvedValueOnce(['alice:schedules:1', 'alice:schedules:2'])
      const res = await handler(
        makeReq({ action: 'list', username: 'alice', prefix: 'alice:schedules:' }),
      )
      expect(res.status).toBe(200)
      const body = await res.json() as { keys: string[] }
      expect(body.keys).toEqual(['alice:schedules:1', 'alice:schedules:2'])
      expect(kvMock.keys).toHaveBeenCalledWith('alice:schedules:*')
    })

    it('calls kv.keys with the prefix pattern including wildcard suffix', async () => {
      kvMock.keys.mockResolvedValueOnce(['alice:schedules:3'])
      const res = await handler(
        makeReq({ action: 'list', username: 'alice', prefix: 'alice:schedules:' }),
      )
      expect(res.status).toBe(200)
      expect(kvMock.keys).toHaveBeenCalledTimes(1)
      expect(kvMock.keys).toHaveBeenCalledWith('alice:schedules:*')
    })

    it('returns empty keys array when keys finds nothing', async () => {
      kvMock.keys.mockResolvedValueOnce([])
      const res = await handler(
        makeReq({ action: 'list', username: 'alice', prefix: 'alice:schedules:' }),
      )
      expect(res.status).toBe(200)
      const body = await res.json() as { keys: string[] }
      expect(body.keys).toEqual([])
    })
  })

  // ── namespace violation logging ───────────────────────────────────────────
  describe('namespace violation logging', () => {
    it('logs ip, username, and key on get namespace violation', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const res = await handler(
        makeReq(
          { action: 'get', username: 'alice', key: 'bob:ns:id' },
          { xForwardedFor: '1.2.3.4' },
        ),
      )
      expect(res.status).toBe(403)
      expect(warn).toHaveBeenCalledWith(
        '[kv] namespace violation',
        expect.objectContaining({ ip: '1.2.3.4', username: 'alice', key: 'bob:ns:id' }),
      )
      warn.mockRestore()
    })

    it('logs on set namespace violation', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const res = await handler(
        makeReq({ action: 'set', username: 'alice', key: 'bob:ns:id', value: {} }),
      )
      expect(res.status).toBe(403)
      expect(warn).toHaveBeenCalledWith(
        '[kv] namespace violation',
        expect.objectContaining({ username: 'alice', key: 'bob:ns:id' }),
      )
      warn.mockRestore()
    })

    it('logs on del namespace violation', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const res = await handler(
        makeReq({ action: 'del', username: 'alice', key: 'bob:ns:id' }),
      )
      expect(res.status).toBe(403)
      expect(warn).toHaveBeenCalledWith(
        '[kv] namespace violation',
        expect.objectContaining({ username: 'alice', key: 'bob:ns:id' }),
      )
      warn.mockRestore()
    })

    it('logs on list namespace violation', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const res = await handler(
        makeReq({ action: 'list', username: 'alice', prefix: 'bob:schedules:' }),
      )
      expect(res.status).toBe(403)
      expect(warn).toHaveBeenCalledWith(
        '[kv] namespace violation',
        expect.objectContaining({ username: 'alice', key: 'bob:schedules:' }),
      )
      warn.mockRestore()
    })
  })

  // ── rawGet / rawSet key validation ───────────────────────────────────────
  describe('rawGet / rawSet key validation', () => {
    it('allows valid device: key for rawGet', async () => {
      kvMock.get.mockResolvedValue('token123')
      const res = await handler(makeReq({ action: 'rawGet', key: 'device:alice' }))
      expect(res.status).toBe(200)
      const data = await res.json() as { value: string }
      expect(data.value).toBe('token123')
    })

    it('rejects non-device key for rawGet with 400', async () => {
      const res = await handler(makeReq({ action: 'rawGet', key: 'alice:schedule:s1' }))
      expect(res.status).toBe(400)
    })

    it('allows valid device: key for rawSet', async () => {
      const res = await handler(makeReq({ action: 'rawSet', key: 'device:alice', value: 'token' }))
      expect(res.status).toBe(200)
    })

    it('rejects non-device key for rawSet with 400', async () => {
      const res = await handler(makeReq({ action: 'rawSet', key: 'alice:schedule:s1', value: {} }))
      expect(res.status).toBe(400)
    })

    it('rejects rawGet key with glob chars in device suffix', async () => {
      const res = await handler(makeReq({ action: 'rawGet', key: 'device:*' }))
      expect(res.status).toBe(400)
    })

    it('rejects rawGet key that is just "device:" with empty suffix', async () => {
      // RAW_KEY_RE requires {1,128} chars after "device:", empty suffix fails
      const res = await handler(makeReq({ action: 'rawGet', key: 'device:' }))
      expect(res.status).toBe(400)
    })
  })

  // ── listGuestCitations action ──────────────────────────────────────────────
  describe('listGuestCitations action', () => {
    it('returns citations sorted by submittedAt descending with limit', async () => {
      const sub1 = { id: 'id1', text: 'quote1', author: 'author1', submittedAt: 1000 }
      const sub2 = { id: 'id2', text: 'quote2', author: 'author2', submittedAt: 2000 }
      const sub3 = { id: 'id3', text: 'quote3', author: 'author3', submittedAt: 1500 }
      kvMock.keys.mockResolvedValue(['alice:guestCitations:id1', 'alice:guestCitations:id2', 'alice:guestCitations:id3'])
      kvMock.mget.mockResolvedValue([sub1, sub2, sub3])

      const res = await handler(makeReq({ action: 'listGuestCitations', username: 'alice', limit: 5 }))

      expect(res.status).toBe(200)
      const body = await res.json() as { citations: typeof sub1[] }
      expect(body.citations).toEqual([sub2, sub3, sub1])
    })

    it('returns limited number of citations', async () => {
      const submissions = Array.from({ length: 10 }, (_, i) => ({
        id: `id${i}`,
        text: `quote${i}`,
        author: `author${i}`,
        submittedAt: 10000 - i * 1000,
      }))
      kvMock.keys.mockResolvedValue(submissions.map((_, i) => `alice:guestCitations:id${i}`))
      kvMock.mget.mockResolvedValue(submissions)

      const res = await handler(makeReq({ action: 'listGuestCitations', username: 'alice', limit: 3 }))

      expect(res.status).toBe(200)
      const body = await res.json() as { citations: typeof submissions[0][] }
      expect(body.citations).toHaveLength(3)
    })

    it('returns default limit 5 when limit not provided', async () => {
      const submissions = Array.from({ length: 10 }, (_, i) => ({
        id: `id${i}`,
        text: `quote${i}`,
        author: `author${i}`,
        submittedAt: 10000 - i * 1000,
      }))
      kvMock.keys.mockResolvedValue(submissions.map((_, i) => `alice:guestCitations:id${i}`))
      kvMock.mget.mockResolvedValue(submissions)

      const res = await handler(makeReq({ action: 'listGuestCitations', username: 'alice' }))

      expect(res.status).toBe(200)
      const body = await res.json() as { citations: typeof submissions[0][] }
      expect(body.citations).toHaveLength(5)
    })

    it('returns empty array when no keys found', async () => {
      kvMock.keys.mockResolvedValue([])

      const res = await handler(makeReq({ action: 'listGuestCitations', username: 'alice', limit: 5 }))

      expect(res.status).toBe(200)
      const body = await res.json() as { citations: unknown[] }
      expect(body.citations).toEqual([])
    })

    it('filters out null values from mget', async () => {
      const sub1 = { id: 'id1', text: 'quote1', author: 'author1', submittedAt: 1000 }
      const sub2 = { id: 'id2', text: 'quote2', author: 'author2', submittedAt: 2000 }
      kvMock.keys.mockResolvedValue(['alice:guestCitations:id1', 'alice:guestCitations:id2', 'alice:guestCitations:id3'])
      kvMock.mget.mockResolvedValue([sub1, sub2, null])

      const res = await handler(makeReq({ action: 'listGuestCitations', username: 'alice', limit: 5 }))

      expect(res.status).toBe(200)
      const body = await res.json() as { citations: typeof sub1[] }
      expect(body.citations).toEqual([sub2, sub1])
    })

    it('enforces minimum limit of 1', async () => {
      const sub1 = { id: 'id1', text: 'quote1', author: 'author1', submittedAt: 1000 }
      kvMock.keys.mockResolvedValue(['alice:guestCitations:id1'])
      kvMock.mget.mockResolvedValue([sub1])

      const res = await handler(makeReq({ action: 'listGuestCitations', username: 'alice', limit: 0 }))

      expect(res.status).toBe(200)
      const body = await res.json() as { citations: typeof sub1[] }
      expect(body.citations).toHaveLength(1)
    })

    it('enforces maximum limit of 100', async () => {
      const submissions = Array.from({ length: 150 }, (_, i) => ({
        id: `id${i}`,
        text: `quote${i}`,
        author: `author${i}`,
        submittedAt: 150000 - i * 1000,
      }))
      kvMock.keys.mockResolvedValue(submissions.map((_, i) => `alice:guestCitations:id${i}`))
      kvMock.mget.mockResolvedValue(submissions)

      const res = await handler(makeReq({ action: 'listGuestCitations', username: 'alice', limit: 500 }))

      expect(res.status).toBe(200)
      const body = await res.json() as { citations: typeof submissions[0][] }
      expect(body.citations).toHaveLength(100)
    })
  })

  // ── group actions ─────────────────────────────────────────────────────────
  // These tests specifically verify the fix for FUNCTION_INVOCATION_FAILED:
  // @upstash/redis auto-deserializes JSON on kv.get, so members are already
  // a native string[] — never call JSON.parse on them.
  describe('groupCreate action', () => {
    it('returns 400 when user is already in a group', async () => {
      kvMock.get.mockResolvedValue('grp_existing')
      const res = await handler(makeReq({ action: 'groupCreate', username: 'alice' }))
      expect(res.status).toBe(400)
    })

    it('creates group and stores members as native array (not JSON string)', async () => {
      kvMock.get.mockResolvedValue(null) // not in a group
      const res = await handler(makeReq({ action: 'groupCreate', username: 'alice' }))
      expect(res.status).toBe(200)
      const body = await res.json() as { groupId: string }
      expect(typeof body.groupId).toBe('string')
      // Must store a native array — never JSON.stringify
      expect(kvMock.set).toHaveBeenCalledWith(
        expect.stringMatching(/^group:grp_.*:members$/),
        ['alice'],
      )
    })

    it('stores share:groupId under username namespace', async () => {
      kvMock.get.mockResolvedValue(null)
      const res = await handler(makeReq({ action: 'groupCreate', username: 'alice' }))
      expect(res.status).toBe(200)
      const body = await res.json() as { groupId: string }
      expect(kvMock.set).toHaveBeenCalledWith('alice:share:groupId', body.groupId)
    })
  })

  describe('groupJoin action', () => {
    it('returns 400 when groupId is missing', async () => {
      const res = await handler(makeReq({ action: 'groupJoin', username: 'alice' }))
      expect(res.status).toBe(400)
    })

    it('returns 400 when user is already in a group', async () => {
      kvMock.get.mockImplementation((key: string) => {
        if (key === 'alice:share:groupId') return Promise.resolve('grp_1')
        return Promise.resolve(null)
      })
      const res = await handler(makeReq({ action: 'groupJoin', username: 'alice', groupId: 'grp_1' }))
      expect(res.status).toBe(400)
      const body = await res.json() as { error: string }
      expect(body.error).toBe('Already in a group')
    })

    it('returns 404 when group does not exist', async () => {
      kvMock.get.mockResolvedValue(null) // not in a group and no members key
      const res = await handler(makeReq({ action: 'groupJoin', username: 'alice', groupId: 'grp_missing' }))
      expect(res.status).toBe(404)
    })

    it('appends user to members and returns ok — members stored as native array not JSON string', async () => {
      // Upstash auto-deserializes: kv.get returns a native string[], not a JSON string
      kvMock.get.mockImplementation((key: string) => {
        if (key === 'alice:share:groupId') return Promise.resolve(null)
        if (key === 'group:grp_1:members') return Promise.resolve(['bob'])
        return Promise.resolve(null)
      })
      const res = await handler(makeReq({ action: 'groupJoin', username: 'alice', groupId: 'grp_1' }))
      expect(res.status).toBe(200)
      // Must store native array — if JSON.parse were called on ['bob'] it would throw
      expect(kvMock.set).toHaveBeenCalledWith('group:grp_1:members', ['bob', 'alice'])
      expect(kvMock.set).toHaveBeenCalledWith('alice:share:groupId', 'grp_1')
    })

    it('handles Hebrew username in members array', async () => {
      kvMock.get.mockImplementation((key: string) => {
        if (key === 'שלום:share:groupId') return Promise.resolve(null)
        if (key === 'group:grp_hebrew:members') return Promise.resolve(['בוב'])
        return Promise.resolve(null)
      })
      const res = await handler(makeReq({ action: 'groupJoin', username: 'שלום', groupId: 'grp_hebrew' }))
      expect(res.status).toBe(200)
      expect(kvMock.set).toHaveBeenCalledWith('group:grp_hebrew:members', ['בוב', 'שלום'])
    })
  })

  describe('groupLeave action', () => {
    it('returns 400 when groupId is missing', async () => {
      const res = await handler(makeReq({ action: 'groupLeave', username: 'alice' }))
      expect(res.status).toBe(400)
    })

    it('returns 403 when user is not in the specified group', async () => {
      kvMock.get.mockImplementation((key: string) => {
        if (key === 'alice:share:groupId') return Promise.resolve('grp_other')
        return Promise.resolve(null)
      })
      const res = await handler(makeReq({ action: 'groupLeave', username: 'alice', groupId: 'grp_1' }))
      expect(res.status).toBe(403)
    })

    it('removes user from members array and deletes groupId — members stored as native array', async () => {
      kvMock.get.mockImplementation((key: string) => {
        if (key === 'alice:share:groupId') return Promise.resolve('grp_1')
        if (key === 'group:grp_1:members') return Promise.resolve(['alice', 'bob'])
        return Promise.resolve(null)
      })
      const res = await handler(makeReq({ action: 'groupLeave', username: 'alice', groupId: 'grp_1' }))
      expect(res.status).toBe(200)
      // Must store native array without alice
      expect(kvMock.set).toHaveBeenCalledWith('group:grp_1:members', ['bob'])
      expect(kvMock.del).toHaveBeenCalledWith('alice:share:groupId')
    })

    it('succeeds even when group members key is missing', async () => {
      kvMock.get.mockImplementation((key: string) => {
        if (key === 'alice:share:groupId') return Promise.resolve('grp_1')
        return Promise.resolve(null) // no members key
      })
      const res = await handler(makeReq({ action: 'groupLeave', username: 'alice', groupId: 'grp_1' }))
      expect(res.status).toBe(200)
      expect(kvMock.del).toHaveBeenCalledWith('alice:share:groupId')
    })
  })

  describe('groupGetMembers action', () => {
    it('returns 400 when groupId is missing', async () => {
      const res = await handler(makeReq({ action: 'groupGetMembers', username: 'alice' }))
      expect(res.status).toBe(400)
    })

    it('returns 403 when user is not in the specified group', async () => {
      kvMock.get.mockImplementation((key: string) => {
        if (key === 'alice:share:groupId') return Promise.resolve('grp_other')
        return Promise.resolve(null)
      })
      const res = await handler(makeReq({ action: 'groupGetMembers', username: 'alice', groupId: 'grp_1' }))
      expect(res.status).toBe(403)
    })

    it('returns members array as-is from Upstash (auto-deserialized native array)', async () => {
      kvMock.get.mockImplementation((key: string) => {
        if (key === 'alice:share:groupId') return Promise.resolve('grp_1')
        if (key === 'group:grp_1:members') return Promise.resolve(['alice', 'bob', 'carol'])
        return Promise.resolve(null)
      })
      const res = await handler(makeReq({ action: 'groupGetMembers', username: 'alice', groupId: 'grp_1' }))
      expect(res.status).toBe(200)
      const body = await res.json() as { members: string[] }
      expect(body.members).toEqual(['alice', 'bob', 'carol'])
    })

    it('returns 404 when group members key is missing', async () => {
      kvMock.get.mockImplementation((key: string) => {
        if (key === 'alice:share:groupId') return Promise.resolve('grp_1')
        return Promise.resolve(null)
      })
      const res = await handler(makeReq({ action: 'groupGetMembers', username: 'alice', groupId: 'grp_1' }))
      expect(res.status).toBe(404)
    })
  })

  // ── unknown action ────────────────────────────────────────────────────────
  describe('unknown action', () => {
    it('returns 400 for unrecognized action', async () => {
      const res = await handler(makeReq({ action: 'deleteAll', username: 'alice' }))
      expect(res.status).toBe(400)
    })
  })
})

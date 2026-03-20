import { describe, it, expect, beforeEach, vi } from 'vitest'

// Un-mock cloudStorage so we test the real implementation.
vi.unmock('./cloudStorage')

import { kvGet, kvSet, kvDel, kvList, isKvAvailable } from './cloudStorage'

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
  })

  describe('isKvAvailable', () => {
    it('is true', () => {
      expect(isKvAvailable).toBe(true)
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
    it('posts the correct action and key/value', async () => {
      mockFetch({ ok: true })
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })
      vi.stubGlobal('fetch', fetchMock)

      await kvSet('groups:g1', { id: 'g1' })

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/kv',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'set', key: 'groups:g1', value: { id: 'g1' } }),
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
    it('posts the correct action and key', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })
      vi.stubGlobal('fetch', fetchMock)

      await kvDel('groups:g1')

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/kv',
        expect.objectContaining({
          body: JSON.stringify({ action: 'del', key: 'groups:g1' }),
        }),
      )
    })

    it('does not throw on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      await expect(kvDel('groups:g1')).resolves.not.toThrow()
    })
  })

  describe('kvList', () => {
    it('returns keys from the KV response', async () => {
      mockFetch({ keys: ['groups:g1', 'groups:g2'] })
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

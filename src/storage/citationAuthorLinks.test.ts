import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'
import {
  getCitationAuthorLinks,
  saveCitationAuthorLink,
  skipCitationAuthorLink,
} from './citationAuthorLinks'

let storage: Storage

beforeEach(() => {
  storage = createLocalStorageMock()
})

describe('getCitationAuthorLinks', () => {
  it('returns empty object when nothing saved', () => {
    expect(getCitationAuthorLinks(storage)).toEqual({})
  })
})

describe('saveCitationAuthorLink', () => {
  it('stores memberId for the given author', () => {
    saveCitationAuthorLink('י. ישראלי', 'member-1', storage)
    expect(getCitationAuthorLinks(storage)['י. ישראלי']).toBe('member-1')
  })

  it('overwrites previous value for same author', () => {
    saveCitationAuthorLink('י. ישראלי', 'member-1', storage)
    saveCitationAuthorLink('י. ישראלי', 'member-2', storage)
    expect(getCitationAuthorLinks(storage)['י. ישראלי']).toBe('member-2')
  })
})

describe('skipCitationAuthorLink', () => {
  it('stores "skip" marker for the given author', () => {
    skipCitationAuthorLink('י. ישראלי', storage)
    expect(getCitationAuthorLinks(storage)['י. ישראלי']).toBe('skip')
  })
})

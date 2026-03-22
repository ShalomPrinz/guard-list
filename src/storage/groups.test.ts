import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'
import {
  getGroups,
  saveGroups,
  getGroupById,
  upsertGroup,
  deleteGroup,
} from './groups'
import type { Group } from '../types'

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'Test Group',
    members: [
      { id: 'm1', name: 'Alice', availability: 'base', role: 'warrior' },
      { id: 'm2', name: 'Bob', availability: 'home', role: 'warrior' },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('getGroups', () => {
  it('returns empty array when storage is empty', () => {
    const storage = createLocalStorageMock()
    expect(getGroups(storage)).toEqual([])
  })

  it('returns empty array on malformed JSON', () => {
    const storage = createLocalStorageMock()
    storage.setItem('groups', 'not-json')
    expect(getGroups(storage)).toEqual([])
  })
})

describe('saveGroups / getGroups round-trip', () => {
  it('persists and retrieves groups correctly', () => {
    const storage = createLocalStorageMock()
    const groups = [makeGroup(), makeGroup({ id: 'g2', name: 'Second' })]
    saveGroups(groups, storage)
    expect(getGroups(storage)).toEqual(groups)
  })

  it('overwrites existing groups', () => {
    const storage = createLocalStorageMock()
    saveGroups([makeGroup()], storage)
    saveGroups([], storage)
    expect(getGroups(storage)).toEqual([])
  })
})

describe('getGroupById', () => {
  let storage: Storage
  beforeEach(() => {
    storage = createLocalStorageMock()
    saveGroups([makeGroup({ id: 'g1' }), makeGroup({ id: 'g2', name: 'G2' })], storage)
  })

  it('finds a group by id', () => {
    expect(getGroupById('g1', storage)?.name).toBe('Test Group')
  })

  it('returns undefined for unknown id', () => {
    expect(getGroupById('unknown', storage)).toBeUndefined()
  })
})

describe('upsertGroup', () => {
  it('inserts a new group', () => {
    const storage = createLocalStorageMock()
    upsertGroup(makeGroup({ id: 'g1' }), storage)
    expect(getGroups(storage)).toHaveLength(1)
  })

  it('updates an existing group', () => {
    const storage = createLocalStorageMock()
    upsertGroup(makeGroup({ id: 'g1', name: 'Original' }), storage)
    upsertGroup(makeGroup({ id: 'g1', name: 'Updated' }), storage)
    const groups = getGroups(storage)
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Updated')
  })

  it('does not affect other groups when updating', () => {
    const storage = createLocalStorageMock()
    upsertGroup(makeGroup({ id: 'g1' }), storage)
    upsertGroup(makeGroup({ id: 'g2', name: 'G2' }), storage)
    upsertGroup(makeGroup({ id: 'g1', name: 'Updated' }), storage)
    expect(getGroups(storage)).toHaveLength(2)
    expect(getGroupById('g2', storage)?.name).toBe('G2')
  })
})

describe('deleteGroup', () => {
  it('removes the group with the given id', () => {
    const storage = createLocalStorageMock()
    saveGroups([makeGroup({ id: 'g1' }), makeGroup({ id: 'g2', name: 'G2' })], storage)
    deleteGroup('g1', storage)
    expect(getGroups(storage)).toHaveLength(1)
    expect(getGroupById('g1', storage)).toBeUndefined()
  })

  it('is a no-op for an unknown id', () => {
    const storage = createLocalStorageMock()
    saveGroups([makeGroup()], storage)
    deleteGroup('no-such-id', storage)
    expect(getGroups(storage)).toHaveLength(1)
  })
})

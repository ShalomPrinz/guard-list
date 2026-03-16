import { describe, it, expect } from 'vitest'
import { createLocalStorageMock } from '../tests/localStorageMock'
import { getStationsConfig, saveStationsConfig } from './stationsConfig'
import type { StationConfig } from '../types'

function makeConfig(overrides: Partial<StationConfig> = {}): StationConfig {
  return {
    id: 'sc1',
    name: 'Main Gate',
    type: 'time-based',
    ...overrides,
  }
}

describe('getStationsConfig', () => {
  it('returns empty array when storage is empty', () => {
    expect(getStationsConfig(createLocalStorageMock())).toEqual([])
  })

  it('returns empty array on malformed JSON', () => {
    const storage = createLocalStorageMock()
    storage.setItem('stations_config', 'bad')
    expect(getStationsConfig(storage)).toEqual([])
  })
})

describe('saveStationsConfig / getStationsConfig round-trip', () => {
  it('persists and retrieves configs correctly', () => {
    const storage = createLocalStorageMock()
    const configs = [
      makeConfig({ id: 'sc1', name: 'Main Gate', type: 'time-based' }),
      makeConfig({ id: 'sc2', name: 'Watchtower', type: 'headcount', headcountRequired: 3 }),
    ]
    saveStationsConfig(configs, storage)
    expect(getStationsConfig(storage)).toEqual(configs)
  })

  it('overwrites existing configs', () => {
    const storage = createLocalStorageMock()
    saveStationsConfig([makeConfig()], storage)
    saveStationsConfig([], storage)
    expect(getStationsConfig(storage)).toEqual([])
  })

  it('preserves headcountRequired for headcount stations', () => {
    const storage = createLocalStorageMock()
    const config = makeConfig({ type: 'headcount', headcountRequired: 5 })
    saveStationsConfig([config], storage)
    expect(getStationsConfig(storage)[0].headcountRequired).toBe(5)
  })
})

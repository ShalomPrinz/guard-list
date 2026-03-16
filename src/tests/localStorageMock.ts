/**
 * In-memory Storage implementation for use in tests.
 * Implements the full Storage interface so it can be passed to any
 * storage helper that accepts an optional `storage` argument.
 *
 * Usage:
 *   const mock = createLocalStorageMock()
 *   vi.stubGlobal('localStorage', mock)   // for component tests
 *   getGroups(mock)                        // for unit tests
 */
export function createLocalStorageMock(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null
    },
    getItem(key: string): string | null {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string): void {
      store.set(key, value)
    },
    removeItem(key: string): void {
      store.delete(key)
    },
    clear(): void {
      store.clear()
    },
  }
}

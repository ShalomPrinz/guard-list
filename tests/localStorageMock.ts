// In-memory mock implementation of the Storage interface for testing
export function createLocalStorageMock(): Storage {
  const store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = String(value)
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      Object.keys(store).forEach(key => delete store[key])
    },
    key: (index: number) => Object.keys(store)[index] || null,
    length: Object.keys(store).length,
  }
}

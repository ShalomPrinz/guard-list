// Global test setup — runs before every test file
// Runs before modules are imported, so IS_COARSE in TimePicker.tsx evaluates correctly.

// Mock cloudStorage globally so no test ever makes a real network call.
vi.mock('./storage/cloudStorage', () => ({
  kvGet: vi.fn().mockResolvedValue(null),
  kvSet: vi.fn().mockResolvedValue(undefined),
  kvDel: vi.fn().mockResolvedValue(undefined),
  kvList: vi.fn().mockResolvedValue([]),
  kvCrossSet: vi.fn().mockResolvedValue('ok'),
  kvCrossReadGroupMember: vi.fn().mockResolvedValue(null),
  kvGroupCreate: vi.fn().mockResolvedValue(null),
  kvGroupJoin: vi.fn().mockResolvedValue('ok'),
  kvGroupLeave: vi.fn().mockResolvedValue('ok'),
  kvGroupGetMembers: vi.fn().mockResolvedValue(null),
  isKvAvailable: false,
}))

window.scrollTo = vi.fn();

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

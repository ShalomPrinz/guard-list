/**
 * Tests for ErrorBoundary and ErrorScreen.
 * Verifies that ErrorBoundary catches runtime errors and renders ErrorScreen,
 * and that ErrorScreen displays correct content and navigates home on click.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorBoundary from '@/components/ErrorBoundary'
import ErrorScreen from '@/screens/ErrorScreen'

vi.mock('@/storage/cloudStorage', () => ({
  kvSet: vi.fn().mockResolvedValue(undefined),
}))

import { kvSet } from '@/storage/cloudStorage'

// Suppress console.error for expected error boundary noise
const originalConsoleError = console.error
beforeEach(() => {
  console.error = vi.fn()
  vi.clearAllMocks()
})
afterEach(() => {
  console.error = originalConsoleError
})

// ─── Helper ───────────────────────────────────────────────────────────────────

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('test error')
  return <div>תוכן תקין</div>
}

// ─── ErrorBoundary Tests ───────────────────────────────────────────────────────

describe('ErrorBoundary', () => {
  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('תוכן תקין')).toBeTruthy()
  })

  it('renders ErrorScreen when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('שגיאה!')).toBeTruthy()
  })

  it('logs the error to console via componentDidCatch', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(console.error).toHaveBeenCalled()
  })

  it('calls kvSet with an AppErrorReport when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(kvSet).toHaveBeenCalledOnce()
    const [key, report] = (kvSet as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(key).toMatch(/^errors:\d+$/)
    expect(report).toMatchObject({
      message: 'test error',
      url: expect.any(String),
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    })
    expect(typeof report.stack).toBe('string')
    expect(typeof report.componentStack).toBe('string')
  })
})

// ─── ErrorScreen Tests ─────────────────────────────────────────────────────────

describe('ErrorScreen', () => {
  it('renders the Hebrew error heading', () => {
    render(<ErrorScreen />)
    expect(screen.getByText('שגיאה!')).toBeTruthy()
  })

  it('renders the Hebrew apology message', () => {
    render(<ErrorScreen />)
    expect(screen.getByText(/סליחה על הבלאגן/)).toBeTruthy()
  })

  it('renders the app icon', () => {
    render(<ErrorScreen />)
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/app-icon.png')
  })

  it('navigates to home via window.location.href on click', async () => {
    const user = userEvent.setup()
    // jsdom does not navigate, but we can verify the assignment was attempted
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    })
    render(<ErrorScreen />)
    await user.click(screen.getByText('שגיאה!'))
    expect(window.location.href).toBe('/')
  })
})

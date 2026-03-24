/**
 * Tests for UsernameGate character/length validation.
 * Verifies that invalid usernames show the Hebrew error message
 * and that valid usernames clear it and proceed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import UsernameGate from '@/components/UsernameGate'

vi.mock('@/storage/cloudStorage', () => ({
  kvGetRaw: vi.fn().mockResolvedValue(null),
  kvSetRaw: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/storage/syncFromCloud', () => ({
  pushLocalToCloud: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/storage/groups', () => ({
  getGroups: vi.fn().mockReturnValue([]),
}))

vi.mock('@/storage/schedules', () => ({
  getSchedules: vi.fn().mockReturnValue([]),
}))

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
  vi.stubGlobal('crypto', { randomUUID: () => 'test-device-id' })
})

const ERROR_MSG = 'שם משתמש חייב להכיל לפחות 2 תווים ולא לכלול את התווים: * ? [ ] ^'

describe('UsernameGate — character validation', () => {
  it('shows error for single-character username', async () => {
    const user = userEvent.setup()
    render(<UsernameGate onConfirmed={vi.fn()} />)
    await user.type(screen.getByPlaceholderText('שם משתמש'), 'a')
    await user.click(screen.getByText('כניסה'))
    expect(screen.getByText(ERROR_MSG)).toBeTruthy()
  })

  it('shows error for empty username', async () => {
    const user = userEvent.setup()
    render(<UsernameGate onConfirmed={vi.fn()} />)
    await user.click(screen.getByText('כניסה'))
    expect(screen.getByText(ERROR_MSG)).toBeTruthy()
  })

  it('shows error when username contains *', async () => {
    const user = userEvent.setup()
    render(<UsernameGate onConfirmed={vi.fn()} />)
    await user.type(screen.getByPlaceholderText('שם משתמש'), 'bad*user')
    await user.click(screen.getByText('כניסה'))
    expect(screen.getByText(ERROR_MSG)).toBeTruthy()
  })

  it('shows error when username contains ?', async () => {
    const user = userEvent.setup()
    render(<UsernameGate onConfirmed={vi.fn()} />)
    await user.type(screen.getByPlaceholderText('שם משתמש'), 'bad?user')
    await user.click(screen.getByText('כניסה'))
    expect(screen.getByText(ERROR_MSG)).toBeTruthy()
  })

  it('shows error when username contains [', async () => {
    const user = userEvent.setup()
    render(<UsernameGate onConfirmed={vi.fn()} />)
    // userEvent treats '[' as a special key delimiter — use paste to inject the value
    await user.click(screen.getByPlaceholderText('שם משתמש'))
    await user.paste('bad[user')
    await user.click(screen.getByText('כניסה'))
    expect(screen.getByText(ERROR_MSG)).toBeTruthy()
  })

  it('shows error when username contains ^', async () => {
    const user = userEvent.setup()
    render(<UsernameGate onConfirmed={vi.fn()} />)
    await user.type(screen.getByPlaceholderText('שם משתמש'), 'bad^user')
    await user.click(screen.getByText('כניסה'))
    expect(screen.getByText(ERROR_MSG)).toBeTruthy()
  })

  it('does not show error for a valid username', async () => {
    const user = userEvent.setup()
    render(<UsernameGate onConfirmed={vi.fn()} />)
    await user.type(screen.getByPlaceholderText('שם משתמש'), 'alice')
    await user.click(screen.getByText('כניסה'))
    expect(screen.queryByText(ERROR_MSG)).toBeNull()
  })

  it('accepts valid Hebrew username without showing error', async () => {
    const user = userEvent.setup()
    render(<UsernameGate onConfirmed={vi.fn()} />)
    await user.type(screen.getByPlaceholderText('שם משתמש'), 'שלום')
    await user.click(screen.getByText('כניסה'))
    expect(screen.queryByText(ERROR_MSG)).toBeNull()
  })

  it('clears the error message when the user starts typing after a failed attempt', async () => {
    const user = userEvent.setup()
    render(<UsernameGate onConfirmed={vi.fn()} />)
    const input = screen.getByPlaceholderText('שם משתמש')
    // Trigger validation error
    await user.click(screen.getByText('כניסה'))
    expect(screen.getByText(ERROR_MSG)).toBeTruthy()
    // Typing should clear it
    await user.type(input, 'a')
    expect(screen.queryByText(ERROR_MSG)).toBeNull()
  })

  it('calls onConfirmed after successful submission', async () => {
    const onConfirmed = vi.fn()
    const user = userEvent.setup()
    render(<UsernameGate onConfirmed={onConfirmed} />)
    await user.type(screen.getByPlaceholderText('שם משתמש'), 'alice')
    await user.click(screen.getByText('כניסה'))
    // Wait for async operations to settle
    await vi.waitFor(() => expect(onConfirmed).toHaveBeenCalledOnce())
  })
})

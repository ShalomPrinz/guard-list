/**
 * Tests for GuestCitationsScreen — the public citation submission page.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import GuestCitationsScreen from '@/screens/GuestCitationsScreen'

// ─── fetch mock ──────────────────────────────────────────────────────────────

const mockFetch = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function renderGuest(username = 'alice') {
  return render(
    <MemoryRouter initialEntries={[`/guest/${username}`]}>
      <Routes>
        <Route path="/guest/:username" element={<GuestCitationsScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

// ─── Rendering ───────────────────────────────────────────────────────────────

describe('GuestCitationsScreen rendering', () => {
  it('shows the target username in the heading', () => {
    renderGuest('bob')
    expect(screen.getByText(/bob/)).toBeTruthy()
  })

  it('renders textarea and author input', () => {
    renderGuest()
    expect(screen.getByPlaceholderText('כתוב את הציטוט כאן...')).toBeTruthy()
    expect(screen.getByPlaceholderText('שם המחבר...')).toBeTruthy()
  })

  it('renders submit button', () => {
    renderGuest()
    expect(screen.getByRole('button', { name: 'שלח ציטוט' })).toBeTruthy()
  })
})

// ─── Validation ──────────────────────────────────────────────────────────────

describe('GuestCitationsScreen validation', () => {
  it('shows "נדרש טקסט וכותב" when both fields are blank', async () => {
    const user = userEvent.setup()
    renderGuest()

    await user.click(screen.getByRole('button', { name: 'שלח ציטוט' }))

    expect(screen.getByText('נדרש טקסט וכותב')).toBeTruthy()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('shows validation error when only text is blank', async () => {
    const user = userEvent.setup()
    renderGuest()

    await user.type(screen.getByPlaceholderText('שם המחבר...'), 'מחבר כלשהו')
    await user.click(screen.getByRole('button', { name: 'שלח ציטוט' }))

    expect(screen.getByText('נדרש טקסט וכותב')).toBeTruthy()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('shows validation error when only author is blank', async () => {
    const user = userEvent.setup()
    renderGuest()

    await user.type(screen.getByPlaceholderText('כתוב את הציטוט כאן...'), 'טקסט כלשהו')
    await user.click(screen.getByRole('button', { name: 'שלח ציטוט' }))

    expect(screen.getByText('נדרש טקסט וכותב')).toBeTruthy()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ─── Happy path ──────────────────────────────────────────────────────────────

describe('GuestCitationsScreen happy path', () => {
  it('submits correct payload to /api/kv', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true, id: 'abc' }), { status: 200 }))
    renderGuest('alice')

    await user.type(screen.getByPlaceholderText('כתוב את הציטוט כאן...'), 'ציטוט יפה')
    await user.type(screen.getByPlaceholderText('שם המחבר...'), 'יוסי כהן')
    await user.click(screen.getByRole('button', { name: 'שלח ציטוט' }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/kv',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            action: 'guestSubmit',
            targetUsername: 'alice',
            text: 'ציטוט יפה',
            author: 'יוסי כהן',
          }),
        }),
      )
    })
  })

  it('shows success message and resets form after successful submission', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true, id: 'abc' }), { status: 200 }))
    renderGuest()

    await user.type(screen.getByPlaceholderText('כתוב את הציטוט כאן...'), 'ציטוט')
    await user.type(screen.getByPlaceholderText('שם המחבר...'), 'מחבר')
    await user.click(screen.getByRole('button', { name: 'שלח ציטוט' }))

    await waitFor(() => {
      expect(screen.getByText('הציטוט נשלח בהצלחה!')).toBeTruthy()
    })

    // Form should be cleared
    expect((screen.getByPlaceholderText('כתוב את הציטוט כאן...') as HTMLTextAreaElement).value).toBe('')
    expect((screen.getByPlaceholderText('שם המחבר...') as HTMLInputElement).value).toBe('')
  })

  it('trims whitespace from text and author before submitting', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true, id: 'abc' }), { status: 200 }))
    renderGuest('alice')

    await user.type(screen.getByPlaceholderText('כתוב את הציטוט כאן...'), '  ציטוט  ')
    await user.type(screen.getByPlaceholderText('שם המחבר...'), '  מחבר  ')
    await user.click(screen.getByRole('button', { name: 'שלח ציטוט' }))

    await waitFor(() => {
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.text).toBe('ציטוט')
      expect(body.author).toBe('מחבר')
    })
  })
})

// ─── Error states ─────────────────────────────────────────────────────────────

describe('GuestCitationsScreen error states', () => {
  it('shows rate limit message on HTTP 429', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }))
    renderGuest()

    await user.type(screen.getByPlaceholderText('כתוב את הציטוט כאן...'), 'ציטוט')
    await user.type(screen.getByPlaceholderText('שם המחבר...'), 'מחבר')
    await user.click(screen.getByRole('button', { name: 'שלח ציטוט' }))

    await waitFor(() => {
      expect(screen.getByText('יותר מדי שליחות — נסה שוב בעוד דקה')).toBeTruthy()
    })
  })

  it('shows generic error message on non-ok response', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }))
    renderGuest()

    await user.type(screen.getByPlaceholderText('כתוב את הציטוט כאן...'), 'ציטוט')
    await user.type(screen.getByPlaceholderText('שם המחבר...'), 'מחבר')
    await user.click(screen.getByRole('button', { name: 'שלח ציטוט' }))

    await waitFor(() => {
      expect(screen.getByText('שגיאה בשליחה — נסה שוב')).toBeTruthy()
    })
  })

  it('shows generic error on network failure', async () => {
    const user = userEvent.setup()
    mockFetch.mockRejectedValue(new Error('network error'))
    renderGuest()

    await user.type(screen.getByPlaceholderText('כתוב את הציטוט כאן...'), 'ציטוט')
    await user.type(screen.getByPlaceholderText('שם המחבר...'), 'מחבר')
    await user.click(screen.getByRole('button', { name: 'שלח ציטוט' }))

    await waitFor(() => {
      expect(screen.getByText('שגיאה בשליחה — נסה שוב')).toBeTruthy()
    })
  })
})

// ─── Submitting state ─────────────────────────────────────────────────────────

describe('GuestCitationsScreen submitting state', () => {
  it('disables submit button while submitting', async () => {
    const user = userEvent.setup()
    let resolve!: (v: Response) => void
    mockFetch.mockReturnValue(new Promise(r => { resolve = r }))
    renderGuest()

    await user.type(screen.getByPlaceholderText('כתוב את הציטוט כאן...'), 'ציטוט')
    await user.type(screen.getByPlaceholderText('שם המחבר...'), 'מחבר')
    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      const btn = screen.getByRole('button')
      expect((btn as HTMLButtonElement).disabled).toBe(true)
      expect(btn.textContent).toBe('שולח...')
    })

    resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
  })
})

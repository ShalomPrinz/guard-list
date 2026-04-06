/**
 * Tests for the editable WhatsApp text feature in ResultScreen and UniteScreen.
 *
 * Covers:
 * - Clicking the pencil icon makes the preview editable (textarea appears)
 * - Clicking "אשר" saves the custom text and exits edit mode
 * - Clicking "בטל" discards draft and exits edit mode
 * - "↩ חזור לטקסט המקורי" appears only when custom text exists; clicking it removes it
 * - Clicking "← חזרה לעריכה" with a custom text shows the guard modal
 * - "אני רוצה להישאר עם הטקסט שערכתי" closes the modal without navigating
 * - "מעדיף למחוק את השינויים שלי ולערוך את הרשימה" deletes custom text and navigates
 * - UniteScreen: same pencil/accept/cancel/revert UX (session-only, no persistence)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import { WizardProvider } from '@/context/WizardContext'
import { ShortListWizardProvider } from '@/context/ShortListWizardContext'
import ResultScreen from '@/screens/ResultScreen'
import UniteScreen from '@/screens/UniteScreen'
import { createLocalStorageMock } from '@/tests/localStorageMock'
import { upsertSchedule, getScheduleById } from '@/storage/schedules'
import type { Schedule } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeParticipant(name: string, startTime: string, endTime: string) {
  return {
    name,
    startTime,
    endTime,
    date: '2024-01-01',
    durationMinutes: 60,
    locked: false,
  }
}

const baseSchedule: Schedule = {
  id: 'sched1',
  name: 'סבב ראשון',
  groupId: 'g1',
  createdAt: '2024-01-01T20:00:00Z',
  date: '2024-01-01',
  stations: [
    {
      stationConfigId: 's1',
      stationName: 'עמדה א',
      stationType: 'time-based',
      participants: [
        makeParticipant('Alice', '20:00', '21:00'),
        makeParticipant('Bob', '21:00', '22:00'),
      ],
    },
  ],
  unevenDistributionMode: 'equal-duration',
}

const targetSchedule: Schedule = {
  id: 'sched2',
  name: 'סבב שני',
  groupId: 'g1',
  createdAt: '2024-01-01T22:00:00Z',
  date: '2024-01-01',
  stations: [
    {
      stationConfigId: 's1',
      stationName: 'עמדה א',
      stationType: 'time-based',
      participants: [makeParticipant('Charlie', '22:00', '23:00')],
    },
  ],
  unevenDistributionMode: 'equal-duration',
}

function renderResultScreen(scheduleId: string) {
  return render(
    <WizardProvider>
      <ShortListWizardProvider>
        <MemoryRouter initialEntries={[`/schedule/${scheduleId}/result`]}>
          <Routes>
            <Route path="/schedule/:scheduleId/result" element={<ResultScreen />} />
            <Route path="/schedule/:scheduleId/unite-picker" element={<div>UniteListPicker</div>} />
            <Route path="/schedule/:scheduleId/continue" element={<div>ContinueScreen</div>} />
            <Route path="/schedule/new/step4" element={<div data-testid="step4">Step4</div>} />
          </Routes>
        </MemoryRouter>
      </ShortListWizardProvider>
    </WizardProvider>,
  )
}

function renderUniteScreen(scheduleId: string, targetId: string) {
  return render(
    <WizardProvider>
      <MemoryRouter initialEntries={[`/schedule/${scheduleId}/unite/${targetId}`]}>
        <Routes>
          <Route path="/schedule/:scheduleId/unite/:targetScheduleId" element={<UniteScreen />} />
          <Route path="/schedule/:scheduleId/result" element={<div data-testid="result-screen">ResultScreen</div>} />
        </Routes>
      </MemoryRouter>
    </WizardProvider>,
  )
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── ResultScreen: pencil edit flow ──────────────────────────────────────────

describe('ResultScreen — pencil edit button', () => {
  it('shows pencil button on the WhatsApp preview', () => {
    upsertSchedule(baseSchedule)
    renderResultScreen('sched1')

    expect(screen.getByLabelText('ערוך טקסט')).toBeTruthy()
  })

  it('clicking pencil shows textarea with current text', async () => {
    const user = userEvent.setup()
    upsertSchedule(baseSchedule)
    renderResultScreen('sched1')

    await user.click(screen.getByLabelText('ערוך טקסט'))

    const textarea = screen.getByRole('textbox')
    expect(textarea).toBeTruthy()
    // Pencil button should be gone while editing
    expect(screen.queryByLabelText('ערוך טקסט')).toBeNull()
  })

  it('clicking "אשר" saves custom text and exits edit mode', async () => {
    const user = userEvent.setup()
    upsertSchedule(baseSchedule)
    renderResultScreen('sched1')

    await user.click(screen.getByLabelText('ערוך טקסט'))
    const textarea = screen.getByRole('textbox')
    await user.clear(textarea)
    await user.type(textarea, 'טקסט מותאם אישית')
    await user.click(screen.getByText('אשר'))

    // Textarea should be gone, pre should show custom text
    expect(screen.queryByRole('textbox')).toBeNull()
    const pre = document.querySelector('pre')
    expect(pre?.textContent).toContain('טקסט מותאם אישית')

    // Custom text persisted in localStorage
    const saved = getScheduleById('sched1')
    expect(saved?.customWhatsAppText).toBe('טקסט מותאם אישית')
  })

  it('clicking "בטל" discards draft and exits edit mode', async () => {
    const user = userEvent.setup()
    upsertSchedule(baseSchedule)
    renderResultScreen('sched1')

    const originalText = document.querySelector('pre')?.textContent ?? ''

    await user.click(screen.getByLabelText('ערוך טקסט'))
    const textarea = screen.getByRole('textbox')
    await user.clear(textarea)
    await user.type(textarea, 'טקסט זמני שלא יישמר')
    await user.click(screen.getByText('בטל'))

    // Back to view mode with original text
    expect(screen.queryByRole('textbox')).toBeNull()
    const pre = document.querySelector('pre')
    expect(pre?.textContent).toBe(originalText)

    // No custom text saved
    const saved = getScheduleById('sched1')
    expect(saved?.customWhatsAppText).toBeUndefined()
  })
})

// ─── ResultScreen: revert to original ────────────────────────────────────────

describe('ResultScreen — revert to original', () => {
  it('"↩ חזור לטקסט המקורי" does not appear when no custom text', () => {
    upsertSchedule(baseSchedule)
    renderResultScreen('sched1')

    expect(screen.queryByText('↩ חזור לטקסט המקורי')).toBeNull()
  })

  it('"↩ חזור לטקסט המקורי" appears after saving custom text', async () => {
    const user = userEvent.setup()
    upsertSchedule(baseSchedule)
    renderResultScreen('sched1')

    await user.click(screen.getByLabelText('ערוך טקסט'))
    await user.type(screen.getByRole('textbox'), 'שינוי')
    await user.click(screen.getByText('אשר'))

    expect(screen.getByText('↩ חזור לטקסט המקורי')).toBeTruthy()
  })

  it('"↩ חזור לטקסט המקורי" appears on mount when schedule has customWhatsAppText', () => {
    upsertSchedule({ ...baseSchedule, customWhatsAppText: 'טקסט שמור' })
    renderResultScreen('sched1')

    expect(screen.getByText('↩ חזור לטקסט המקורי')).toBeTruthy()
  })

  it('clicking "↩ חזור לטקסט המקורי" removes custom text', async () => {
    const user = userEvent.setup()
    upsertSchedule({ ...baseSchedule, customWhatsAppText: 'טקסט ישן' })
    renderResultScreen('sched1')

    await user.click(screen.getByText('↩ חזור לטקסט המקורי'))

    // Custom text gone
    expect(screen.queryByText('↩ חזור לטקסט המקורי')).toBeNull()
    const saved = getScheduleById('sched1')
    expect(saved?.customWhatsAppText).toBeUndefined()
  })
})

// ─── ResultScreen: back guard modal ──────────────────────────────────────────

describe('ResultScreen — back navigation guard', () => {
  it('clicking "← חזרה לעריכה" without custom text navigates directly', async () => {
    const user = userEvent.setup()
    upsertSchedule(baseSchedule)
    renderResultScreen('sched1')

    await user.click(screen.getByText('← חזרה לעריכה'))

    expect(screen.getByTestId('step4')).toBeTruthy()
  })

  it('clicking "← חזרה לעריכה" with custom text shows guard modal', async () => {
    const user = userEvent.setup()
    upsertSchedule({ ...baseSchedule, customWhatsAppText: 'גרסה ערוכה' })
    renderResultScreen('sched1')

    await user.click(screen.getByText('← חזרה לעריכה'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('עריכת רשימה שנערכה ידנית')
  })

  it('"אני רוצה להישאר עם הטקסט שערכתי" closes the modal without navigating', async () => {
    const user = userEvent.setup()
    upsertSchedule({ ...baseSchedule, customWhatsAppText: 'גרסה ערוכה' })
    renderResultScreen('sched1')

    await user.click(screen.getByText('← חזרה לעריכה'))
    await screen.findByRole('dialog')

    await user.click(screen.getByText('אני רוצה להישאר עם הטקסט שערכתי'))

    expect(screen.queryByRole('dialog')).toBeNull()
    // Still on result screen (no step4)
    expect(screen.queryByTestId('step4')).toBeNull()
    // Custom text still in storage
    expect(getScheduleById('sched1')?.customWhatsAppText).toBe('גרסה ערוכה')
  })

  it('"מעדיף למחוק את השינויים שלי ולערוך את הרשימה" removes custom text and navigates', async () => {
    const user = userEvent.setup()
    upsertSchedule({ ...baseSchedule, customWhatsAppText: 'גרסה ערוכה' })
    renderResultScreen('sched1')

    await user.click(screen.getByText('← חזרה לעריכה'))
    await screen.findByRole('dialog')

    await user.click(screen.getByText('מעדיף למחוק את השינויים שלי ולערוך את הרשימה'))

    expect(screen.getByTestId('step4')).toBeTruthy()
    expect(getScheduleById('sched1')?.customWhatsAppText).toBeUndefined()
  })
})

// ─── UniteScreen: pencil edit flow (session-only) ────────────────────────────

describe('UniteScreen — pencil edit button (session-only)', () => {
  it('shows pencil button on the WhatsApp preview', () => {
    upsertSchedule(baseSchedule)
    upsertSchedule(targetSchedule)
    renderUniteScreen('sched1', 'sched2')

    expect(screen.getByLabelText('ערוך טקסט')).toBeTruthy()
  })

  it('clicking pencil shows textarea with current text', async () => {
    const user = userEvent.setup()
    upsertSchedule(baseSchedule)
    upsertSchedule(targetSchedule)
    renderUniteScreen('sched1', 'sched2')

    await user.click(screen.getByLabelText('ערוך טקסט'))

    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.queryByLabelText('ערוך טקסט')).toBeNull()
  })

  it('clicking "אשר" saves custom text session-only and exits edit mode', async () => {
    const user = userEvent.setup()
    upsertSchedule(baseSchedule)
    upsertSchedule(targetSchedule)
    renderUniteScreen('sched1', 'sched2')

    await user.click(screen.getByLabelText('ערוך טקסט'))
    const textarea = screen.getByRole('textbox')
    await user.clear(textarea)
    await user.type(textarea, 'טקסט מאוחד מותאם')
    await user.click(screen.getByText('אשר'))

    expect(screen.queryByRole('textbox')).toBeNull()
    const pre = document.querySelector('pre')
    expect(pre?.textContent).toContain('טקסט מאוחד מותאם')

    // No persistence — schedules in localStorage unchanged
    expect(getScheduleById('sched1')?.customWhatsAppText).toBeUndefined()
    expect(getScheduleById('sched2')?.customWhatsAppText).toBeUndefined()
  })

  it('clicking "בטל" discards draft', async () => {
    const user = userEvent.setup()
    upsertSchedule(baseSchedule)
    upsertSchedule(targetSchedule)
    renderUniteScreen('sched1', 'sched2')

    const originalText = document.querySelector('pre')?.textContent ?? ''

    await user.click(screen.getByLabelText('ערוך טקסט'))
    await user.type(screen.getByRole('textbox'), ' שינוי זמני')
    await user.click(screen.getByText('בטל'))

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(document.querySelector('pre')?.textContent).toBe(originalText)
  })

  it('"↩ חזור לטקסט המקורי" appears after accepting custom text', async () => {
    const user = userEvent.setup()
    upsertSchedule(baseSchedule)
    upsertSchedule(targetSchedule)
    renderUniteScreen('sched1', 'sched2')

    await user.click(screen.getByLabelText('ערוך טקסט'))
    await user.type(screen.getByRole('textbox'), ' שינוי')
    await user.click(screen.getByText('אשר'))

    expect(screen.getByText('↩ חזור לטקסט המקורי')).toBeTruthy()
  })

  it('"↩ חזור לטקסט המקורי" restores original generated text', async () => {
    const user = userEvent.setup()
    upsertSchedule(baseSchedule)
    upsertSchedule(targetSchedule)
    renderUniteScreen('sched1', 'sched2')

    const originalText = document.querySelector('pre')?.textContent ?? ''

    await user.click(screen.getByLabelText('ערוך טקסט'))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'גרסה שונה לגמרי')
    await user.click(screen.getByText('אשר'))

    await user.click(screen.getByText('↩ חזור לטקסט המקורי'))

    expect(document.querySelector('pre')?.textContent).toBe(originalText)
    expect(screen.queryByText('↩ חזור לטקסט המקורי')).toBeNull()
  })
})

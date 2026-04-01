/**
 * Unit tests for useBodyScrollLock — reference-counted scroll lock.
 * Regression for E024: nested modals leaving body overflow: hidden after both close.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBodyScrollLock } from './useBodyScrollLock'

beforeEach(() => {
  document.body.style.overflow = ''
})

describe('useBodyScrollLock', () => {
  it('locks body overflow when a single modal mounts', () => {
    const { unmount } = renderHook(() => useBodyScrollLock(true))
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
  })

  it('restores body overflow when the single modal unmounts', () => {
    const { unmount } = renderHook(() => useBodyScrollLock(true))
    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('does not lock when active=false', () => {
    const { unmount } = renderHook(() => useBodyScrollLock(false))
    expect(document.body.style.overflow).toBe('')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps body locked when first of two modals unmounts (reference count > 0)', () => {
    const first = renderHook(() => useBodyScrollLock(true))
    const second = renderHook(() => useBodyScrollLock(true))

    expect(document.body.style.overflow).toBe('hidden')

    // Unmount first — second still mounted, must stay locked
    first.unmount()
    expect(document.body.style.overflow).toBe('hidden')

    // Unmount second — now the last one gone, must unlock
    second.unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('unlocks body only after the last modal unmounts', () => {
    const first = renderHook(() => useBodyScrollLock(true))
    const second = renderHook(() => useBodyScrollLock(true))
    const third = renderHook(() => useBodyScrollLock(true))

    first.unmount()
    expect(document.body.style.overflow).toBe('hidden')

    second.unmount()
    expect(document.body.style.overflow).toBe('hidden')

    third.unmount()
    expect(document.body.style.overflow).toBe('')
  })
})

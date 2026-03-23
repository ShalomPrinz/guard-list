import { useEffect } from 'react'

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const original = document.body.style.overflow
    const scrollY = window.scrollY
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
      window.scrollTo({ top: scrollY, behavior: 'instant' })
    }
  }, [active])
}

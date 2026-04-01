import { useEffect } from 'react'

let _lockCount = 0
let _savedScrollY = 0

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    if (_lockCount === 0) {
      _savedScrollY = window.scrollY
      window.scrollTo({ top: 0, behavior: 'instant' })
      document.body.style.overflow = 'hidden'
    }
    _lockCount++
    return () => {
      _lockCount--
      if (_lockCount === 0) {
        document.body.style.overflow = ''
        window.scrollTo({ top: _savedScrollY, behavior: 'instant' })
      }
    }
  }, [active])
}

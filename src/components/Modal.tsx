import type { ReactNode } from 'react'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

interface Props {
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: string
}

export default function Modal({ onClose, title, children, maxWidth = 'max-w-lg' }: Props) {
  useBodyScrollLock(true)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-4 bg-black/40 dark:bg-black/60"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`relative w-full ${maxWidth} rounded-2xl bg-white dark:bg-gray-900 max-h-[90vh] overflow-y-auto px-6 pb-8 pt-6`}>
        <button
          onClick={onClose}
          className="absolute top-3 left-3 flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold text-gray-500 active:bg-gray-100 dark:text-gray-400 dark:active:bg-gray-700"
          aria-label="סגור"
        >
          ×
        </button>
        {title && (
          <h2 className="mb-5 text-base font-bold text-gray-900 dark:text-gray-100">{title}</h2>
        )}
        {children}
      </div>
    </div>
  )
}

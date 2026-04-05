import Modal from './Modal'

interface Props {
  message: string
  confirmLabel?: string
  confirmVariant?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ message, confirmLabel = 'מחיקה', confirmVariant = 'danger', onConfirm, onCancel }: Props) {
  const confirmClass =
    confirmVariant === 'primary'
      ? 'bg-blue-600 active:bg-blue-700 dark:bg-blue-500 dark:active:bg-blue-600'
      : 'bg-red-600 active:bg-red-700'

  return (
    <Modal onClose={onCancel}>
      <p className="mb-6 text-sm text-gray-700 dark:text-gray-300">{message}</p>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="min-h-[44px] flex-1 rounded-2xl border border-gray-300 text-sm font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
        >
          ביטול
        </button>
        <button
          onClick={onConfirm}
          className={`min-h-[44px] flex-1 rounded-2xl text-sm font-semibold text-white ${confirmClass}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

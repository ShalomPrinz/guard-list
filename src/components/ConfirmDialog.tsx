import Modal from './Modal'

interface Props {
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ message, confirmLabel = 'מחיקה', onConfirm, onCancel }: Props) {
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
          className="min-h-[44px] flex-1 rounded-2xl bg-red-600 text-sm font-semibold text-white active:bg-red-700"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

interface Props {
  status: 'base' | 'home'
  onChange: (status: 'base' | 'home') => void
}

export default function AvailabilityToggle({ status, onChange }: Props) {
  return (
    <button
      onClick={() => onChange(status === 'base' ? 'home' : 'base')}
      className={`min-h-[36px] shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${
        status === 'base'
          ? 'bg-green-700 text-green-100'
          : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
      }`}
    >
      {status === 'base' ? 'בסיס' : 'בית'}
    </button>
  )
}

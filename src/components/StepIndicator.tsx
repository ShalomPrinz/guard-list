interface Props {
  current: number
  total: number
}

export default function StepIndicator({ current, total }: Props) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-200 ${
              i + 1 < current
                ? 'w-5 bg-blue-500'
                : i + 1 === current
                  ? 'w-8 bg-blue-400'
                  : 'w-5 bg-gray-300 dark:bg-gray-600'
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400">שלב {current} מתוך {total}</span>
    </div>
  )
}

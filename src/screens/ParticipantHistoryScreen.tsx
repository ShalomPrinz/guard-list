import { useParams, useNavigate } from 'react-router-dom'
import { getStatistics } from '../storage/statistics'
import { formatDate } from '../logic/formatting'

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} דק׳`
  if (m === 0) return `${h} ש׳`
  return `${h} ש׳ ${m} דק׳`
}

export default function ParticipantHistoryScreen() {
  const { participantName } = useParams<{ participantName: string }>()
  const navigate = useNavigate()

  const name = participantName ? decodeURIComponent(participantName) : ''
  const stats = getStatistics()
  const participant = name ? stats.participants[name] : undefined

  const history = participant
    ? [...participant.history].sort((a, b) => {
        // Sort by date desc, then startTime desc
        if (b.date !== a.date) return b.date.localeCompare(a.date)
        return b.startTime.localeCompare(a.startTime)
      })
    : []

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate('/statistics')}
          className="min-h-[44px] px-1 text-sm text-gray-500 dark:text-gray-400 active:text-gray-700 dark:active:text-gray-200"
        >
          ←
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{name}</h1>
          {participant && (
            <p className="text-xs text-gray-500">
              {participant.totalShifts} משמרות · {formatDuration(participant.totalMinutes)}
            </p>
          )}
        </div>
      </div>

      {!participant || history.length === 0 ? (
        <p className="text-center text-sm text-gray-500">אין היסטוריה למשתתף זה.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {history.map((record, i) => (
            <div key={i} className="rounded-2xl bg-white dark:bg-gray-800 px-4 py-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{formatDate(record.date)}</span>
                <span className="text-xs text-gray-500">{record.stationName}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-sm text-gray-900 dark:text-gray-100">
                  {record.startTime} – {record.endTime}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{formatDuration(record.durationMinutes)}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-600">{record.scheduleName}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

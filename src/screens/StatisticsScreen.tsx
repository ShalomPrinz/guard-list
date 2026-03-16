import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStatistics, resetStatistics } from '../storage/statistics'
import ConfirmDialog from '../components/ConfirmDialog'

function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}′`
  if (m === 0) return `${h}ש׳`
  return `${h}ש׳ ${m}′`
}

export default function StatisticsScreen() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(() => getStatistics())
  const [confirmReset, setConfirmReset] = useState(false)

  const rows = Object.entries(stats.participants)
    .map(([name, p]) => ({ name, totalShifts: p.totalShifts, totalMinutes: p.totalMinutes }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes)

  function handleReset() {
    resetStatistics()
    setStats(getStatistics())
    setConfirmReset(false)
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="text-sm text-gray-400 active:text-gray-200"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-gray-100">סטטיסטיקות</h1>
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-sm text-gray-500">אין נתונים עדיין. צור לוח שמירה כדי לצבור סטטיסטיקות.</p>
      ) : (
        <div className="mb-6 overflow-hidden rounded-2xl bg-gray-800">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-gray-700 px-4 py-2.5 text-xs font-semibold text-gray-400">
            <span>שם</span>
            <span className="text-center">משמרות</span>
            <span className="text-center">זמן שמירה</span>
            <span />
          </div>

          {/* Rows */}
          {rows.map((row, i) => (
            <div
              key={row.name}
              className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 px-4 py-3 text-sm ${
                i < rows.length - 1 ? 'border-b border-gray-700/50' : ''
              }`}
            >
              <span className="truncate font-medium text-gray-100">{row.name}</span>
              <span className="w-10 text-center tabular-nums text-gray-300">{row.totalShifts}</span>
              <span className="w-16 text-center tabular-nums text-gray-300">{formatDuration(row.totalMinutes)}</span>
              <button
                onClick={() => navigate(`/statistics/${encodeURIComponent(row.name)}`)}
                className="rounded-lg bg-gray-700 px-2.5 py-1 text-xs text-gray-300 active:bg-gray-600"
              >
                היסטוריה
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setConfirmReset(true)}
        className="w-full rounded-2xl border border-red-800 py-3 text-sm font-medium text-red-400 active:bg-red-900/20"
      >
        איפוס כל הסטטיסטיקות
      </button>

      {confirmReset && (
        <ConfirmDialog
          message="למחוק את כל הסטטיסטיקות?"
          onConfirm={handleReset}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  )
}

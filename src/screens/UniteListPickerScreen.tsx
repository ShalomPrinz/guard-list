import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSchedules } from '../storage/schedules'
import { formatDate } from '../logic/formatting'

export default function UniteListPickerScreen() {
  const { scheduleId } = useParams<{ scheduleId: string }>()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  const allSchedules = getSchedules()
  const others = allSchedules
    .filter(s => s.id !== scheduleId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const filtered = search.trim()
    ? others.filter(s => s.name.includes(search.trim()))
    : others

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 min-h-[44px] text-sm text-gray-500 dark:text-gray-400 active:text-gray-700 dark:active:text-gray-200"
      >
        ← חזרה
      </button>

      <h1 className="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">בחר רשימה לאיחוד</h1>

      <input
        type="text"
        placeholder="חיפוש לפי שם סבב..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="mb-4 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">לא נמצאו רשימות.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(s => (
            <button
              key={s.id}
              onClick={() => navigate(`/schedule/${scheduleId}/unite/${s.id}`)}
              className="rounded-2xl bg-white p-4 text-right active:bg-gray-50 dark:bg-gray-800 dark:active:bg-gray-700"
            >
              <p className="font-semibold text-gray-900 dark:text-gray-100">{s.name}</p>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                {formatDate(s.date)} · {s.stations.length} עמדות
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

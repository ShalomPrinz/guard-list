import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getScheduleById } from '../storage/schedules'
import { uniteSchedules, formatUnifiedScheduleForWhatsApp } from '../logic/continueRound'

export default function UniteScreen() {
  const { scheduleId, targetScheduleId } = useParams<{ scheduleId: string; targetScheduleId: string }>()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  const scheduleA = scheduleId ? getScheduleById(scheduleId) : undefined
  const scheduleB = targetScheduleId ? getScheduleById(targetScheduleId) : undefined

  if (!scheduleA || !scheduleB) {
    return (
      <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
        <p className="text-gray-500 dark:text-gray-400">לוח שמירה לא נמצא.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 rounded-2xl border border-gray-300 px-4 py-2.5 text-sm text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
        >
          ← חזרה לדף הבית
        </button>
      </div>
    )
  }

  // Title and citation always come from the earlier schedule (lower createdAt)
  const earlier = scheduleA.createdAt <= scheduleB.createdAt ? scheduleA : scheduleB
  const later = scheduleA.createdAt <= scheduleB.createdAt ? scheduleB : scheduleA

  const unified = uniteSchedules(earlier, later)
  const whatsappText = formatUnifiedScheduleForWhatsApp(unified)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(whatsappText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // clipboard not available
    }
  }

  function handleWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(whatsappText)}`, '_blank')
  }

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
      {/* Back button */}
      <button
        onClick={() => navigate(`/schedule/${scheduleId}/result`)}
        className="mb-4 min-h-[44px] text-sm text-gray-500 dark:text-gray-400 active:text-gray-700 dark:active:text-gray-200"
      >
        ← חזרה
      </button>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">🔒 {unified.name}</h1>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">רשימה מאוחדת</p>
      </div>

      {/* Schedule per station */}
      <div className="mb-6 flex flex-col gap-4">
        {unified.stations.map(st => (
          <div key={st.stationName} className="rounded-2xl bg-white p-4 dark:bg-gray-800">
            <p className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">📍 {st.stationName}</p>

            {st.participants.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {st.participants.map((p, i) => (
                  <div key={i} className="flex items-baseline gap-3">
                    <span className="w-11 shrink-0 font-mono text-sm text-gray-500 dark:text-gray-400">{p.startTime}</span>
                    <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{p.name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{p.durationMinutes}′</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">אין משתתפים</p>
            )}
          </div>
        ))}
      </div>

      {/* Quote */}
      {unified.quote && (
        <div className="mb-6 rounded-2xl bg-white p-4 text-center dark:bg-gray-800">
          <p className="text-sm italic text-gray-700 dark:text-gray-300">"{unified.quote}"</p>
          {unified.quoteAuthor && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">— {unified.quoteAuthor}</p>
          )}
        </div>
      )}

      {/* WhatsApp buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleCopy}
          className={`flex-1 rounded-2xl py-3 text-sm font-semibold transition-colors ${
            copied ? 'bg-green-700 text-white' : 'bg-gray-200 text-gray-900 active:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:active:bg-gray-600'
          }`}
        >
          {copied ? '✓ הועתק!' : '📋 העתק לוואצאפ'}
        </button>
        <button
          onClick={handleWhatsApp}
          className="flex-1 rounded-2xl bg-green-600 py-3 text-sm font-semibold text-white active:bg-green-700"
        >
          📤 שלח בוואצאפ
        </button>
      </div>
    </div>
  )
}

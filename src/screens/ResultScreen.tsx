import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getScheduleById, updateScheduleName } from '../storage/schedules'
import { formatScheduleForWhatsApp } from '../logic/generateSchedule'

export default function ResultScreen() {
  const { scheduleId } = useParams<{ scheduleId: string }>()
  const navigate = useNavigate()

  const schedule = scheduleId ? getScheduleById(scheduleId) : undefined

  const [name, setName] = useState(schedule?.name ?? '')
  const [editingName, setEditingName] = useState(false)
  const [copied, setCopied] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  if (!schedule) {
    return (
      <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
        <p className="text-gray-400">לוח שמירה לא נמצא.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 rounded-2xl border border-gray-600 px-4 py-2.5 text-sm text-gray-300 active:bg-gray-800"
        >
          ← חזרה לדף הבית
        </button>
      </div>
    )
  }

  // Build WhatsApp text using current (possibly edited) name
  const displaySchedule = { ...schedule, name }
  const whatsappText = formatScheduleForWhatsApp(displaySchedule)

  function commitName() {
    if (!schedule) return
    const trimmed = name.trim() || schedule.name
    setName(trimmed)
    setEditingName(false)
    if (trimmed !== schedule.name) {
      updateScheduleName(schedule.id, trimmed)
    }
  }

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
      {/* Header — inline-editable round name */}
      <div className="mb-6">
        {editingName ? (
          <input
            ref={nameInputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setName(schedule.name); setEditingName(false) } }}
            autoFocus
            className="w-full rounded-xl bg-gray-700 px-3 py-1.5 text-xl font-bold text-gray-100 outline-none ring-2 ring-blue-500"
          />
        ) : (
          <button
            onClick={() => { setEditingName(true); setTimeout(() => nameInputRef.current?.select(), 0) }}
            className="text-right text-xl font-bold text-gray-100 underline-offset-2 hover:underline"
            title="לחץ לשינוי שם"
          >
            🔒 {name}
          </button>
        )}
        <p className="mt-1 text-xs text-gray-500">{schedule.date}</p>
      </div>

      {/* Schedule per station */}
      <div className="mb-6 flex flex-col gap-4">
        {schedule.stations.map(st => (
          <div key={st.stationConfigId} className="rounded-2xl bg-gray-800 p-4">
            <p className="mb-3 text-sm font-semibold text-gray-200">📍 {st.stationName}</p>

            {st.stationType === 'time-based' ? (
              st.participants.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {st.participants.map((p, i) => (
                    <div key={i} className="flex items-baseline gap-3">
                      <span className="w-11 shrink-0 font-mono text-sm text-gray-400">{p.startTime}</span>
                      <span className="flex-1 text-sm text-gray-100">{p.name}</span>
                      <span className="text-xs text-gray-500">{p.durationMinutes}′</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500">אין משתתפים</p>
              )
            ) : (
              <div className="flex flex-col gap-1">
                {(st.headcountParticipants ?? []).map((n, i) => (
                  <div key={i} className="text-sm text-gray-100">{n}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Quote */}
      {schedule.quote && (
        <div className="mb-6 rounded-2xl bg-gray-800 p-4 text-center">
          <p className="text-sm italic text-gray-300">"{schedule.quote}"</p>
          {schedule.quoteAuthor && (
            <p className="mt-1 text-xs text-gray-500">— {schedule.quoteAuthor}</p>
          )}
        </div>
      )}

      {/* WhatsApp buttons */}
      <div className="mb-3 flex gap-3">
        <button
          onClick={handleCopy}
          className={`flex-1 rounded-2xl py-3 text-sm font-semibold transition-colors ${
            copied ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-100 active:bg-gray-600'
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

      {/* Continue round */}
      <button
        onClick={() => navigate(`/schedule/${schedule.id}/continue`)}
        className="mb-3 w-full rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700"
      >
        ↩ המשך סבב
      </button>

      <button
        onClick={() => navigate('/')}
        className="w-full rounded-2xl border border-gray-600 py-3 text-sm text-gray-300 active:bg-gray-800"
      >
        ← חזרה לדף הבית
      </button>
    </div>
  )
}

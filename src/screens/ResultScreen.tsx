import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getScheduleById } from '../storage/schedules'
import { formatScheduleForWhatsApp } from '../logic/generateSchedule'
import { useWizard, DEFAULT_TIME_CONFIG } from '../context/WizardContext'

export default function ResultScreen() {
  const { scheduleId } = useParams<{ scheduleId: string }>()
  const navigate = useNavigate()
  const { initSession } = useWizard()

  const schedule = scheduleId ? getScheduleById(scheduleId) : undefined

  const [copied, setCopied] = useState(false)

  if (!schedule) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
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

  const whatsappText = formatScheduleForWhatsApp(schedule)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(whatsappText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // fallback: select from textarea
    }
  }

  function handleWhatsApp() {
    const encoded = encodeURIComponent(whatsappText)
    window.open(`https://wa.me/?text=${encoded}`, '_blank')
  }

  function handleContinueRound() {
    if (!schedule) return
    initSession({
      mode: 'continue',
      groupId: schedule.groupId,
      groupName: schedule.name,
      parentScheduleId: schedule.id,
      stations: schedule.stations.map(st => ({
        config: {
          id: st.stationConfigId,
          name: st.stationName,
          type: st.stationType,
        },
        participants: st.stationType === 'time-based'
          ? st.participants.map(p => ({ name: p.name, locked: false, skipped: false }))
          : [],
        headcountParticipants: st.headcountParticipants ?? [],
      })),
      timeConfig: { ...DEFAULT_TIME_CONFIG },
      scheduleName: '',
      date: schedule.date,
    })
    navigate('/schedule/new/step1')
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-100">{schedule.name}</h1>
        <p className="text-xs text-gray-500">{schedule.date}</p>
      </div>

      {/* Schedule preview */}
      <div className="mb-6 flex flex-col gap-4">
        {schedule.stations.map(st => (
          <div key={st.stationConfigId} className="rounded-2xl bg-gray-800 p-4">
            <p className="mb-3 text-sm font-semibold text-gray-200">📍 {st.stationName}</p>

            {st.stationType === 'time-based' ? (
              st.participants.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {st.participants.map((p, i) => (
                    <div key={i} className="flex items-baseline gap-3 text-sm">
                      <span className="w-12 shrink-0 font-mono text-gray-400">{p.startTime}</span>
                      <span className="text-gray-100">{p.name}</span>
                      <span className="text-xs text-gray-500">{p.durationMinutes}′</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500">אין משתתפים</p>
              )
            ) : (
              <div className="flex flex-col gap-1">
                {(st.headcountParticipants ?? []).map((name, i) => (
                  <div key={i} className="text-sm text-gray-100">{name}</div>
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

      {/* Action buttons */}
      <div className="mb-3 flex gap-3">
        <button
          onClick={handleCopy}
          className={`flex-1 rounded-2xl py-3 text-sm font-semibold transition-colors ${
            copied
              ? 'bg-green-700 text-white'
              : 'bg-gray-700 text-gray-100 active:bg-gray-600'
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

      <button
        onClick={handleContinueRound}
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

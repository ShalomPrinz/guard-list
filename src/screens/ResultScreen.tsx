import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getScheduleById, updateScheduleName, updateScheduleCustomText } from '../storage/schedules'
import { getGroupById } from '../storage/groups'
import { getStationsConfig } from '../storage/stationsConfig'
import { formatScheduleForWhatsApp } from '../logic/generateSchedule'
import { formatDate } from '../logic/formatting'
import { useWizard, DEFAULT_TIME_CONFIG } from '../context/WizardContext'
import { useShortListWizard } from '../context/ShortListWizardContext'
import Modal from '../components/Modal'
import type { WizardSession, Schedule, ShortListWizardSession, StationConfig } from '../types'

function buildSessionFromSchedule(schedule: Schedule): WizardSession {
  const group = getGroupById(schedule.groupId)
  const firstParticipant = schedule.stations[0]?.participants[0]
  const startTime = firstParticipant?.startTime ?? DEFAULT_TIME_CONFIG.startTime
  const fixedDurationMinutes = firstParticipant?.durationMinutes
  return {
    mode: 'new',
    groupId: schedule.groupId,
    groupName: group?.name ?? schedule.name,
    stations: schedule.stations.map(st => ({
      config: { id: st.stationConfigId, name: st.stationName, type: 'time-based' as const },
      participants: st.participants.map(p => ({ name: p.name })),
      startTime: st.participants[0]?.startTime ?? startTime,
      startDate: st.participants[0]?.date ?? schedule.date,
    })),
    timeConfig: { ...DEFAULT_TIME_CONFIG, startTime, fixedDurationMinutes, unevenMode: schedule.unevenDistributionMode },
    scheduleName: schedule.name,
    date: schedule.date,
    createdScheduleId: schedule.id,
    quote: schedule.quote,
    quoteAuthor: schedule.quoteAuthor,
  }
}

function buildShortListSessionFromSchedule(schedule: Schedule): ShortListWizardSession | null {
  if (!schedule.createdFromShortList) return null

  // Reconstruct stations from schedule
  const stationIds = schedule.stations.map(st => st.stationConfigId)
  const allConfigs = getStationsConfig()
  const stations: StationConfig[] = stationIds
    .map(id => allConfigs.find(cfg => cfg.id === id))
    .filter((cfg): cfg is StationConfig => cfg !== undefined)

  if (stations.length === 0) return null

  // Reconstruct startHour and startMinute from first participant
  const firstParticipant = schedule.stations[0]?.participants[0]
  const startTimeParts = firstParticipant?.startTime.split(':') ?? ['14', '0']
  const startHour = parseInt(startTimeParts[0] ?? '14', 10)
  const startMinute = parseInt(startTimeParts[1] ?? '0', 10)

  // Reconstruct minutesPerWarrior from first participant's duration
  const minutesPerWarrior = firstParticipant?.durationMinutes ?? 60

  // Reconstruct numberOfWarriors (per station)
  const numberOfWarriors = schedule.stations.length > 0
    ? Math.ceil(schedule.stations[0].participants.length)
    : 1

  return {
    groupId: schedule.groupId,
    stations,
    startHour,
    startMinute,
    minutesPerWarrior,
    numberOfWarriors,
    name: schedule.name,
  }
}

export default function ResultScreen() {
  const { scheduleId } = useParams<{ scheduleId: string }>()
  const navigate = useNavigate()
  const { session, initSession } = useWizard()
  const { session: shortListSession, setSession: setShortListSession } = useShortListWizard()

  const [schedule, setSchedule] = useState<Schedule | undefined>(() =>
    scheduleId ? getScheduleById(scheduleId) : undefined
  )
  const [name, setName] = useState(schedule?.name ?? '')
  const [editingName, setEditingName] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showUniteModal, setShowUniteModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editDraft, setEditDraft] = useState('')
  const [showBackGuardModal, setShowBackGuardModal] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  function refresh() {
    if (scheduleId) setSchedule(getScheduleById(scheduleId))
  }

  if (!schedule) {
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

  // Build WhatsApp text using current (possibly edited) name
  const displaySchedule = { ...schedule, name }
  const whatsappText = formatScheduleForWhatsApp(displaySchedule)
  const displayedText = schedule.customWhatsAppText ?? whatsappText

  function commitName() {
    if (!schedule) return
    const trimmed = name.trim() || schedule.name
    setName(trimmed)
    setEditingName(false)
    if (trimmed !== schedule.name) {
      updateScheduleName(schedule.id, trimmed)
    }
  }

  function handleAcceptEdit() {
    if (!schedule) return
    updateScheduleCustomText(schedule.id, editDraft)
    setIsEditing(false)
    refresh()
  }

  function handleCancelEdit() {
    setIsEditing(false)
  }

  function handleRevertToOriginal() {
    if (!schedule) return
    updateScheduleCustomText(schedule.id, undefined)
    refresh()
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(displayedText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // clipboard not available
    }
  }

  function handleWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(displayedText)}`, '_blank')
  }

  function handleBack() {
    if (!schedule) return
    if (schedule.customWhatsAppText) {
      setShowBackGuardModal(true)
      return
    }
    doBack()
  }

  function doBack() {
    if (!schedule) return
    if (shortListSession || schedule.createdFromShortList) {
      if (!shortListSession) {
        const shortListSess = buildShortListSessionFromSchedule(schedule)
        if (shortListSess) {
          setShortListSession(shortListSess)
        }
      }
      navigate('/short-list/step2')
    } else {
      if (!session) initSession(buildSessionFromSchedule(schedule))
      navigate('/schedule/new/step4')
    }
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
            className="w-full rounded-xl bg-gray-200 px-3 py-1.5 text-xl font-bold text-gray-900 outline-none ring-2 ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
          />
        ) : (
          <button
            onClick={() => { setEditingName(true); setTimeout(() => nameInputRef.current?.select(), 0) }}
            className="text-right text-xl font-bold text-gray-900 underline-offset-2 hover:underline dark:text-gray-100"
            title="לחץ לשינוי שם"
          >
            🔒 {name}
          </button>
        )}
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{formatDate(schedule.date)}</p>
      </div>

      {/* WhatsApp preview */}
      <div className="mb-4">
        <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">תצוגה מקדימה - כך זה ייראה בווטסאפ</p>
        <div className="relative">
          {!isEditing && (
            <button
              onClick={() => { setEditDraft(displayedText); setIsEditing(true) }}
              aria-label="ערוך טקסט"
              className="absolute top-2 left-2 z-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-gray-200/80 text-lg active:bg-gray-300 dark:bg-gray-700/80 dark:active:bg-gray-600"
            >
              ✏️
            </button>
          )}
          {isEditing ? (
            <textarea
              value={editDraft}
              onChange={e => setEditDraft(e.target.value)}
              dir="rtl"
              className="w-full whitespace-pre-wrap break-words rounded-2xl bg-gray-100 p-4 text-sm font-sans text-gray-800 dark:bg-gray-800/80 dark:text-gray-200 min-h-[200px] outline-none ring-2 ring-blue-500 resize-none"
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words rounded-2xl bg-gray-100 p-4 text-sm font-sans text-gray-800 dark:bg-gray-800/80 dark:text-gray-200" dir="rtl">
              {displayedText}
            </pre>
          )}
        </div>

        {/* Edit action buttons */}
        {isEditing && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleAcceptEdit}
              className="flex-1 min-h-[44px] rounded-2xl bg-green-600 py-2.5 text-sm font-semibold text-white active:bg-green-700"
            >
              אשר
            </button>
            <button
              onClick={handleCancelEdit}
              className="flex-1 min-h-[44px] rounded-2xl border border-gray-300 py-2.5 text-sm text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
            >
              בטל
            </button>
          </div>
        )}

        {/* Revert to original button */}
        {!isEditing && schedule.customWhatsAppText && (
          <button
            onClick={handleRevertToOriginal}
            className="mt-2 min-h-[44px] w-full rounded-2xl border border-gray-300 py-2.5 text-sm text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
          >
            ↩ חזור לטקסט המקורי
          </button>
        )}
      </div>

      {/* WhatsApp buttons */}
      <div className="mb-3 flex gap-3">
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

      {/* Unite lists — available on every schedule */}
      <button
        onClick={() => {
          if (schedule.parentScheduleId) {
            setShowUniteModal(true)
          } else {
            navigate(`/schedule/${schedule.id}/unite-picker`)
          }
        }}
        className="mb-3 w-full rounded-2xl bg-purple-600 py-3 text-sm font-semibold text-white active:bg-purple-700"
      >
        🔗 איחוד רשימות
      </button>

      {/* Modal — continued round union target selection */}
      {showUniteModal && (
        <Modal onClose={() => setShowUniteModal(false)} title="בחר רשימה לאיחוד">
            <button
              onClick={() => {
                setShowUniteModal(false)
                navigate(`/schedule/${schedule.id}/unite/${schedule.parentScheduleId}`)
              }}
              className="mb-2 min-h-[44px] w-full rounded-2xl bg-purple-600 py-3 text-sm font-semibold text-white active:bg-purple-700"
            >
              איחוד עם הרשימה הקודמת
            </button>
            <button
              onClick={() => {
                setShowUniteModal(false)
                navigate(`/schedule/${schedule.id}/unite-picker`)
              }}
              className="mb-2 min-h-[44px] w-full rounded-2xl border border-purple-400 py-3 text-sm font-semibold text-purple-700 active:bg-purple-50 dark:border-purple-500 dark:text-purple-400 dark:active:bg-purple-900/20"
            >
              איחוד עם רשימה אחרת
            </button>
            <button
              onClick={() => setShowUniteModal(false)}
              className="min-h-[44px] w-full rounded-2xl py-3 text-sm text-gray-500 dark:text-gray-400"
            >
              ביטול
            </button>
        </Modal>
      )}

      {/* Continue round */}
      <button
        onClick={() => navigate(`/schedule/${schedule.id}/continue`)}
        className="mb-3 w-full rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700"
      >
        ↩ המשך סבב
      </button>

      {/* Back — navigates based on how the schedule was created */}
      <button
        onClick={handleBack}
        className="w-full rounded-2xl border border-gray-300 py-3 text-sm text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
      >
        ← חזרה לעריכה
      </button>

      {/* Back guard modal — shown when custom text exists */}
      {showBackGuardModal && (
        <Modal onClose={() => setShowBackGuardModal(false)} title="עריכת רשימה שנערכה ידנית">
          <p className="mb-4 text-sm text-gray-700 dark:text-gray-300">
            ערכת את הרשימה ידנית ולא ניתן להשתמש בגרסה זו לעריכת הרשימה. מה אתה מעדיף?
          </p>
          <button
            onClick={() => setShowBackGuardModal(false)}
            className="mb-2 min-h-[44px] w-full rounded-2xl border border-gray-300 py-2.5 text-sm text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
          >
            אני רוצה להישאר עם הטקסט שערכתי
          </button>
          <button
            onClick={() => {
              updateScheduleCustomText(schedule.id, undefined)
              setShowBackGuardModal(false)
              doBack()
            }}
            className="min-h-[44px] w-full rounded-2xl bg-red-600 py-2.5 text-sm font-semibold text-white active:bg-red-700"
          >
            מעדיף למחוק את השינויים שלי ולערוך את הרשימה
          </button>
        </Modal>
      )}
    </div>
  )
}

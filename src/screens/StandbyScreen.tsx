import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGroups } from '../storage/groups'
import type { Group, Member } from '../types'
import AvailabilityToggle from '../components/AvailabilityToggle'
import TimePicker from '../components/TimePicker'

export function formatStandbyText(
  title: string,
  selectedNames: string[],
  commanderName?: string,
  note?: string,
  freetextBody?: string,
): string {
  const boldTitle = `*${title}*`
  const titleLine = note ? `${boldTitle} - ${note}` : boldTitle
  const parts: string[] = [titleLine, '']
  if (freetextBody) {
    parts.push(`> ${freetextBody}`, '')
  }
  if (commanderName) {
    parts.push(`מפקד: ${commanderName}`, '')
  }
  parts.push(...selectedNames.map((name, i) => `${i + 1}. ${name}`))
  return parts.join('\n')
}

export default function StandbyScreen() {
  const navigate = useNavigate()
  const [groups] = useState<Group[]>(() => getGroups())
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => getGroups()[0]?.id ?? '')
  const [title, setTitle] = useState('כיתת כוננות')
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [selectedCommanderId, setSelectedCommanderId] = useState<string | null>(null)
  // Session-only availability overrides — does NOT modify saved group in localStorage
  const [localAvailabilityById, setLocalAvailabilityById] = useState<Record<string, 'base' | 'home'>>({})
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editDraft, setEditDraft] = useState('')
  const [customText, setCustomText] = useState<string | undefined>(undefined)

  // Note state — session-only
  const [noteEnabled, setNoteEnabled] = useState(true)
  const [noteMode, setNoteMode] = useState<'time' | 'freetext'>('time')
  const [noteTime, setNoteTime] = useState('22:00')
  const [noteText, setNoteText] = useState('')

  const group = groups.find(g => g.id === selectedGroupId)

  function getMemberAvailability(member: Member): 'base' | 'home' {
    return localAvailabilityById[member.id] ?? member.availability
  }

  const allMembers: Member[] = [...(group?.members ?? [])]
  const commanders = allMembers.filter(m => (m.role ?? 'warrior') === 'commander')
  const warriors = allMembers.filter(m => (m.role ?? 'warrior') === 'warrior')
  const baseWarriors = warriors.filter(m => getMemberAvailability(m) === 'base')

  // Initialize selected names and reset overrides when group changes
  // groups is immutable after init, so only selectedGroupId is reactive
  useEffect(() => {
    setLocalAvailabilityById({})
    setSelectedCommanderId(null)
    const currentGroup = groups.find(g => g.id === selectedGroupId)
    const baseWarriorNames = (currentGroup?.members ?? [])
      .filter(m => (m.role ?? 'warrior') === 'warrior' && m.availability === 'base')
      .map(m => m.name)
    setSelectedNames(new Set(baseWarriorNames))
  }, [selectedGroupId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleMember(name: string) {
    setSelectedNames(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function selectAll() {
    setSelectedNames(new Set(baseWarriors.map(m => m.name)))
  }

  function deselectAll() {
    setSelectedNames(new Set())
  }

  function handleLocalAvailabilityToggle(memberId: string, newStatus: 'base' | 'home') {
    setLocalAvailabilityById(prev => ({ ...prev, [memberId]: newStatus }))
    const member = allMembers.find(m => m.id === memberId)
    if (!member) return
    if (newStatus === 'home') {
      // Deselect warrior checkbox
      setSelectedNames(prev => {
        const next = new Set(prev)
        next.delete(member.name)
        return next
      })
      // Deselect commander if they become home
      if (selectedCommanderId === memberId) {
        setSelectedCommanderId(null)
      }
    }
  }

  const allWarriorsSelected = baseWarriors.length > 0 && baseWarriors.every(m => selectedNames.has(m.name))

  // Ordered list of selected warriors (group member order)
  const orderedSelectedWarriors = allMembers
    .filter(m => (m.role ?? 'warrior') === 'warrior' && getMemberAvailability(m) === 'base' && selectedNames.has(m.name))
    .map(m => m.name)

  const commanderName = selectedCommanderId
    ? allMembers.find(m => m.id === selectedCommanderId)?.name
    : undefined

  const timeNote = noteEnabled && noteMode === 'time' ? `החל מהשעה ${noteTime}` : undefined
  const freetextBody = noteEnabled && noteMode === 'freetext' && noteText ? noteText : undefined

  const whatsappText = formatStandbyText(title, orderedSelectedWarriors, commanderName, timeNote, freetextBody)
  const hasOutput = orderedSelectedWarriors.length > 0 || !!commanderName
  const displayedText = customText ?? whatsappText

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

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
      {/* Group selector — only shown when multiple groups exist */}
      {groups.length > 1 && (
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            קבוצה
          </label>
          <select
            value={selectedGroupId}
            onChange={e => setSelectedGroupId(e.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            {groups.map(g => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Group subtitle */}
      {group && groups.length === 1 && (
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{group.name}</p>
      )}

      {/* Title input */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          כותרת
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>

      {/* Note section */}
      <div className="mb-4 rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-800/60">
        {/* Enable toggle */}
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={noteEnabled}
            onChange={e => setNoteEnabled(e.target.checked)}
            className="h-5 w-5 rounded accent-blue-600"
          />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">הוסף הערה</span>
        </label>

        {noteEnabled && (
          <div className="mt-3 flex flex-col gap-3">
            {/* Mode selector */}
            <div className="flex gap-2">
              <button
                onClick={() => setNoteMode('time')}
                className={`min-h-[44px] flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  noteMode === 'time'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 active:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:active:bg-gray-600'
                }`}
              >
                שעת התחלה
              </button>
              <button
                onClick={() => setNoteMode('freetext')}
                className={`min-h-[44px] flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  noteMode === 'freetext'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 active:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:active:bg-gray-600'
                }`}
              >
                טקסט חופשי
              </button>
            </div>

            {/* Time picker */}
            {noteMode === 'time' && (
              <TimePicker value={noteTime} onChange={setNoteTime} />
            )}

            {/* Free text input */}
            {noteMode === 'freetext' && (
              <input
                type="text"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="הזן טקסט חופשי..."
                className="min-h-[44px] w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
          </div>
        )}
      </div>

      {/* Commander section — shown only when group has commanders */}
      {commanders.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">מפקד</h3>
          <div className="flex flex-col gap-2">
            {commanders.map(member => {
              const effectiveAvailability = getMemberAvailability(member)
              const isBase = effectiveAvailability === 'base'
              return (
                <div
                  key={member.id}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
                    isBase ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 opacity-50 dark:bg-gray-850'
                  }`}
                >
                  <input
                    type="radio"
                    name="commander-select"
                    checked={selectedCommanderId === member.id}
                    onChange={() => isBase && setSelectedCommanderId(member.id)}
                    disabled={!isBase}
                    className="h-5 w-5 accent-blue-600"
                    aria-label={member.name}
                  />
                  <span className={`flex-1 text-sm ${isBase ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
                    {member.name}
                  </span>
                  <AvailabilityToggle
                    status={effectiveAvailability}
                    onChange={(s) => handleLocalAvailabilityToggle(member.id, s)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Warriors section */}
      <div className="mb-4">
        {commanders.length > 0 && (
          <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">לוחמים</h3>
        )}

        {/* Select all / Deselect all */}
        {baseWarriors.length > 0 && (
          <div className="mb-3 flex justify-end">
            <button
              onClick={allWarriorsSelected ? deselectAll : selectAll}
              className="min-h-[36px] rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 active:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:active:bg-gray-600"
            >
              {allWarriorsSelected ? 'בטל הכל' : 'בחר הכל'}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {warriors.map(member => {
            const effectiveAvailability = getMemberAvailability(member)
            const isBase = effectiveAvailability === 'base'
            return (
              <div
                key={member.id}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
                  isBase
                    ? 'bg-white dark:bg-gray-800'
                    : 'bg-gray-50 opacity-50 dark:bg-gray-850'
                }`}
              >
                {isBase ? (
                  <input
                    type="checkbox"
                    checked={selectedNames.has(member.name)}
                    onChange={() => toggleMember(member.name)}
                    className="h-5 w-5 rounded accent-blue-600"
                    aria-label={member.name}
                  />
                ) : (
                  <div className="h-5 w-5 shrink-0" aria-hidden />
                )}
                <span
                  className={`flex-1 text-sm ${
                    isBase
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {member.name}
                </span>
                <AvailabilityToggle
                  status={effectiveAvailability}
                  onChange={(s) => handleLocalAvailabilityToggle(member.id, s)}
                />
              </div>
            )
          })}

          {warriors.length === 0 && commanders.length === 0 && (
            <p className="rounded-2xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
              אין חברים בקבוצה
            </p>
          )}
        </div>
      </div>

      {/* WhatsApp preview */}
      {hasOutput && (
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
              <pre dir="rtl" className="whitespace-pre-wrap break-words rounded-2xl bg-gray-100 p-4 font-sans text-sm text-gray-800 dark:bg-gray-800/80 dark:text-gray-200">
                {displayedText}
              </pre>
            )}
          </div>

          {/* Edit action buttons */}
          {isEditing && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => { setCustomText(editDraft); setIsEditing(false) }}
                className="flex-1 min-h-[44px] rounded-2xl bg-green-600 py-2.5 text-sm font-semibold text-white active:bg-green-700"
              >
                אשר
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 min-h-[44px] rounded-2xl border border-gray-300 py-2.5 text-sm text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
              >
                בטל
              </button>
            </div>
          )}

          {/* Revert to original button */}
          {!isEditing && customText !== undefined && (
            <button
              onClick={() => setCustomText(undefined)}
              className="mt-2 min-h-[44px] w-full rounded-2xl border border-gray-300 py-2.5 text-sm text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
            >
              ↩ חזור לטקסט המקורי
            </button>
          )}
        </div>
      )}

      {/* WhatsApp buttons */}
      <div className="mb-3 flex gap-3">
        <button
          onClick={handleCopy}
          disabled={!hasOutput}
          className={`flex-1 rounded-2xl py-3 text-sm font-semibold transition-colors disabled:opacity-40 ${
            copied
              ? 'bg-green-700 text-white'
              : 'bg-gray-200 text-gray-900 active:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:active:bg-gray-600'
          }`}
        >
          {copied ? '✓ הועתק!' : '📋 העתק לווטסאפ'}
        </button>
        <button
          onClick={handleWhatsApp}
          disabled={!hasOutput}
          className="flex-1 rounded-2xl bg-green-600 py-3 text-sm font-semibold text-white active:bg-green-700 disabled:opacity-40"
        >
          📤 שלח בווטסאפ
        </button>
      </div>

      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="w-full rounded-2xl border border-gray-300 py-3 text-sm text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
      >
        ← חזרה לדף הבית
      </button>
    </div>
  )
}

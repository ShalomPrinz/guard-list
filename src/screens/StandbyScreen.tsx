import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGroups } from '../storage/groups'
import type { Group, Member } from '../types'

export function formatStandbyText(title: string, selectedNames: string[]): string {
  const lines = selectedNames.map((name, i) => `${i + 1}. ${name}`)
  return [title, '', ...lines].join('\n')
}

export default function StandbyScreen() {
  const navigate = useNavigate()
  const [groups] = useState<Group[]>(() => getGroups())
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => getGroups()[0]?.id ?? '')
  const [title, setTitle] = useState('כיתת כוננות')
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

  const group = groups.find(g => g.id === selectedGroupId)
  const baseMembers = group?.members.filter(m => m.availability === 'base') ?? []
  const homeMembers = group?.members.filter(m => m.availability === 'home') ?? []
  const allMembers: Member[] = [...(group?.members ?? [])]

  // Initialize selected names when group changes
  useEffect(() => {
    setSelectedNames(new Set(baseMembers.map(m => m.name)))
  }, [selectedGroupId])

  function toggleMember(name: string) {
    setSelectedNames(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function selectAll() {
    setSelectedNames(new Set(baseMembers.map(m => m.name)))
  }

  function deselectAll() {
    setSelectedNames(new Set())
  }

  const allSelected = baseMembers.length > 0 && baseMembers.every(m => selectedNames.has(m.name))

  // Ordered list of selected members (same order as on screen = group member order, base first)
  const orderedSelected = allMembers
    .filter(m => m.availability === 'base' && selectedNames.has(m.name))
    .map(m => m.name)

  const whatsappText = formatStandbyText(title, orderedSelected)

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

      {/* Select all / Deselect all */}
      {baseMembers.length > 0 && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={allSelected ? deselectAll : selectAll}
            className="min-h-[36px] rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 active:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:active:bg-gray-600"
          >
            {allSelected ? 'בטל הכל' : 'בחר הכל'}
          </button>
        </div>
      )}

      {/* Member list */}
      <div className="mb-6 flex flex-col gap-2">
        {allMembers.map(member => {
          const isBase = member.availability === 'base'
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
              <span
                className={`text-xs ${
                  isBase
                    ? 'text-gray-400 dark:text-gray-500'
                    : 'text-gray-300 dark:text-gray-600'
                }`}
              >
                {isBase ? 'בסיס' : 'בית'}
              </span>
            </div>
          )
        })}

        {allMembers.length === 0 && (
          <p className="rounded-2xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
            אין חברים בקבוצה
          </p>
        )}
      </div>

      {/* WhatsApp buttons */}
      <div className="mb-3 flex gap-3">
        <button
          onClick={handleCopy}
          disabled={orderedSelected.length === 0}
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
          disabled={orderedSelected.length === 0}
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

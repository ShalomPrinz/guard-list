import { useState, useRef } from 'react'
import type { Group, Member } from '../types'
import { upsertGroup } from '../storage/groups'
import { parseNames } from '../logic/parseNames'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

interface Props {
  onCreated: (group: Group) => void
  onCancel: () => void
}

export default function CreateGroupModal({ onCreated, onCancel }: Props) {
  useBodyScrollLock(true)
  const [groupName, setGroupName] = useState('')
  const [namesText, setNamesText] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const parsed = parseNames(namesText)
  const rawCount = namesText.split(/[\n,]/).filter(s => s.trim()).length

  function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      // Take first column of each row (handles standard CSV)
      const firstCols = text
        .split('\n')
        .map(row => row.split(',')[0].replace(/^"|"$/g, '').trim())
        .filter(Boolean)
        .join('\n')
      setNamesText(prev => (prev ? prev + '\n' + firstCols : firstCols))
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleCreate() {
    const name = groupName.trim()
    if (!name) { setError('שם הקבוצה נדרש'); return }
    if (parsed.length === 0) { setError('הוסף לפחות חבר אחד'); return }

    const members: Member[] = parsed.map(n => ({
      id: crypto.randomUUID(),
      name: n,
      availability: 'base',
    }))

    const group: Group = {
      id: crypto.randomUUID(),
      name,
      members,
      createdAt: new Date().toISOString(),
    }

    upsertGroup(group)
    onCreated(group)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 bg-black/60">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onCancel}
          className="absolute top-3 left-3 flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold text-gray-500 active:bg-gray-100 dark:text-gray-400 dark:active:bg-gray-700"
          aria-label="סגור"
        >
          ×
        </button>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">קבוצה חדשה</h2>

        {/* Group name */}
        <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">שם הקבוצה</label>
        <input
          type="text"
          value={groupName}
          onChange={e => { setGroupName(e.target.value); setError('') }}
          placeholder="למשל: מחלקה א'"
          className="mb-4 w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 placeholder-gray-400 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
        />

        {/* Members textarea */}
        <div className="mb-1 flex items-center justify-between">
          <label className="text-sm text-gray-500 dark:text-gray-400">חברים (מופרדים בפסיק או שורה)</label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs text-blue-600 active:text-blue-500 dark:text-blue-400 dark:active:text-blue-300"
          >
            ייבוא CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvImport} />
        </div>
        <textarea
          value={namesText}
          onChange={e => { setNamesText(e.target.value); setError('') }}
          placeholder={'אלי, בוב, ג\'ק\nאו שורה אחת לכל חבר'}
          rows={5}
          className="mb-2 w-full resize-none rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
        />

        {/* Preview */}
        {parsed.length > 0 && (
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            {parsed.length} חברים זוהו
            {parsed.length !== rawCount && ' (כפילויות הוסרו)'}
          </p>
        )}

        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-700"
          >
            ביטול
          </button>
          <button
            onClick={handleCreate}
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white active:bg-blue-700"
          >
            צור
          </button>
        </div>
      </div>
    </div>
  )
}

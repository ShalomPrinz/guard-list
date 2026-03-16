import { useState, useRef } from 'react'
import type { Group, Member } from '../types'
import { upsertGroup } from '../storage/groups'

interface Props {
  onCreated: (group: Group) => void
  onCancel: () => void
}

function parseNames(raw: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  // Split by newline or comma
  raw.split(/[\n,]/).forEach(part => {
    const name = part.trim()
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase())
      result.push(name)
    }
  })
  return result
}

export default function CreateGroupModal({ onCreated, onCancel }: Props) {
  const [groupName, setGroupName] = useState('')
  const [namesText, setNamesText] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const parsed = parseNames(namesText)

  function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      // Take first column of each row (handles proper CSV)
      const firstCols = text
        .split('\n')
        .map(row => row.split(',')[0].replace(/^"|"$/g, '').trim())
        .filter(Boolean)
        .join('\n')
      setNamesText(prev => (prev ? prev + '\n' + firstCols : firstCols))
    }
    reader.readAsText(file)
    // reset so same file can be re-imported
    e.target.value = ''
  }

  function handleCreate() {
    const name = groupName.trim()
    if (!name) { setError('Group name is required'); return }
    if (parsed.length === 0) { setError('Add at least one member'); return }

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="w-full max-w-lg rounded-t-3xl bg-gray-800 p-6 shadow-xl sm:rounded-2xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-100">New Group</h2>

        {/* Group name */}
        <label className="mb-1 block text-sm text-gray-400">Group name</label>
        <input
          type="text"
          value={groupName}
          onChange={e => { setGroupName(e.target.value); setError('') }}
          placeholder="e.g. Platoon A"
          className="mb-4 w-full rounded-xl bg-gray-700 px-4 py-2.5 text-gray-100 placeholder-gray-500 outline-none ring-1 ring-gray-600 focus:ring-blue-500"
        />

        {/* Members textarea */}
        <div className="mb-1 flex items-center justify-between">
          <label className="text-sm text-gray-400">Members (comma or line-separated)</label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs text-blue-400 active:text-blue-300"
          >
            Import CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvImport} />
        </div>
        <textarea
          value={namesText}
          onChange={e => { setNamesText(e.target.value); setError('') }}
          placeholder="Alice, Bob, Charlie&#10;or one per line"
          rows={5}
          className="mb-2 w-full resize-none rounded-xl bg-gray-700 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none ring-1 ring-gray-600 focus:ring-blue-500"
        />

        {/* Preview */}
        {parsed.length > 0 && (
          <p className="mb-3 text-xs text-gray-400">
            {parsed.length} member{parsed.length !== 1 ? 's' : ''} detected
            {parsed.length !== namesText.split(/[\n,]/).filter(s => s.trim()).length && ' (duplicates removed)'}
          </p>
        )}

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-600 py-2.5 text-sm font-medium text-gray-300 active:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white active:bg-blue-700"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

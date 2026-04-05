import { useState } from 'react'
import type { Group } from '../types'
import { upsertGroup } from '../storage/groups'
import Modal from './Modal'

interface Props {
  onCreated: (group: Group) => void
  onCancel: () => void
}

export default function CreateGroupModal({ onCreated, onCancel }: Props) {
  const [groupName, setGroupName] = useState('')
  const [error, setError] = useState('')

  function handleCreate() {
    const name = groupName.trim()
    if (!name) { setError('שם הקבוצה נדרש'); return }

    const group: Group = {
      id: crypto.randomUUID(),
      name,
      members: [],
      createdAt: new Date().toISOString(),
    }

    upsertGroup(group)
    onCreated(group)
  }

  return (
    <Modal onClose={onCancel} title="קבוצה חדשה">
        {/* Group name */}
        <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">שם הקבוצה</label>
        <input
          type="text"
          value={groupName}
          onChange={e => { setGroupName(e.target.value); setError('') }}
          placeholder="למשל: מחלקה א'"
          className="mb-4 w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 placeholder-gray-400 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
        />

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
    </Modal>
  )
}

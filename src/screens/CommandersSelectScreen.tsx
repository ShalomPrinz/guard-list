import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getGroupById, upsertGroup } from '../storage/groups'
import type { Group } from '../types'

export default function CommandersSelectScreen() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const [group, setGroup] = useState<Group | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (!groupId) { setNotFound(true); return }
    const found = getGroupById(groupId)
    if (!found) { setNotFound(true); return }
    setGroup(found)
  }, [groupId])

  function toggleRole(memberId: string) {
    setGroup(prev => {
      if (!prev) return prev
      const updated = {
        ...prev,
        members: prev.members.map(m =>
          m.id === memberId
            ? { ...m, role: (m.role ?? 'warrior') === 'commander' ? 'warrior' as const : 'commander' as const }
            : m
        ),
      }
      upsertGroup(updated)
      return updated
    })
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <p className="text-gray-500 dark:text-gray-400">קבוצה לא נמצאה.</p>
        <button onClick={() => navigate('/')} className="mt-4 text-blue-600 dark:text-blue-400">חזרה</button>
      </div>
    )
  }

  if (!group) return null

  const commanders = group.members.filter(m => (m.role ?? 'warrior') === 'commander')
  const warriors = group.members.filter(m => (m.role ?? 'warrior') === 'warrior')

  function renderMemberRow(memberId: string, memberName: string, isCommander: boolean) {
    return (
      <li
        key={memberId}
        className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-700"
      >
        <input
          type="checkbox"
          checked={isCommander}
          onChange={() => toggleRole(memberId)}
          className="h-5 w-5 rounded accent-blue-600"
          aria-label={memberName}
        />
        <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{memberName}</span>
        <span className={`text-xs ${isCommander ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
          {isCommander ? 'מפקד' : 'לוחם'}
        </span>
      </li>
    )
  }

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate(`/group/${group.id}/edit`)}
          className="min-h-[44px] px-1 text-gray-500 dark:text-gray-400"
          aria-label="חזרה"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">בחר מפקדים</h1>
      </div>

      {/* Commanders section */}
      <div className="mb-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">מפקדים</h3>
        {commanders.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-400 dark:bg-gray-800 dark:text-gray-500">
            לא נבחרו מפקדים
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {commanders.map(m => renderMemberRow(m.id, m.name, true))}
          </ul>
        )}
      </div>

      {/* Warriors section */}
      <div className="mb-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">לוחמים</h3>
        {warriors.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-400 dark:bg-gray-800 dark:text-gray-500">
            אין לוחמים
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {warriors.map(m => renderMemberRow(m.id, m.name, false))}
          </ul>
        )}
      </div>

      {/* Back button */}
      <button
        onClick={() => navigate(`/group/${group.id}/edit`)}
        className="w-full rounded-xl bg-blue-600 py-3 text-sm font-medium text-white active:bg-blue-700"
      >
        שמור וחזור
      </button>
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getGroupById, upsertGroup } from '../storage/groups'
import type { Group, Member } from '../types'
import ConfirmDialog from '../components/ConfirmDialog'

export default function GroupEditScreen() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()

  const [group, setGroup] = useState<Group | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [confirmDeleteMember, setConfirmDeleteMember] = useState<Member | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!groupId) { setNotFound(true); return }
    const found = getGroupById(groupId)
    if (!found) { setNotFound(true); return }
    setGroup(found)
  }, [groupId])

  // Autosave on every group state change
  useEffect(() => {
    if (group) upsertGroup(group)
  }, [group])

  function updateGroupName(name: string) {
    setGroup(prev => prev ? { ...prev, name } : prev)
  }

  function toggleAvailability(memberId: string) {
    setGroup(prev => {
      if (!prev) return prev
      return {
        ...prev,
        members: prev.members.map(m =>
          m.id === memberId
            ? { ...m, availability: m.availability === 'base' ? 'home' : 'base' }
            : m
        ),
      }
    })
  }

  function startRename(member: Member) {
    setEditingMemberId(member.id)
    setEditingValue(member.name)
    setTimeout(() => editInputRef.current?.focus(), 0)
  }

  function commitRename(memberId: string) {
    const trimmed = editingValue.trim()
    if (!trimmed) { setEditingMemberId(null); return }
    setGroup(prev => {
      if (!prev) return prev
      return {
        ...prev,
        members: prev.members.map(m =>
          m.id === memberId ? { ...m, name: trimmed } : m
        ),
      }
    })
    setEditingMemberId(null)
  }

  function deleteMember(memberId: string) {
    setGroup(prev => {
      if (!prev) return prev
      return { ...prev, members: prev.members.filter(m => m.id !== memberId) }
    })
    setConfirmDeleteMember(null)
  }

  function addMember() {
    const name = newMemberName.trim()
    if (!name) return
    // Deduplication (case-insensitive)
    const exists = group?.members.some(m => m.name.toLowerCase() === name.toLowerCase())
    if (exists) { setNewMemberName(''); return }
    const member: Member = { id: crypto.randomUUID(), name, availability: 'base' }
    setGroup(prev => prev ? { ...prev, members: [...prev.members, member] } : prev)
    setNewMemberName('')
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <p className="text-gray-400">קבוצה לא נמצאה.</p>
        <button onClick={() => navigate('/')} className="mt-4 text-blue-400">חזרה</button>
      </div>
    )
  }

  if (!group) return null

  const baseCount = group.members.filter(m => m.availability === 'base').length
  const homeCount = group.members.length - baseCount

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-gray-400 active:text-gray-200">
          →
        </button>
        <h1 className="text-xl font-bold text-gray-100">עריכת קבוצה</h1>
      </div>

      {/* Group name */}
      <label className="mb-1 block text-sm text-gray-400">שם הקבוצה</label>
      <input
        type="text"
        value={group.name}
        onChange={e => updateGroupName(e.target.value)}
        className="mb-6 w-full rounded-xl bg-gray-800 px-4 py-2.5 text-gray-100 outline-none ring-1 ring-gray-600 focus:ring-blue-500"
      />

      {/* Member count summary */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">
          חברים — {baseCount} בסיס / {homeCount} בית
        </h2>
      </div>

      {/* Member list */}
      <ul className="mb-4 flex flex-col gap-2">
        {group.members.map(member => (
          <li key={member.id} className="flex items-center gap-2 rounded-2xl bg-gray-800 px-4 py-2.5">
            {/* Availability toggle */}
            <button
              onClick={() => toggleAvailability(member.id)}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                member.availability === 'base'
                  ? 'bg-green-700 text-green-100'
                  : 'bg-gray-600 text-gray-300'
              }`}
            >
              {member.availability === 'base' ? 'בסיס' : 'בית'}
            </button>

            {/* Name — inline edit */}
            {editingMemberId === member.id ? (
              <input
                ref={editInputRef}
                value={editingValue}
                onChange={e => setEditingValue(e.target.value)}
                onBlur={() => commitRename(member.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename(member.id)
                  if (e.key === 'Escape') setEditingMemberId(null)
                }}
                className="min-w-0 flex-1 rounded-lg bg-gray-700 px-2 py-1 text-sm text-gray-100 outline-none ring-1 ring-blue-500"
              />
            ) : (
              <button
                onClick={() => startRename(member)}
                className="min-w-0 flex-1 truncate text-right text-sm text-gray-100"
              >
                {member.name}
              </button>
            )}

            {/* Delete */}
            <button
              onClick={() => setConfirmDeleteMember(member)}
              className="shrink-0 text-gray-500 active:text-red-400"
              aria-label="הסר חבר"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {/* Add member */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newMemberName}
          onChange={e => setNewMemberName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addMember() }}
          placeholder="הוסף חבר…"
          className="min-w-0 flex-1 rounded-xl bg-gray-800 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none ring-1 ring-gray-600 focus:ring-blue-500"
        />
        <button
          onClick={addMember}
          disabled={!newMemberName.trim()}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 active:bg-blue-700"
        >
          הוסף
        </button>
      </div>

      {/* Confirm delete member */}
      {confirmDeleteMember && (
        <ConfirmDialog
          message={`להסיר את "${confirmDeleteMember.name}" מהקבוצה?`}
          onConfirm={() => deleteMember(confirmDeleteMember.id)}
          onCancel={() => setConfirmDeleteMember(null)}
        />
      )}
    </div>
  )
}

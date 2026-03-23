import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getGroupById, upsertGroup } from '../storage/groups'
import type { Group, Member } from '../types'
import ConfirmDialog from '../components/ConfirmDialog'
import AvailabilityToggle from '../components/AvailabilityToggle'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

export default function GroupEditScreen() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()

  const [group, setGroup] = useState<Group | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [confirmDeleteMember, setConfirmDeleteMember] = useState<Member | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [showCommanderModal, setShowCommanderModal] = useState(false)
  useBodyScrollLock(showCommanderModal)
  const editInputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstMount = useRef(true)

  useEffect(() => {
    if (!groupId) { setNotFound(true); return }
    const found = getGroupById(groupId)
    if (!found) { setNotFound(true); return }
    setGroup(found)
  }, [groupId])

  // Autosave on every group state change (skip the initial load)
  const showSaved = useCallback(() => {
    setSavedFlash(true)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => setSavedFlash(false), 2000)
  }, [])

  useEffect(() => {
    if (!group) return
    if (isFirstMount.current) { isFirstMount.current = false; return }
    upsertGroup(group)
    showSaved()
  }, [group, showSaved])

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

  function toggleRole(memberId: string) {
    setGroup(prev => {
      if (!prev) return prev
      return {
        ...prev,
        members: prev.members.map(m =>
          m.id === memberId
            ? { ...m, role: (m.role ?? 'warrior') === 'commander' ? 'warrior' : 'commander' }
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
    const exists = group?.members.some(m => m.name.toLowerCase() === name.toLowerCase())
    if (exists) { setNewMemberName(''); return }
    const member: Member = { id: crypto.randomUUID(), name, availability: 'base', role: 'warrior' }
    setGroup(prev => prev ? { ...prev, members: [...prev.members, member] } : prev)
    setNewMemberName('')
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

  const baseCount = group.members.filter(m => m.availability === 'base').length
  const homeCount = group.members.length - baseCount
  const commanders = group.members.filter(m => (m.role ?? 'warrior') === 'commander')
  const warriors = group.members.filter(m => (m.role ?? 'warrior') === 'warrior')

  function renderMemberRow(member: Member) {
    return (
      <li key={member.id} className="flex items-center gap-2 rounded-2xl bg-gray-50 px-4 py-2.5 dark:bg-gray-800">
        {/* Availability toggle */}
        <AvailabilityToggle
          status={member.availability}
          onChange={() => toggleAvailability(member.id)}
        />

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
            className="min-w-0 flex-1 rounded-lg bg-gray-200 px-2 py-1 text-sm text-gray-900 outline-none ring-1 ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
          />
        ) : (
          <button
            onClick={() => startRename(member)}
            className="min-h-[36px] min-w-0 flex-1 truncate text-right text-sm text-gray-900 dark:text-gray-100"
          >
            {member.name}
          </button>
        )}

        {/* Delete */}
        <button
          onClick={() => setConfirmDeleteMember(member)}
          className="min-h-[44px] min-w-[44px] shrink-0 text-gray-400 active:text-red-500 dark:text-gray-500 dark:active:text-red-400"
          aria-label="הסר חבר"
        >
          ✕
        </button>
      </li>
    )
  }

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="min-h-[44px] px-1 text-gray-500 dark:text-gray-400"
            aria-label="חזרה"
          >
            ←
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">עריכת קבוצה</h1>
        </div>
        {/* Autosave indicator */}
        <span
          className={`text-xs text-green-600 transition-opacity duration-300 dark:text-green-400 ${savedFlash ? 'opacity-100' : 'opacity-0'}`}
        >
          ✓ נשמר
        </span>
      </div>

      {/* Group name */}
      <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">שם הקבוצה</label>
      <input
        type="text"
        value={group.name}
        onChange={e => updateGroupName(e.target.value)}
        className="mb-6 w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
      />

      {/* Commander selector button */}
      <button
        onClick={() => setShowCommanderModal(true)}
        className="mb-4 w-full rounded-xl border-2 border-dashed border-blue-300 py-2.5 text-sm font-medium text-blue-600 active:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:active:bg-blue-900/20"
      >
        👑 בחר מפקדים
      </button>

      {/* Member count summary */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          חברים — {baseCount} בסיס / {homeCount} בית
        </h2>
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
            {commanders.map(member => renderMemberRow(member))}
          </ul>
        )}
      </div>

      {/* Warriors section */}
      <div className="mb-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">לוחמים</h3>
        <ul className="flex flex-col gap-2">
          {warriors.map(member => renderMemberRow(member))}
        </ul>
      </div>

      {/* Add member */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newMemberName}
          onChange={e => setNewMemberName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addMember() }}
          placeholder="הוסף חבר…"
          className="min-w-0 flex-1 rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
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

      {/* Commander selection modal */}
      {showCommanderModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div
            className="relative w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-xl dark:bg-gray-800 sm:rounded-2xl max-h-[90vh] overflow-y-auto"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <button
              onClick={() => setShowCommanderModal(false)}
              className="absolute top-4 left-4 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 active:bg-gray-100 dark:text-gray-400 dark:active:bg-gray-700"
              aria-label="סגור"
            >
              ×
            </button>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">בחר מפקדים</h2>
            <ul className="mb-4 flex flex-col gap-2">
              {group.members.map(m => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={(m.role ?? 'warrior') === 'commander'}
                    onChange={() => toggleRole(m.id)}
                    className="h-5 w-5 rounded accent-blue-600"
                    aria-label={m.name}
                  />
                  <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{m.name}</span>
                  <span className={`text-xs ${(m.role ?? 'warrior') === 'commander' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
                    {(m.role ?? 'warrior') === 'commander' ? 'מפקד' : 'לוחם'}
                  </span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setShowCommanderModal(false)}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white active:bg-blue-700"
            >
              סגור
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

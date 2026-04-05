import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getCitations, upsertCitation, deleteCitation } from '../storage/citations'
import { getCitationAuthorLinks, saveCitationAuthorLink, clearCitationAuthorLink } from '../storage/citationAuthorLinks'
import { getUsername } from '../storage/userStorage'
import { getGroups } from '../storage/groups'
import { formatAuthorName } from '../logic/citations'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import type { Citation, Member } from '../types'

const PAGE_SIZE = 20

interface EditState {
  id: string | null // null = new citation
  text: string
  author: string
  linkedMemberId: string // '' = no link
}

export default function CitationsScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const selectionMode = (location.state as { selectionMode?: boolean } | null)?.selectionMode ?? false

  const currentUsername = getUsername()
  const [citations, setCitations] = useState<Citation[]>(() => getCitations())
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  // Reset visibleCount when search changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search])

  const allMembers: Member[] = getGroups().flatMap(g => g.members)
  const [authorLinks, setAuthorLinks] = useState(() => getCitationAuthorLinks())

  const filtered = citations.filter(c =>
    c.text.includes(search) || c.author.includes(search)
  )

  const visible = filtered.slice(0, visibleCount)

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && visibleCount < filtered.length) {
        setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filtered.length))
      }
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [filtered.length, visibleCount])

  function resolveLinkedMemberId(author: string): string {
    const link = authorLinks[author]
    return link && link !== 'skip' ? link : ''
  }

  function handleInlineWarriorChange(citation: Citation, memberId: string) {
    if (!citation.author) return
    if (memberId) {
      saveCitationAuthorLink(citation.author, memberId)
    } else {
      clearCitationAuthorLink(citation.author)
    }
    setAuthorLinks(getCitationAuthorLinks())
  }

  function openEdit(citation: Citation) {
    setEditing({
      id: citation.id,
      text: citation.text,
      author: citation.author,
      linkedMemberId: resolveLinkedMemberId(citation.author),
    })
  }

  function openNew() {
    setEditing({ id: null, text: '', author: '', linkedMemberId: '' })
  }

  function handleSave() {
    if (!editing) return
    const text = editing.text.trim()
    if (!text) return
    const author = formatAuthorName(editing.author.trim())

    if (editing.id === null) {
      upsertCitation({ id: crypto.randomUUID(), text, author, usedInListIds: [], createdByUsername: currentUsername ?? undefined })
    } else {
      const existing = citations.find(c => c.id === editing.id)
      if (existing) {
        upsertCitation({ ...existing, text, author })
      }
    }

    // Save / clear warrior link for the (new) author string
    if (author) {
      if (editing.linkedMemberId) {
        saveCitationAuthorLink(author, editing.linkedMemberId)
      } else {
        clearCitationAuthorLink(author)
      }
    }

    setCitations(getCitations())
    setAuthorLinks(getCitationAuthorLinks())
    setEditing(null)
  }

  function handleDelete(id: string) {
    deleteCitation(id)
    setCitations(getCitations())
    setConfirmDeleteId(null)
    setEditing(null)
  }

  function handleSelect(citation: Citation) {
    navigate('/schedule/new/step4', { state: { selectedCitation: citation } })
  }

  function handleAuthorBlur() {
    if (!editing) return
    const formatted = formatAuthorName(editing.author)
    // Carry over the link for the new formatted author when it changed
    const newLinkedMemberId = formatted !== editing.author
      ? resolveLinkedMemberId(formatted) || editing.linkedMemberId
      : editing.linkedMemberId
    setEditing(prev => prev ? { ...prev, author: formatted, linkedMemberId: newLinkedMemberId } : prev)
  }

  const formattedPreview = editing ? formatAuthorName(editing.author) : ''
  const showPreview = editing !== null && editing.author.trim().split(/\s+/).length > 1

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate(selectionMode ? '/schedule/new/step4' : '/')}
          className="min-h-[44px] px-1 text-sm text-gray-500 dark:text-gray-400 active:text-gray-700 dark:active:text-gray-200"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {selectionMode ? 'בחר ציטוט' : 'ציטוטים'}
        </h1>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לפי טקסט או מחבר..."
          className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
        />
      </div>

      {/* Sharing center button (non-selection mode only) */}
      {!selectionMode && (
        <button
          onClick={() => navigate('/sharing-center')}
          className="mb-4 min-h-[44px] w-full rounded-2xl border border-gray-300 py-3 text-sm font-medium text-gray-700 active:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-700"
        >
          🤝 מרכז השיתוף
        </button>
      )}

      {/* Citations list */}
      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
          {citations.length === 0 ? 'אין ציטוטים עדיין.' : 'אין תוצאות לחיפוש זה.'}
        </p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {visible.map(citation => {
            const currentLinkedMemberId = resolveLinkedMemberId(citation.author)
            const canEditDelete = !citation.createdByUsername || citation.createdByUsername === currentUsername
            return (
              <li
                key={citation.id}
                className="rounded-2xl bg-white dark:bg-gray-800"
              >
                <div
                  role="button"
                  onClick={() => selectionMode ? handleSelect(citation) : (canEditDelete ? openEdit(citation) : undefined)}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${selectionMode || canEditDelete ? 'cursor-pointer active:bg-gray-50 dark:active:bg-gray-700' : 'cursor-default'}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {citation.text}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {citation.author ? `— ${citation.author}` : ''}
                    </p>
                  </div>
                  {citation.usedInListIds.length > 0 && (
                    <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      נוצל
                    </span>
                  )}
                </div>
                {citation.author && allMembers.length > 0 && (
                  <div className="px-4 pb-3" onClick={e => e.stopPropagation()}>
                    <select
                      value={currentLinkedMemberId}
                      onChange={e => handleInlineWarriorChange(citation, e.target.value)}
                      className="w-full rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-700 outline-none dark:bg-gray-700 dark:text-gray-300"
                    >
                      <option value="">ללא לוחם מקושר</option>
                      {allMembers.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </li>
            )
          })}
          <div ref={sentinelRef} className="h-4" />
        </ul>
      )}

      {/* Add button (non-selection mode only) */}
      {!selectionMode && (
        <button
          onClick={openNew}
          className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700"
        >
          + הוסף ציטוט
        </button>
      )}

      {/* Edit / Add modal */}
      {editing !== null && (
        <Modal onClose={() => setEditing(null)} title={editing.id === null ? 'ציטוט חדש' : 'עריכת ציטוט'}>
            {/* Text */}
            <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">טקסט הציטוט</label>
            <textarea
              value={editing.text}
              onChange={e => setEditing(prev => prev ? { ...prev, text: e.target.value } : prev)}
              placeholder="הכנס טקסט ציטוט..."
              rows={3}
              className="mb-4 w-full resize-none rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
            />

            {/* Author */}
            <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">מחבר</label>
            <input
              value={editing.author}
              onChange={e => setEditing(prev => prev ? { ...prev, author: e.target.value } : prev)}
              onBlur={handleAuthorBlur}
              placeholder="שם המחבר..."
              className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
            />
            {showPreview && (
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">יוצג כ: {formattedPreview}</p>
            )}

            {/* Warrior link */}
            {allMembers.length > 0 && (
              <div className="mt-4">
                <label className="mb-1 block text-sm text-gray-500 dark:text-gray-400">לוחם מקושר (אופציונלי)</label>
                <select
                  value={editing.linkedMemberId}
                  onChange={e => setEditing(prev => prev ? { ...prev, linkedMemberId: e.target.value } : prev)}
                  className="w-full rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-900 outline-none dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="">ללא שיוך</option>
                  {allMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex gap-3">
              {editing.id !== null && (
                <button
                  onClick={() => setConfirmDeleteId(editing.id)}
                  className="min-h-[44px] rounded-2xl border border-red-300 px-4 text-sm font-medium text-red-600 active:bg-red-50 dark:border-red-800 dark:text-red-400 dark:active:bg-red-900/20"
                >
                  מחיקה
                </button>
              )}
              <button
                onClick={() => setEditing(null)}
                className="min-h-[44px] flex-1 rounded-2xl border border-gray-300 text-sm font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
              >
                ביטול
              </button>
              <button
                onClick={handleSave}
                disabled={!editing.text.trim()}
                className="min-h-[44px] flex-1 rounded-2xl bg-blue-600 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
              >
                שמור
              </button>
            </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <ConfirmDialog
          message="למחוק את הציטוט?"
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}

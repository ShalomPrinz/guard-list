import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getCitations, upsertCitation, deleteCitation, deleteCitationSilent } from '../storage/citations'
import { getCitationAuthorLinks, saveCitationAuthorLink, clearCitationAuthorLink } from '../storage/citationAuthorLinks'
import { getUsername } from '../storage/userStorage'
import { getGroups } from '../storage/groups'
import { getLocalGroup } from '../storage/citationShare'
import { kvCrossReadGroupMember } from '../storage/cloudStorage'
import { formatAuthorName } from '../logic/citations'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import type { Citation, Member } from '../types'

const SECTION_INITIAL = 3
const SECTION_LOAD_MORE = 10

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
  const ME_KEY = currentUsername ?? '__me__'
  const [citations, setCitations] = useState<Citation[]>(() => getCitations())
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<EditState | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Per-section state for sectioned view
  const [sectionVisible, setSectionVisible] = useState<Record<string, number>>({})
  const [sectionLoadMoreClicked, setSectionLoadMoreClicked] = useState<Record<string, boolean>>({})
  const sentinelRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  // Sync group members' citations on mount
  useEffect(() => {
    async function syncGroupCitations() {
      const group = getLocalGroup()
      if (!group) return
      setLoading(true)
      const currentUser = getUsername()
      const others = group.members.filter(m => m !== currentUser)
      try {
        for (const member of others) {
          const result = await kvCrossReadGroupMember(member)
          if (result === null) continue
          const localIds = new Set(getCitations().map(c => c.id))
          for (const citation of result.citations) {
            if (!localIds.has(citation.id)) upsertCitation(citation)
          }
          const updatedIds = new Set(getCitations().map(c => c.id))
          for (const deletedId of result.deleteLog) {
            if (updatedIds.has(deletedId)) deleteCitationSilent(deletedId)
          }
        }
      } finally {
        setCitations(getCitations())
        setLoading(false)
      }
    }
    void syncGroupCitations()
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(timer)
  }, [toast])

  // Reset section visible counts when search changes
  useEffect(() => {
    setSectionVisible({})
    setSectionLoadMoreClicked({})
  }, [search])

  const allMembers: Member[] = getGroups().flatMap(g => g.members)
  const [authorLinks, setAuthorLinks] = useState(() => getCitationAuthorLinks())

  // --- Section computation ---
  const myCitations = citations.filter(
    c => !c.createdByUsername || c.createdByUsername === currentUsername
  )
  const otherUsernames = [...new Set(
    citations
      .filter(c => c.createdByUsername && c.createdByUsername !== currentUsername)
      .map(c => c.createdByUsername!)
  )]

  function getSectionItems(key: string): Citation[] {
    const base = key === ME_KEY
      ? myCitations
      : citations.filter(c => c.createdByUsername === key)
    return base.filter(c => !search || c.text.includes(search) || c.author.includes(search))
  }

  function getSectionVisible(key: string): number {
    return sectionVisible[key] ?? SECTION_INITIAL
  }

  // IntersectionObserver per section
  useEffect(() => {
    const observers: IntersectionObserver[] = []
    sentinelRefs.current.forEach((el, key) => {
      if (!el || !sectionLoadMoreClicked[key]) return
      const sectionItems = getSectionItems(key)
      const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && getSectionVisible(key) < sectionItems.length) {
          setSectionVisible(prev => ({
            ...prev,
            [key]: Math.min((prev[key] ?? SECTION_INITIAL) + SECTION_LOAD_MORE, sectionItems.length),
          }))
        }
      }, { threshold: 0.1 })
      observer.observe(el)
      observers.push(observer)
    })
    return () => observers.forEach(o => o.disconnect())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionVisible, sectionLoadMoreClicked, citations.length, search])

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

  function renderCitationCard(citation: Citation) {
    const currentLinkedMemberId = resolveLinkedMemberId(citation.author)
    const canEditDelete = !citation.createdByUsername || citation.createdByUsername === currentUsername
    return (
      <li
        key={citation.id}
        className="rounded-2xl bg-white dark:bg-gray-800"
      >
        <div
          role="button"
          onClick={() => {
            if (selectionMode) { handleSelect(citation); return }
            if (canEditDelete) { openEdit(citation); return }
            setToast('לא ניתן לערוך ציטוט שנוצר על ידי משתמש אחר')
          }}
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
  }

  // Build sections (search filter applied inside getSectionItems)
  const allSectionKeys = [ME_KEY, ...otherUsernames]
  const sections: Array<{ key: string; label: string; items: Citation[] }> = []
  for (const key of allSectionKeys) {
    const items = getSectionItems(key)
    if (items.length > 0) {
      sections.push({ key, label: key === ME_KEY ? 'הציטוטים שלי' : key, items })
    }
  }

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

      {/* Loading indicator */}
      {loading && (
        <div className="mb-2 text-center text-xs text-gray-400 dark:text-gray-500">
          מסנכרן ציטוטים...
        </div>
      )}

      {/* Citations list */}
      {citations.length === 0 && !loading ? (
        <p className="rounded-2xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
          אין ציטוטים עדיין.
        </p>
      ) : sections.length === 0 && search ? (
        <p className="rounded-2xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
          אין תוצאות לחיפוש זה.
        </p>
      ) : (
        // Sectioned view (search filter applied per-section)
        <div className="mb-4">
          {sections.map(({ key: sectionKey, label, items: sectionItems }) => {
            const visCount = getSectionVisible(sectionKey)
            return (
              <section key={sectionKey} className="mb-6">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {label}
                </h2>
                <ul className="mb-2 flex flex-col gap-2">
                  {sectionItems.slice(0, visCount).map(citation => renderCitationCard(citation))}
                  <div
                    ref={el => { sentinelRefs.current.set(sectionKey, el) }}
                    className="h-4"
                  />
                </ul>
                {sectionItems.length > visCount && (
                  <button
                    onClick={() => {
                      setSectionVisible(prev => ({ ...prev, [sectionKey]: (prev[sectionKey] ?? SECTION_INITIAL) + SECTION_LOAD_MORE }))
                      setSectionLoadMoreClicked(prev => ({ ...prev, [sectionKey]: true }))
                    }}
                    className="mb-4 min-h-[44px] w-full rounded-2xl border border-gray-300 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
                  >
                    טען עוד ציטוטים
                  </button>
                )}
              </section>
            )
          })}
        </div>
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

      {/* Ownership toast */}
      {toast !== null && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-gray-900 px-5 py-3 text-sm text-white shadow-lg dark:bg-gray-700">
          {toast}
        </div>
      )}
    </div>
  )
}

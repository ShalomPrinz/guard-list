import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getCitations, upsertCitation, deleteCitation } from '../storage/citations'
import { getCitationAuthorLinks, saveCitationAuthorLink, clearCitationAuthorLink } from '../storage/citationAuthorLinks'
import {
  getShareStatus,
  getOutgoingRequest,
  clearOutgoingRequest,
  stopSharing,
  sendShareRequest,
} from '../storage/citationShare'
import { kvListGuestCitations, kvDeleteGuestCitation } from '../storage/cloudStorage'
import { getUsername } from '../storage/userStorage'
import type { CitationShareStatus, GuestCitationSubmission } from '../types'
import { getGroups } from '../storage/groups'
import { formatAuthorName } from '../logic/citations'
import { formatDate } from '../logic/formatting'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import type { Citation, Member } from '../types'

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

  const [citations, setCitations] = useState<Citation[]>(() => getCitations())
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<EditState | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  // Guest citations inbox
  const [pendingGuest, setPendingGuest] = useState<GuestCitationSubmission[] | null>(null)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [inboxLoading, setInboxLoading] = useState(false)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [acceptMemberIds, setAcceptMemberIds] = useState<Record<string, string>>({})

  // Guest link copy state
  const [linkCopied, setLinkCopied] = useState(false)

  // Share state
  const [shareStatus, setShareStatus] = useState<CitationShareStatus | null>(() => getShareStatus())
  const [outgoingRequest, setOutgoingRequest] = useState<{ toUsername: string; sentAt: number } | null>(() => getOutgoingRequest())
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareInput, setShareInput] = useState('')
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)

  function handleCopyGuestLink() {
    const username = getUsername()
    if (!username) return
    const url = `${window.location.origin}/guest/${username}`
    void navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  function refreshShareState() {
    setShareStatus(getShareStatus())
    setOutgoingRequest(getOutgoingRequest())
  }

  useEffect(() => {
    const handler = () => refreshShareState()
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  async function handleSendShareRequest() {
    const trimmed = shareInput.trim()
    if (!trimmed) return
    setShareLoading(true)
    setShareError(null)
    const result = await sendShareRequest(trimmed)
    setShareLoading(false)
    if (result === 'sent') {
      setShowShareModal(false)
      setShareInput('')
      refreshShareState()
    } else if (result === 'already_have_outgoing') {
      setShareError('כבר יש בקשה פתוחה')
    } else if (result === 'target_has_pending') {
      setShareError('למשתמש זה כבר יש בקשה ממתינה')
    } else if (result === 'already_sharing') {
      setShareError('כבר משותף עם משתמש אחר')
      refreshShareState()
    } else {
      setShareError('שגיאה בשליחה — בדוק את הקונסול לפרטים')
    }
  }

  const allMembers: Member[] = getGroups().flatMap(g => g.members)
  const [authorLinks, setAuthorLinks] = useState(() => getCitationAuthorLinks())

  const filtered = citations.filter(c =>
    c.text.includes(search) || c.author.includes(search)
  )

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
      upsertCitation({ id: crypto.randomUUID(), text, author, usedInListIds: [] })
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

  async function openInbox() {
    setInboxOpen(true)
    setInboxLoading(true)
    setAcceptingId(null)
    setAcceptMemberIds({})
    const submissions = await kvListGuestCitations()
    setPendingGuest(submissions)
    setInboxLoading(false)
  }

  function handleReject(submissionId: string) {
    kvDeleteGuestCitation(submissionId)
    setPendingGuest(prev => prev ? prev.filter(s => s.id !== submissionId) : prev)
    if (acceptingId === submissionId) setAcceptingId(null)
  }

  function handleAcceptOne(submission: GuestCitationSubmission, memberId: string) {
    const newCitation: Citation = {
      id: crypto.randomUUID(),
      text: submission.text,
      author: submission.author,
      usedInListIds: [],
    }
    upsertCitation(newCitation)
    if (memberId) saveCitationAuthorLink(submission.author, memberId)
    kvDeleteGuestCitation(submission.id)
    setPendingGuest(prev => prev ? prev.filter(s => s.id !== submission.id) : prev)
    setAcceptingId(null)
    setCitations(getCitations())
    setAuthorLinks(getCitationAuthorLinks())
  }

  function handleAcceptAll() {
    const list = pendingGuest ?? []
    for (const submission of list) {
      const newCitation: Citation = {
        id: crypto.randomUUID(),
        text: submission.text,
        author: submission.author,
        usedInListIds: [],
      }
      upsertCitation(newCitation)
      kvDeleteGuestCitation(submission.id)
    }
    setPendingGuest([])
    setAcceptingId(null)
    setCitations(getCitations())
    setAuthorLinks(getCitationAuthorLinks())
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

      {/* Share status panel (non-selection mode only) */}
      {!selectionMode && (
        <div className="mb-4 rounded-2xl bg-white px-4 py-3 dark:bg-gray-800">
          {shareStatus !== null ? (
            // State C: sharing active
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                <span className="truncate text-sm text-gray-700 dark:text-gray-300">
                  שיתוף פעיל עם <span className="font-semibold">{shareStatus.partnerUsername}</span>
                </span>
              </div>
              <button
                onClick={() => { stopSharing(); refreshShareState() }}
                className="min-h-[44px] shrink-0 rounded-xl border border-red-300 px-3 text-sm font-medium text-red-600 active:bg-red-50 dark:border-red-700 dark:text-red-400 dark:active:bg-red-900/20"
              >
                הפסק שיתוף
              </button>
            </div>
          ) : outgoingRequest !== null ? (
            // State B: outgoing request pending
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm text-gray-500 dark:text-gray-400">
                בקשת שיתוף נשלחה ל-<span className="font-medium">{outgoingRequest.toUsername}</span>
              </span>
              <button
                onClick={() => { clearOutgoingRequest(); refreshShareState() }}
                className="min-h-[44px] shrink-0 px-2 text-sm text-blue-600 underline dark:text-blue-400"
              >
                בטל בקשה
              </button>
            </div>
          ) : (
            // State A: not sharing
            <button
              onClick={() => { setShareInput(''); setShareError(null); setShowShareModal(true) }}
              className="min-h-[44px] w-full rounded-xl border border-gray-300 text-sm font-medium text-gray-700 active:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-700"
            >
              שתף אוסף
            </button>
          )}
        </div>
      )}

      {/* Guest link section (non-selection mode only) */}
      {!selectionMode && (
        <div className="mb-4 rounded-2xl bg-white px-4 py-3 dark:bg-gray-800">
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">קישור לשליחת ציטוטים ממבקרים</p>
          <div className="flex gap-2">
            <button
              onClick={handleCopyGuestLink}
              className="min-h-[44px] flex-1 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 active:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-700"
            >
              {linkCopied ? 'הועתק!' : 'העתק קישור'}
            </button>
            <button
              onClick={() => {
                const username = getUsername()
                if (!username) return
                const url = `${window.location.origin}/guest/${username}`
                window.open(`https://wa.me/?text=${encodeURIComponent(url)}`, '_blank')
              }}
              className="min-h-[44px] flex-1 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 active:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-700"
            >
              שתף בוואטסאפ
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לפי טקסט או מחבר..."
          className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
        />
      </div>

      {/* Citations list */}
      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
          {citations.length === 0 ? 'אין ציטוטים עדיין.' : 'אין תוצאות לחיפוש זה.'}
        </p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {filtered.map(citation => {
            const currentLinkedMemberId = resolveLinkedMemberId(citation.author)
            return (
              <li
                key={citation.id}
                className="rounded-2xl bg-white dark:bg-gray-800"
              >
                <div
                  role="button"
                  onClick={() => selectionMode ? handleSelect(citation) : openEdit(citation)}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 active:bg-gray-50 dark:active:bg-gray-700"
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
        </ul>
      )}

      {/* Add button and inbox button (normal mode only) */}
      {!selectionMode && (
        <div className="flex gap-2">
          <button
            onClick={openNew}
            className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700"
          >
            + הוסף ציטוט
          </button>
          <button
            onClick={openInbox}
            className="relative min-h-[44px] rounded-2xl border border-gray-300 px-4 text-sm font-medium text-gray-700 active:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-700"
          >
            ציטוטים ממבקרים
            {pendingGuest !== null && pendingGuest.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                {pendingGuest.length}
              </span>
            )}
          </button>
        </div>
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

      {/* Guest citations inbox modal */}
      {inboxOpen && (
        <Modal onClose={() => setInboxOpen(false)} title="ציטוטים ממבקרים">
          {inboxLoading ? (
            <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">טוען...</p>
          ) : pendingGuest === null || pendingGuest.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">אין ציטוטים ממתינים</p>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingGuest.length > 1 && (
                <button
                  onClick={handleAcceptAll}
                  className="min-h-[44px] w-full rounded-2xl bg-green-600 text-sm font-semibold text-white active:bg-green-700"
                >
                  קבל הכל
                </button>
              )}
              {pendingGuest.map(submission => (
                <div key={submission.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                  <p className="mb-1 text-sm text-gray-900 dark:text-gray-100">{submission.text}</p>
                  <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                    {submission.author ? `— ${submission.author}` : ''}
                  </p>
                  <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
                    {formatDate(new Date(submission.submittedAt))}
                  </p>

                  {acceptingId === submission.id ? (
                    <div className="flex flex-col gap-2">
                      {allMembers.length > 0 && (
                        <select
                          value={acceptMemberIds[submission.id] ?? ''}
                          onChange={e => setAcceptMemberIds(prev => ({ ...prev, [submission.id]: e.target.value }))}
                          className="w-full rounded-xl bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-1 ring-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:ring-gray-600"
                        >
                          <option value="">ללא קישור</option>
                          {allMembers.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAcceptingId(null)}
                          className="min-h-[44px] flex-1 rounded-2xl border border-gray-300 text-sm font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
                        >
                          ביטול
                        </button>
                        <button
                          onClick={() => handleAcceptOne(submission, acceptMemberIds[submission.id] ?? '')}
                          className="min-h-[44px] flex-1 rounded-2xl bg-green-600 text-sm font-semibold text-white active:bg-green-700"
                        >
                          אשר
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReject(submission.id)}
                        className="min-h-[44px] flex-1 rounded-2xl border border-red-300 text-sm font-medium text-red-600 active:bg-red-50 dark:border-red-700 dark:text-red-400 dark:active:bg-red-900/20"
                      >
                        דחה
                      </button>
                      <button
                        onClick={() => setAcceptingId(submission.id)}
                        className="min-h-[44px] flex-1 rounded-2xl bg-green-600 text-sm font-semibold text-white active:bg-green-700"
                      >
                        קבל
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Send share request modal */}
      {showShareModal && (
        <Modal onClose={() => setShowShareModal(false)} title="שיתוף אוסף ציטוטים">
          <input
            value={shareInput}
            onChange={e => setShareInput(e.target.value)}
            placeholder="שם משתמש..."
            dir="rtl"
            className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
          />
          {shareError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{shareError}</p>
          )}
          <button
            onClick={handleSendShareRequest}
            disabled={shareLoading || !shareInput.trim()}
            className="mt-4 min-h-[44px] w-full rounded-2xl bg-blue-600 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
          >
            {shareLoading ? 'שולח...' : 'שלח בקשה'}
          </button>
        </Modal>
      )}
    </div>
  )
}

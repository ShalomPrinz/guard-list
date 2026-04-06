import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getLocalGroup,
  getLocalGroupInvitation,
  getOutgoingInvitation,
  clearOutgoingInvitation,
  sendGroupInvitation,
  acceptGroupInvitation,
  declineGroupInvitation,
  leaveGroup,
  loadSharingCenterUpdates,
} from '../storage/citationShare'
import { getUsername } from '../storage/userStorage'
import { kvListGuestCitationsLatest, kvDeleteGuestCitation, kvInvitationCancel } from '../storage/cloudStorage'
import { getGroups } from '../storage/groups'
import { upsertCitation } from '../storage/citations'
import { saveCitationAuthorLink } from '../storage/citationAuthorLinks'
import { formatDate } from '../logic/formatting'
import type { SharingGroup, GroupInvitation, GuestCitationSubmission, Member, Citation } from '../types'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'

export default function SharingCenterScreen() {
  const navigate = useNavigate()
  const currentUser = getUsername() ?? ''

  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<{ acceptedBy?: string; rejectedBy?: string } | null>(null)
  const [group, setGroup] = useState<SharingGroup | null>(null)
  const [invitation, setInvitation] = useState<GroupInvitation | null>(null)
  const [outgoing, setOutgoing] = useState<{ toUsername: string } | null>(null)
  const [showInviteInput, setShowInviteInput] = useState(false)
  const [inviteTarget, setInviteTarget] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [inviteCancelledBy, setInviteCancelledBy] = useState<string | null>(null)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [autoLeftMsg, setAutoLeftMsg] = useState(false)

  // Guest link
  const [linkCopied, setLinkCopied] = useState(false)

  // Guest citations inbox
  const [pendingGuest, setPendingGuest] = useState<GuestCitationSubmission[] | null>(null)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [inboxLoading, setInboxLoading] = useState(false)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [acceptMemberIds, setAcceptMemberIds] = useState<Record<string, string>>({})

  const allMembers: Member[] = getGroups().flatMap(g => g.members)

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })

    async function load() {
      try {
        const sharingResult = await loadSharingCenterUpdates()
        if (sharingResult.acceptedBy || sharingResult.rejectedBy) {
          setNotification(sharingResult)
        }
        if (sharingResult.invitationCancelledBy) {
          setInviteCancelledBy(sharingResult.invitationCancelledBy)
        }
        if (sharingResult.autoLeftLoneGroup) {
          setAutoLeftMsg(true)
        }
        setGroup(getLocalGroup())
        setInvitation(getLocalGroupInvitation())
        setOutgoing(getOutgoingInvitation())
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  function refreshState() {
    setGroup(getLocalGroup())
    setInvitation(getLocalGroupInvitation())
    setOutgoing(getOutgoingInvitation())
  }

  function handleCopyGuestLink() {
    const username = getUsername()
    if (!username) return
    const url = `${window.location.origin}/guest/${username}`
    void navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  async function openInbox() {
    setInboxOpen(true)
    setInboxLoading(true)
    setAcceptingId(null)
    setAcceptMemberIds({})
    const submissions = await kvListGuestCitationsLatest(5)
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
  }

  async function handleAccept() {
    if (!invitation) return
    setAcceptError(null)
    const fromUsername = invitation.fromUsername
    setActionLoading(true)
    const result = await acceptGroupInvitation(invitation)
    if (result === 'cancelled') {
      setActionLoading(false)
      setInviteCancelledBy(fromUsername)
      return
    }
    if (result === 'error') {
      setActionLoading(false)
      setAcceptError('שגיאה בהצטרפות לקבוצה — נסה שוב')
      return
    }
    // localStorage is already up to date from acceptGroupInvitation — just re-read it
    refreshState()
    setActionLoading(false)
  }

  async function handleDecline() {
    if (!invitation) return
    setActionLoading(true)
    await declineGroupInvitation(invitation)
    refreshState()
    setActionLoading(false)
  }

  async function handleSendInvite() {
    const target = inviteTarget.trim()
    if (!target) return
    setInviteError(null)
    setActionLoading(true)
    const result = await sendGroupInvitation(target)
    setActionLoading(false)
    if (result === 'sent') {
      setShowInviteInput(false)
      setInviteTarget('')
      refreshState()
    } else if (result === 'own_namespace') {
      setInviteError('לא ניתן להזמין את עצמך')
    } else if (result === 'already_have_outgoing') {
      setInviteError('כבר קיימת הזמנה ממתינה')
    } else if (result === 'target_has_pending') {
      setInviteError('למשתמש זה כבר יש הזמנה ממתינה')
    } else {
      setInviteError('שגיאה — נסה שוב')
    }
  }

  async function handleLeave() {
    setActionLoading(true)
    await leaveGroup()
    setActionLoading(false)
    navigate('/citations')
  }

  if (loading) {
    return (
      <div className="animate-fadein mx-auto max-w-lg px-4 py-6" dir="rtl">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => navigate('/citations')}
            className="min-h-[44px] px-1 text-sm text-gray-500 dark:text-gray-400 active:text-gray-700 dark:active:text-gray-200"
          >
            ←
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">מרכז השיתוף</h1>
        </div>
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">טוען...</p>
      </div>
    )
  }

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6" dir="rtl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate('/citations')}
          className="min-h-[44px] px-1 text-sm text-gray-500 dark:text-gray-400 active:text-gray-700 dark:active:text-gray-200"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">מרכז השיתוף</h1>
      </div>

      {/* Cancelled invitation banner */}
      {inviteCancelledBy && (
        <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-300">
            המשתמש &quot;{inviteCancelledBy}&quot; ביטל את ההזמנה לקבוצה שלו
          </p>
        </div>
      )}

      {/* Notification banner */}
      {notification !== null && (
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-blue-50 px-4 py-3 dark:bg-blue-900/30">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            {notification.acceptedBy
              ? `המשתמש ${notification.acceptedBy} הצטרף לקבוצה`
              : `המשתמש ${notification.rejectedBy} דחה את ההזמנה`}
          </p>
          <button
            onClick={() => setNotification(null)}
            className="min-h-[44px] px-2 text-blue-600 dark:text-blue-400"
          >
            ✕
          </button>
        </div>
      )}

      {/* Guest link section */}
      <div className="mb-4 rounded-2xl bg-white px-4 py-4 dark:bg-gray-800">
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">קישור לטופס הוספת ציטוטים לאוסף שלך -</h2>
        <div className="flex gap-2">
          <button
            onClick={handleCopyGuestLink}
            className={`min-h-[44px] flex-1 rounded-2xl py-3 text-sm font-semibold transition-colors ${linkCopied ? 'bg-green-700 text-white' : 'bg-gray-200 text-gray-900 active:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:active:bg-gray-600'}`}
          >
            {linkCopied ? '✓ הועתק!' : '📋 העתק קישור'}
          </button>
          <button
            onClick={() => {
              const username = getUsername()
              if (!username) return
              const url = `${window.location.origin}/guest/${username}`
              window.open(`https://wa.me/?text=${encodeURIComponent(url)}`, '_blank')
            }}
            className="min-h-[44px] flex-1 rounded-2xl bg-green-600 py-3 text-sm font-semibold text-white active:bg-green-700"
          >
            📤 שתף בוואטסאפ
          </button>
        </div>
      </div>

      {/* Guest citations inbox */}
      <div className="mb-4">
        <button
          onClick={openInbox}
          className="relative min-h-[44px] w-full rounded-2xl border border-gray-300 py-3 text-sm font-medium text-gray-700 active:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-700"
        >
          לבחירת ציטוטים שהתקבלו מהטופס
          {pendingGuest !== null && pendingGuest.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
              {pendingGuest.length}
            </span>
          )}
        </button>
      </div>

      {/* Pending invitation */}
      {invitation !== null && (
        <div className="mb-4 rounded-2xl bg-white px-4 py-4 dark:bg-gray-800">
          <p className="mb-4 text-sm text-gray-800 dark:text-gray-200">
            קיבלת הזמנה לקבוצת שיתוף מאת <span className="font-semibold">{invitation.fromUsername}</span>
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleAccept}
              disabled={actionLoading}
              className="min-h-[44px] flex-1 rounded-2xl bg-green-600 text-sm font-semibold text-white active:bg-green-700 disabled:opacity-50 dark:bg-green-700 dark:active:bg-green-800"
            >
              אשר
            </button>
            <button
              onClick={handleDecline}
              disabled={actionLoading}
              className="min-h-[44px] flex-1 rounded-2xl bg-red-600 text-sm font-semibold text-white active:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:active:bg-red-800"
            >
              דחה
            </button>
          </div>
          {acceptError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{acceptError}</p>
          )}
        </div>
      )}

      {/* Auto-left lone group message */}
      {autoLeftMsg && group === null && (
        <div className="mb-4 rounded-2xl bg-white px-4 py-4 dark:bg-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            מצטערים, נשארת לבד בקבוצת השיתוף ולכן סגרנו אותה עבורך
          </p>
        </div>
      )}

      {/* In a group */}
      {group !== null && invitation === null && (
        <div className="mb-4 flex flex-col gap-3">
          <div className="rounded-2xl bg-white px-4 py-4 dark:bg-gray-800">
            <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">קבוצת שיתוף ציטוטים</h2>
            <ul className="mb-3 flex flex-col gap-1">
              {group.members.map(member => (
                <li key={member} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                  <span>{member}</span>
                  {member === currentUser && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">(אתה)</span>
                  )}
                </li>
              ))}
            </ul>

            {outgoing !== null && (
              <div className="mb-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  הזמנה נשלחה ל-<span className="font-semibold">{outgoing.toUsername}</span>
                </p>
                <button
                  onClick={async () => {
                    await kvInvitationCancel(outgoing.toUsername)
                    clearOutgoingInvitation()
                    refreshState()
                  }}
                  className="min-h-[44px] px-3 text-xs text-red-600 dark:text-red-400"
                >
                  בטל
                </button>
              </div>
            )}

            <button
              onClick={() => { setShowInviteInput(v => !v); setInviteError(null) }}
              className="min-h-[44px] w-full rounded-2xl border border-gray-300 text-sm font-medium text-gray-700 active:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-700"
            >
              הזמן משתמש
            </button>

            {showInviteInput && (
              <div className="mt-3 flex flex-col gap-2">
                <input
                  dir="rtl"
                  value={inviteTarget}
                  onChange={e => { setInviteTarget(e.target.value); setInviteError(null) }}
                  placeholder="שם משתמש..."
                  className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
                />
                {inviteError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{inviteError}</p>
                )}
                <button
                  onClick={handleSendInvite}
                  disabled={actionLoading || !inviteTarget.trim()}
                  className="min-h-[44px] w-full rounded-2xl bg-blue-600 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
                >
                  {actionLoading ? 'שולח...' : 'שלח הזמנה'}
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="min-h-[44px] w-full rounded-2xl border border-red-300 text-sm font-medium text-red-600 active:bg-red-50 dark:border-red-700 dark:text-red-400 dark:active:bg-red-900/20"
          >
            עזוב קבוצה
          </button>
        </div>
      )}

      {/* Not in any group, no invitation */}
      {group === null && invitation === null && (
        <div className="rounded-2xl bg-white px-4 py-4 dark:bg-gray-800">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">אינך חלק מקבוצת שיתוף ציטוטים</p>

          <button
            onClick={() => { setShowInviteInput(v => !v); setInviteError(null) }}
            className="min-h-[44px] w-full rounded-2xl bg-blue-600 text-sm font-semibold text-white active:bg-blue-700"
          >
            הזמן חבר לשיתוף אוסף ציטוטים
          </button>

          {showInviteInput && (
            <div className="mt-3 flex flex-col gap-2">
              <input
                dir="rtl"
                value={inviteTarget}
                onChange={e => { setInviteTarget(e.target.value); setInviteError(null) }}
                placeholder="שם משתמש..."
                className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
              />
              {inviteError && (
                <p className="text-xs text-red-600 dark:text-red-400">{inviteError}</p>
              )}
              <button
                onClick={handleSendInvite}
                disabled={actionLoading || !inviteTarget.trim()}
                className="min-h-[44px] w-full rounded-2xl bg-blue-600 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading ? 'שולח...' : 'שלח הזמנה'}
              </button>
            </div>
          )}
        </div>
      )}

      {showLeaveConfirm && (
        <ConfirmDialog
          message="לעזוב את קבוצת השיתוף? הציטוטים של שאר חברי הקבוצה יימחקו מהמכשיר שלך."
          confirmLabel="עזיבה"
          onConfirm={handleLeave}
          onCancel={() => setShowLeaveConfirm(false)}
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
                          <option value="">ללא שיוך</option>
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
    </div>
  )
}

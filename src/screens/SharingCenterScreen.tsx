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
import type { SharingGroup, GroupInvitation } from '../types'
import ConfirmDialog from '../components/ConfirmDialog'

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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    void loadSharingCenterUpdates().then(result => {
      if (result.acceptedBy || result.rejectedBy) {
        setNotification(result)
      }
      setGroup(getLocalGroup())
      setInvitation(getLocalGroupInvitation())
      setOutgoing(getOutgoingInvitation())
      setLoading(false)
    })
  }, [])

  function refreshState() {
    setGroup(getLocalGroup())
    setInvitation(getLocalGroupInvitation())
    setOutgoing(getOutgoingInvitation())
  }

  async function handleAccept() {
    if (!invitation) return
    setActionLoading(true)
    await acceptGroupInvitation(invitation)
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
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">מרכז שיתוף</h1>
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
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">מרכז שיתוף</h1>
      </div>

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
              {actionLoading ? 'מעבד...' : 'אשר'}
            </button>
            <button
              onClick={handleDecline}
              disabled={actionLoading}
              className="min-h-[44px] flex-1 rounded-2xl bg-red-600 text-sm font-semibold text-white active:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:active:bg-red-800"
            >
              דחה
            </button>
          </div>
        </div>
      )}

      {/* In a group */}
      {group !== null && invitation === null && (
        <div className="mb-4 flex flex-col gap-3">
          <div className="rounded-2xl bg-white px-4 py-4 dark:bg-gray-800">
            <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">קבוצת שיתוף</h2>
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
                  onClick={() => { clearOutgoingInvitation(); refreshState() }}
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
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">אינך חלק מקבוצת שיתוף</p>

          <button
            onClick={() => { setShowInviteInput(v => !v); setInviteError(null) }}
            className="min-h-[44px] w-full rounded-2xl bg-blue-600 text-sm font-semibold text-white active:bg-blue-700"
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
      )}

      {showLeaveConfirm && (
        <ConfirmDialog
          message="לעזוב את קבוצת השיתוף? הציטוטים של שאר חברי הקבוצה יימחקו מהמכשיר שלך."
          onConfirm={handleLeave}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}
    </div>
  )
}

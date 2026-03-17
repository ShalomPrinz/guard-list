import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGroups, deleteGroup } from '../storage/groups'
import { getSchedules, deleteSchedule } from '../storage/schedules'
import { formatDate, formatTime } from '../logic/formatting'
import type { Group, Schedule } from '../types'
import ConfirmDialog from '../components/ConfirmDialog'
import CreateGroupModal from '../components/CreateGroupModal'

export default function HomeScreen() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<Group[]>(() => getGroups())
  const [schedules, setSchedules] = useState<Schedule[]>(() => getSchedules())
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'group' | 'schedule'; id: string; name: string } | null>(null)
  const [showCreateGroup, setShowCreateGroup] = useState(false)

  useEffect(() => {
    setGroups(getGroups())
    setSchedules(getSchedules())
  }, [])

  function handleDeleteGroup(id: string) {
    deleteGroup(id)
    setGroups(getGroups())
    setConfirmDelete(null)
  }

  function handleDeleteSchedule(id: string) {
    deleteSchedule(id)
    setSchedules(getSchedules())
    setConfirmDelete(null)
  }

  function formatScheduleDate(isoDate: string) {
    const d = new Date(isoDate)
    return `${formatDate(d)} ${formatTime(d)}`
  }

  // Welcome state — shown when no groups exist yet
  if (groups.length === 0) {
    return (
      <div className="animate-fadein mx-auto flex max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
        <img
          src="/app-icon.png"
          alt=""
          className="mb-4 h-20 w-20 rounded-2xl object-cover dark:brightness-0 dark:invert"
        />
        <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">רשימת שמירה</h1>
        <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">
          ברוך הבא! כדי להתחיל, צור קבוצת לוחמים שמורה
        </p>
        <button
          onClick={() => setShowCreateGroup(true)}
          className="rounded-2xl bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-lg active:bg-blue-700"
        >
          צור קבוצה
        </button>

        {showCreateGroup && (
          <CreateGroupModal
            onCreated={group => {
              setGroups(getGroups())
              setShowCreateGroup(false)
              navigate(`/group/${group.id}/edit`)
            }}
            onCancel={() => setShowCreateGroup(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
      {/* Primary actions */}
      <div className="mb-8 flex flex-col gap-3">
        <button
          onClick={() => navigate('/schedule/new/step1')}
          className="w-full rounded-2xl bg-blue-600 py-4 text-base font-semibold text-white shadow-lg active:bg-blue-700"
        >
          + צור לוח שמירה
        </button>
        <button
          onClick={() => navigate('/statistics')}
          className="w-full rounded-2xl border border-gray-300 py-3 text-sm font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-800"
        >
          📊 סטטיסטיקות
        </button>
      </div>

      {/* Saved Groups */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">קבוצות שמורות</h2>
          <button
            onClick={() => setShowCreateGroup(true)}
            className="min-h-[36px] rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-gray-800 active:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:active:bg-gray-600"
          >
            + קבוצה חדשה
          </button>
        </div>

        <ul className="flex flex-col gap-2">
          {groups.map(group => (
            <li
              key={group.id}
              onClick={() => navigate(`/group/${group.id}/edit`)}
              className="flex cursor-pointer items-center justify-between rounded-2xl bg-white px-4 py-3 active:bg-gray-50 dark:bg-gray-800 dark:active:bg-gray-750"
            >
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{group.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {group.members.length} חברים ·{' '}
                  {group.members.filter(m => m.availability === 'base').length} בסיס
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete({ type: 'group', id: group.id, name: group.name }) }}
                  className="min-h-[36px] rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-red-600 active:bg-gray-200 dark:bg-gray-700 dark:text-red-400 dark:active:bg-gray-600"
                >
                  מחיקה
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Past Schedules */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">לוחות שמירה קודמים</h2>

        {schedules.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
            אין לוחות שמירה עדיין.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...schedules].reverse().map(schedule => (
              <li
                key={schedule.id}
                onClick={() => navigate(`/schedule/${schedule.id}/result`)}
                className="flex cursor-pointer items-center justify-between rounded-2xl bg-white px-4 py-3 active:bg-gray-50 dark:bg-gray-800 dark:active:bg-gray-750"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{schedule.name || 'ללא שם'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatScheduleDate(schedule.createdAt)} · {schedule.stations.length} עמדות
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDelete({ type: 'schedule', id: schedule.id, name: schedule.name || 'לוח שמירה זה' }) }}
                    className="min-h-[36px] rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-red-600 active:bg-gray-200 dark:bg-gray-700 dark:text-red-400 dark:active:bg-gray-600"
                  >
                    מחיקה
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Modals */}
      {showCreateGroup && (
        <CreateGroupModal
          onCreated={group => {
            setGroups(getGroups())
            setShowCreateGroup(false)
            navigate(`/group/${group.id}/edit`)
          }}
          onCancel={() => setShowCreateGroup(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`למחוק את "${confirmDelete.name}"?`}
          onConfirm={() =>
            confirmDelete.type === 'group'
              ? handleDeleteGroup(confirmDelete.id)
              : handleDeleteSchedule(confirmDelete.id)
          }
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGroups, deleteGroup } from '../storage/groups'
import { getSchedules, deleteSchedule } from '../storage/schedules'
import type { Group, Schedule } from '../types'
import ConfirmDialog from '../components/ConfirmDialog'
import CreateGroupModal from '../components/CreateGroupModal'

export default function HomeScreen() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<Group[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
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
    return new Date(isoDate).toLocaleString('he-IL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <img src="/app-icon.png" alt="" className="h-9 w-9 rounded-xl object-cover" />
        <h1 className="text-2xl font-bold text-gray-100">רשימת שמירה</h1>
      </div>

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
          className="w-full rounded-2xl border border-gray-600 py-3 text-sm font-medium text-gray-300 active:bg-gray-800"
        >
          📊 סטטיסטיקות
        </button>
      </div>

      {/* Saved Groups */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-200">קבוצות שמורות</h2>
          <button
            onClick={() => setShowCreateGroup(true)}
            className="rounded-xl bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 active:bg-gray-600"
          >
            + קבוצה חדשה
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-700 py-8 text-center text-sm text-gray-500">
            אין קבוצות עדיין. צור קבוצה כדי להתחיל.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {groups.map(group => (
              <li key={group.id} className="flex items-center justify-between rounded-2xl bg-gray-800 px-4 py-3">
                <div>
                  <p className="font-medium text-gray-100">{group.name}</p>
                  <p className="text-xs text-gray-400">
                    {group.members.length} חברים ·{' '}
                    {group.members.filter(m => m.availability === 'base').length} בסיס
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/group/${group.id}/edit`)}
                    className="rounded-xl bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 active:bg-gray-600"
                  >
                    עריכה
                  </button>
                  <button
                    onClick={() => setConfirmDelete({ type: 'group', id: group.id, name: group.name })}
                    className="rounded-xl bg-gray-700 px-3 py-1.5 text-xs font-medium text-red-400 active:bg-gray-600"
                  >
                    מחיקה
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Past Schedules */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-200">לוחות שמירה קודמים</h2>

        {schedules.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-700 py-8 text-center text-sm text-gray-500">
            אין לוחות שמירה עדיין.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...schedules].reverse().map(schedule => (
              <li key={schedule.id} className="flex items-center justify-between rounded-2xl bg-gray-800 px-4 py-3">
                <div>
                  <p className="font-medium text-gray-100">{schedule.name || 'ללא שם'}</p>
                  <p className="text-xs text-gray-400">
                    {formatScheduleDate(schedule.createdAt)} · {schedule.stations.length} תחנות
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/schedule/${schedule.id}/result`)}
                    className="rounded-xl bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 active:bg-gray-600"
                  >
                    צפייה
                  </button>
                  <button
                    onClick={() => setConfirmDelete({ type: 'schedule', id: schedule.id, name: schedule.name || 'לוח שמירה זה' })}
                    className="rounded-xl bg-gray-700 px-3 py-1.5 text-xs font-medium text-red-400 active:bg-gray-600"
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

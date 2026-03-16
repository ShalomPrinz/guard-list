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
    return new Date(isoDate).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <h1 className="mb-6 text-2xl font-bold text-gray-100">Guard Duty Scheduler</h1>

      {/* Primary actions */}
      <div className="mb-8 flex flex-col gap-3">
        <button
          onClick={() => navigate('/schedule/new/step1')}
          className="w-full rounded-2xl bg-blue-600 py-4 text-base font-semibold text-white shadow-lg active:bg-blue-700"
        >
          + New Schedule
        </button>
        <button
          onClick={() => navigate('/statistics')}
          className="w-full rounded-2xl border border-gray-600 py-3 text-sm font-medium text-gray-300 active:bg-gray-800"
        >
          Statistics
        </button>
      </div>

      {/* Saved Groups */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-200">Saved Groups</h2>
          <button
            onClick={() => setShowCreateGroup(true)}
            className="rounded-xl bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 active:bg-gray-600"
          >
            + New Group
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-700 py-8 text-center text-sm text-gray-500">
            No groups yet. Create one to get started.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {groups.map(group => (
              <li key={group.id} className="flex items-center justify-between rounded-2xl bg-gray-800 px-4 py-3">
                <div>
                  <p className="font-medium text-gray-100">{group.name}</p>
                  <p className="text-xs text-gray-400">
                    {group.members.length} member{group.members.length !== 1 ? 's' : ''} ·{' '}
                    {group.members.filter(m => m.availability === 'base').length} base
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/group/${group.id}/edit`)}
                    className="rounded-xl bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 active:bg-gray-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirmDelete({ type: 'group', id: group.id, name: group.name })}
                    className="rounded-xl bg-gray-700 px-3 py-1.5 text-xs font-medium text-red-400 active:bg-gray-600"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Past Schedules */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-200">Past Schedules</h2>

        {schedules.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-700 py-8 text-center text-sm text-gray-500">
            No past schedules yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...schedules].reverse().map(schedule => (
              <li key={schedule.id} className="flex items-center justify-between rounded-2xl bg-gray-800 px-4 py-3">
                <div>
                  <p className="font-medium text-gray-100">{schedule.name || 'Unnamed'}</p>
                  <p className="text-xs text-gray-400">
                    {formatScheduleDate(schedule.createdAt)} · {schedule.stations.length} station{schedule.stations.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/schedule/${schedule.id}/result`)}
                    className="rounded-xl bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 active:bg-gray-600"
                  >
                    View
                  </button>
                  <button
                    onClick={() => setConfirmDelete({ type: 'schedule', id: schedule.id, name: schedule.name || 'this schedule' })}
                    className="rounded-xl bg-gray-700 px-3 py-1.5 text-xs font-medium text-red-400 active:bg-gray-600"
                  >
                    Delete
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
          message={`Delete "${confirmDelete.name}"?`}
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

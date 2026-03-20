import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStatistics, resetStatistics } from '../storage/statistics'
import { getCitations } from '../storage/citations'
import { getCitationAuthorLinks } from '../storage/citationAuthorLinks'
import { getGroups } from '../storage/groups'
import { formatAuthorName } from '../logic/citations'
import ConfirmDialog from '../components/ConfirmDialog'

function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}′`
  if (m === 0) return `${h}ש׳`
  return `${h}ש׳ ${m}′`
}

export default function StatisticsScreen() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(() => getStatistics())
  const [confirmReset, setConfirmReset] = useState(false)
  const [activeTab, setActiveTab] = useState<'guard-time' | 'citations'>('guard-time')

  // ── Guard-time tab data ────────────────────────────────────────────────────

  const guardRows = Object.entries(stats.participants)
    .map(([name, p]) => ({ name, totalShifts: p.totalShifts, totalMinutes: p.totalMinutes }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes)

  // ── Citations tab data ─────────────────────────────────────────────────────

  const allCitations = getCitations()
  const authorLinks = getCitationAuthorLinks()
  const allMembers = getGroups().flatMap(g => g.members)

  // Build per-member citation counts using links first, name-match fallback
  const memberCitationMap = new Map<string, { name: string; inDB: number; used: number }>()

  for (const citation of allCitations) {
    let memberId: string | undefined
    const linked = authorLinks[citation.author]

    if (linked && linked !== 'skip') {
      memberId = linked
    } else if (!linked) {
      // Fallback: format warrior names and compare
      const match = allMembers.find(m => formatAuthorName(m.name) === citation.author)
      if (match) memberId = match.id
    }

    if (!memberId) continue
    const member = allMembers.find(m => m.id === memberId)
    if (!member) continue

    const entry = memberCitationMap.get(memberId) ?? { name: member.name, inDB: 0, used: 0 }
    entry.inDB++
    if (citation.usedInListIds.length > 0) entry.used++
    memberCitationMap.set(memberId, entry)
  }

  const citationRows = Array.from(memberCitationMap.values()).sort((a, b) => b.inDB - a.inDB)

  function handleReset() {
    resetStatistics()
    setStats(getStatistics())
    setConfirmReset(false)
  }

  return (
    <div className="animate-fadein mx-auto max-w-lg px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="min-h-[44px] px-1 text-sm text-gray-500 dark:text-gray-400 active:text-gray-700 dark:active:text-gray-200"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">סטטיסטיקות</h1>
      </div>

      {/* Tab selector */}
      <div className="mb-4 flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        <button
          onClick={() => setActiveTab('guard-time')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            activeTab === 'guard-time'
              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          זמני שמירה
        </button>
        <button
          onClick={() => setActiveTab('citations')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            activeTab === 'citations'
              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          ציטוטים
        </button>
      </div>

      {/* Guard-time tab */}
      {activeTab === 'guard-time' && (
        <>
          {guardRows.length === 0 ? (
            <p className="text-center text-sm text-gray-500">אין נתונים עדיין. צור לוח שמירה כדי לצבור סטטיסטיקות.</p>
          ) : (
            <div className="mb-6 overflow-hidden rounded-2xl bg-white dark:bg-gray-800">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-gray-200 dark:border-gray-700 px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                <span>שם</span>
                <span className="text-center">משמרות</span>
                <span className="text-center">זמן שמירה</span>
                <span />
              </div>
              {guardRows.map((row, i) => (
                <div
                  key={row.name}
                  className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 px-4 py-3 text-sm ${
                    i < guardRows.length - 1 ? 'border-b border-gray-100 dark:border-gray-700/50' : ''
                  }`}
                >
                  <span className="truncate font-medium text-gray-900 dark:text-gray-100">{row.name}</span>
                  <span className="w-10 text-center tabular-nums text-gray-700 dark:text-gray-300">{row.totalShifts}</span>
                  <span className="w-16 text-center tabular-nums text-gray-700 dark:text-gray-300">{formatDuration(row.totalMinutes)}</span>
                  <button
                    onClick={() => navigate(`/statistics/${encodeURIComponent(row.name)}`)}
                    className="rounded-lg bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 active:bg-gray-200 dark:active:bg-gray-600"
                  >
                    היסטוריה
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setConfirmReset(true)}
            className="w-full rounded-2xl border border-red-300 dark:border-red-800 py-3 text-sm font-medium text-red-600 dark:text-red-400 active:bg-red-50 dark:active:bg-red-900/20"
          >
            איפוס כל הסטטיסטיקות
          </button>
        </>
      )}

      {/* Citations tab */}
      {activeTab === 'citations' && (
        <>
          {citationRows.length === 0 ? (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              אין ציטוטים משויכים עדיין. לאחר שימוש בציטוט מהאוסף, תישאל לשייך אותו ללוחם — ואז הנתונים יופיעו כאן.
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-white dark:bg-gray-800">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-gray-200 dark:border-gray-700 px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                <span>לוחם</span>
                <span className="text-center">באוסף</span>
                <span className="text-center">בשימוש</span>
              </div>
              {citationRows.map((row, i) => (
                <div
                  key={row.name}
                  className={`grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-3 text-sm ${
                    i < citationRows.length - 1 ? 'border-b border-gray-100 dark:border-gray-700/50' : ''
                  }`}
                >
                  <span className="truncate font-medium text-gray-900 dark:text-gray-100">{row.name}</span>
                  <span className="w-12 text-center tabular-nums text-gray-700 dark:text-gray-300">{row.inDB}</span>
                  <span className="w-12 text-center tabular-nums text-gray-700 dark:text-gray-300">{row.used}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {confirmReset && (
        <ConfirmDialog
          message="למחוק את כל הסטטיסטיקות?"
          onConfirm={handleReset}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  )
}

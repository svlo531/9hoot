'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BarChart3, Gamepad2, ChevronDown, ChevronRight, ArrowRight } from 'lucide-react'
import type { ReportEntry } from '@/app/(dashboard)/reports/page'

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatScore(score: number): string {
  return score.toLocaleString('en-US')
}

function toDateInputValue(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function ReportList({ reports }: { reports: ReportEntry[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(sessionId: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (confirmDelete !== sessionId) {
      setConfirmDelete(sessionId)
      return
    }

    setDeleting(true)
    const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
    setDeleting(false)
    setConfirmDelete(null)

    if (res.ok) {
      router.refresh()
    }
  }

  // Filter by search + date range
  const filtered = reports.filter(r => {
    if (search && !r.quizTitle.toLowerCase().includes(search.toLowerCase())) return false
    if (dateFrom) {
      const from = new Date(dateFrom)
      from.setHours(0, 0, 0, 0)
      if (new Date(r.date) < from) return false
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      if (new Date(r.date) > to) return false
    }
    return true
  })

  // Group by quiz title
  const groups = new Map<string, ReportEntry[]>()
  for (const r of filtered) {
    const existing = groups.get(r.quizTitle) || []
    existing.push(r)
    groups.set(r.quizTitle, existing)
  }

  function toggleGroup(title: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  const hasFilters = search || dateFrom || dateTo
  const totalFiltered = filtered.length

  if (reports.length === 0) {
    return (
      <div className="border-2 border-dashed border-mid-gray rounded-lg p-12 text-center">
        <div className="text-4xl mb-3"><BarChart3 size={36} className="mx-auto text-gray-text" /></div>
        <h2 className="text-lg font-bold text-dark-text mb-2">View reports here</h2>
        <p className="text-gray-text text-sm">Host a 9Hoot to see session reports</p>
      </div>
    )
  }

  return (
    <div>
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by quiz name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] max-w-sm h-10 px-3 text-sm border border-mid-gray rounded bg-white text-dark-text placeholder:text-gray-text focus:outline-none focus:border-blue-cta"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-text font-bold">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-10 px-2 text-sm border border-mid-gray rounded bg-white text-dark-text focus:outline-none focus:border-blue-cta"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-text font-bold">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-10 px-2 text-sm border border-mid-gray rounded bg-white text-dark-text focus:outline-none focus:border-blue-cta"
          />
        </div>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}
            className="text-xs text-blue-cta hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {hasFilters && (
        <p className="text-xs text-gray-text mb-3">{totalFiltered} session{totalFiltered !== 1 ? 's' : ''} found</p>
      )}

      {/* Grouped report list */}
      {filtered.length === 0 ? (
        <div className="border-2 border-dashed border-mid-gray rounded-lg p-12 text-center">
          <p className="text-gray-text text-sm">No reports match your filters</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {Array.from(groups.entries()).map(([title, sessions]) => {
            const isMultiple = sessions.length > 1
            const isExpanded = expandedGroups.has(title)
            const totalPlayers = sessions.reduce((sum, s) => sum + s.participantCount, 0)
            const avgOfAvg = sessions.length > 0
              ? Math.round(sessions.reduce((sum, s) => sum + s.avgScore, 0) / sessions.length)
              : 0
            const latestDate = sessions[0].date
            const coverUrl = sessions[0].coverImageUrl

            if (!isMultiple) {
              // Single session - render directly as a link
              const r = sessions[0]
              return (
                <Link
                  key={r.sessionId}
                  href={`/reports/${r.sessionId}`}
                  className="bg-white rounded-lg border border-mid-gray overflow-hidden hover:shadow-md transition-shadow flex items-stretch"
                >
                  <div className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 bg-gradient-to-br from-purple-primary to-blue-cta flex items-center justify-center">
                    {r.coverImageUrl ? (
                      <img src={r.coverImageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Gamepad2 size={24} className="text-white/80" />
                    )}
                  </div>
                  <div className="flex-1 p-3 sm:p-4 min-w-0 flex flex-col justify-center">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-dark-text text-sm truncate">{r.quizTitle}</h3>
                        <p className="text-gray-text text-xs mt-0.5">PIN: {r.pin}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-gray-text text-xs whitespace-nowrap hidden sm:block">
                          {formatDate(r.date)}
                        </span>
                        <button
                          onClick={(e) => handleDelete(r.sessionId, e)}
                          onMouseLeave={() => confirmDelete === r.sessionId && setConfirmDelete(null)}
                          disabled={deleting}
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            confirmDelete === r.sessionId
                              ? 'bg-red-600 text-white font-bold'
                              : 'text-gray-text hover:text-red-600 hover:bg-red-50'
                          }`}
                          title="Delete report"
                        >
                          {confirmDelete === r.sessionId ? (deleting ? '...' : 'Confirm?') : '✕'}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-text">
                      <span className="sm:hidden">{formatShortDate(r.date)}</span>
                      <span>{r.participantCount} {r.participantCount === 1 ? 'player' : 'players'}</span>
                      <span>&middot;</span>
                      <span>Avg: {formatScore(r.avgScore)}</span>
                      <span>&middot;</span>
                      <span>{r.questionCount} questions</span>
                    </div>
                  </div>
                </Link>
              )
            }

            // Multiple sessions - render as expandable group
            return (
              <div key={title} className="bg-white rounded-lg border border-mid-gray overflow-hidden">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(title)}
                  className="w-full flex items-stretch hover:bg-light-gray/50 transition-colors"
                >
                  <div className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 bg-gradient-to-br from-purple-primary to-blue-cta flex items-center justify-center">
                    {coverUrl ? (
                      <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Gamepad2 size={24} className="text-white/80" />
                    )}
                  </div>
                  <div className="flex-1 p-3 sm:p-4 min-w-0 flex flex-col justify-center text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-dark-text text-sm truncate">
                          {title}
                          <span className="ml-2 text-xs font-normal text-gray-text bg-light-gray px-2 py-0.5 rounded-full">
                            {sessions.length} sessions
                          </span>
                        </h3>
                        <p className="text-gray-text text-xs mt-0.5">Latest: {formatShortDate(latestDate)}</p>
                      </div>
                      <span className="text-gray-text flex-shrink-0">{isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-text">
                      <span>{totalPlayers} total players</span>
                      <span>&middot;</span>
                      <span>Avg: {formatScore(avgOfAvg)}</span>
                    </div>
                  </div>
                </button>

                {/* Expanded sessions */}
                {isExpanded && (
                  <div className="border-t border-mid-gray">
                    {sessions.map((r) => (
                      <Link
                        key={r.sessionId}
                        href={`/reports/${r.sessionId}`}
                        className="flex items-center gap-4 px-4 sm:px-6 py-3 hover:bg-light-gray/50 transition-colors border-b border-mid-gray last:border-b-0"
                      >
                        <div className="w-1.5 h-10 rounded-full bg-purple-primary/20 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-dark-text font-medium truncate">PIN: {r.pin}</p>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs text-gray-text whitespace-nowrap">{formatDate(r.date)}</span>
                              <button
                                onClick={(e) => handleDelete(r.sessionId, e)}
                                onMouseLeave={() => confirmDelete === r.sessionId && setConfirmDelete(null)}
                                disabled={deleting}
                                className={`text-xs px-2 py-1 rounded transition-colors ${
                                  confirmDelete === r.sessionId
                                    ? 'bg-red-600 text-white font-bold'
                                    : 'text-gray-text hover:text-red-600 hover:bg-red-50'
                                }`}
                                title="Delete report"
                              >
                                {confirmDelete === r.sessionId ? (deleting ? '...' : 'Confirm?') : '✕'}
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-text">
                            <span>{r.participantCount} {r.participantCount === 1 ? 'player' : 'players'}</span>
                            <span>&middot;</span>
                            <span>Avg: {formatScore(r.avgScore)}</span>
                            <span>&middot;</span>
                            <span>{r.questionCount} questions</span>
                          </div>
                        </div>
                        <ArrowRight size={16} className="text-gray-text" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

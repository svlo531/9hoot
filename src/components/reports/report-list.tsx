'use client'

import { useState } from 'react'
import Link from 'next/link'
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

function formatScore(score: number): string {
  return score.toLocaleString('en-US')
}

export function ReportList({ reports }: { reports: ReportEntry[] }) {
  const [search, setSearch] = useState('')

  const filtered = reports.filter(r =>
    r.quizTitle.toLowerCase().includes(search.toLowerCase())
  )

  if (reports.length === 0) {
    return (
      <div className="border-2 border-dashed border-mid-gray rounded-lg p-12 text-center">
        <div className="text-4xl mb-3">📊</div>
        <h2 className="text-lg font-bold text-dark-text mb-2">View reports here</h2>
        <p className="text-gray-text text-sm">Host a 9Hoot to see session reports</p>
      </div>
    )
  }

  return (
    <div>
      {/* Search bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by quiz name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm h-10 px-3 text-sm border border-mid-gray rounded bg-white text-dark-text placeholder:text-gray-text focus:outline-none focus:border-blue-cta"
        />
      </div>

      {/* Report list */}
      {filtered.length === 0 ? (
        <div className="border-2 border-dashed border-mid-gray rounded-lg p-12 text-center">
          <p className="text-gray-text text-sm">No reports match your search</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((report) => (
            <Link
              key={report.sessionId}
              href={`/reports/${report.sessionId}`}
              className="bg-white rounded-lg border border-mid-gray overflow-hidden hover:shadow-md transition-shadow flex items-stretch"
            >
              {/* Cover image */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 bg-gradient-to-br from-purple-primary to-blue-cta flex items-center justify-center">
                {report.coverImageUrl ? (
                  <img
                    src={report.coverImageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl">🎮</span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 p-3 sm:p-4 min-w-0 flex flex-col justify-center">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-dark-text text-sm truncate">
                      {report.quizTitle}
                    </h3>
                    <p className="text-gray-text text-xs mt-0.5">
                      PIN: {report.pin}
                    </p>
                  </div>
                  <span className="text-gray-text text-xs whitespace-nowrap flex-shrink-0 hidden sm:block">
                    {formatDate(report.date)}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-2 text-xs text-gray-text">
                  <span className="sm:hidden">{formatDate(report.date)}</span>
                  <span>{report.participantCount} {report.participantCount === 1 ? 'player' : 'players'}</span>
                  <span>&middot;</span>
                  <span>Avg: {formatScore(report.avgScore)}</span>
                  <span>&middot;</span>
                  <span>{report.questionCount} {report.questionCount === 1 ? 'question' : 'questions'}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useMemo, Fragment } from 'react'
import Link from 'next/link'
import type { QuestionType } from '@/lib/types'
import { ANSWER_SHAPES } from '@/lib/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  session: Record<string, unknown>
  quiz: Record<string, unknown> | null
  questions: Record<string, unknown>[]
  participants: Record<string, unknown>[]
  answers: Record<string, unknown>[]
}

type Tab = 'summary' | 'per-question' | 'per-participant'

type SortField = 'rank' | 'nickname' | 'score' | 'correct' | 'incorrect' | 'avgTime'
type SortDir = 'asc' | 'desc'

// Non-scored question types (no correct/incorrect logic)
const NON_SCORED_TYPES: QuestionType[] = [
  'poll',
  'word_cloud',
  'brainstorm',
  'open_ended',
  'nps_survey',
  'content_slide',
]

// Human-readable labels for question types
const TYPE_LABELS: Record<string, string> = {
  quiz: 'Quiz',
  true_false: 'True / False',
  type_answer: 'Type Answer',
  slider: 'Slider',
  puzzle: 'Puzzle',
  poll: 'Poll',
  word_cloud: 'Word Cloud',
  brainstorm: 'Brainstorm',
  open_ended: 'Open-ended',
  nps_survey: 'NPS / Survey',
  image_reveal: 'Image Reveal',
  content_slide: 'Content Slide',
}

// Badge colours per type category
function typeBadgeColor(type: string): string {
  if (['quiz', 'true_false', 'type_answer', 'slider', 'puzzle', 'image_reveal'].includes(type)) {
    return 'bg-blue-cta text-white'
  }
  if (['poll', 'word_cloud', 'brainstorm', 'open_ended', 'nps_survey'].includes(type)) {
    return 'bg-teal-accent text-white'
  }
  return 'bg-gray-text text-white'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTime(ms: number | null | undefined): string {
  if (ms == null || isNaN(ms)) return '-'
  return (ms / 1000).toFixed(1) + 's'
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function pct(n: number, d: number): number {
  if (d === 0) return 0
  return Math.round((n / d) * 100)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SessionReport({ session, quiz, questions, participants, answers }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('summary')
  const [sortField, setSortField] = useState<SortField>('rank')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null)

  // ---------- Derived data ----------

  const totalPlayers = participants.length
  const totalQuestions = questions.length

  const avgScore = useMemo(() => {
    if (totalPlayers === 0) return 0
    const sum = participants.reduce((acc, p) => acc + ((p.total_score as number) || 0), 0)
    return Math.round(sum / totalPlayers)
  }, [participants, totalPlayers])

  const completionRate = useMemo(() => {
    if (totalPlayers === 0) return 0
    const withAnswers = new Set(answers.map((a) => a.participant_id as string))
    return pct(withAnswers.size, totalPlayers)
  }, [answers, totalPlayers])

  // Answers grouped by question_id
  const answersByQuestion = useMemo(() => {
    const map: Record<string, Record<string, unknown>[]> = {}
    for (const a of answers) {
      const qid = a.question_id as string
      if (!map[qid]) map[qid] = []
      map[qid].push(a)
    }
    return map
  }, [answers])

  // Answers grouped by participant_id
  const answersByParticipant = useMemo(() => {
    const map: Record<string, Record<string, unknown>[]> = {}
    for (const a of answers) {
      const pid = a.participant_id as string
      if (!map[pid]) map[pid] = []
      map[pid].push(a)
    }
    return map
  }, [answers])

  // Question lookup
  const questionById = useMemo(() => {
    const map: Record<string, Record<string, unknown>> = {}
    for (const q of questions) map[q.id as string] = q
    return map
  }, [questions])

  // Top 3 for podium
  const top3 = useMemo(() => {
    return [...participants]
      .sort((a, b) => ((b.total_score as number) || 0) - ((a.total_score as number) || 0))
      .slice(0, 3)
  }, [participants])

  // Score distribution for histogram
  const scoreDistribution = useMemo(() => {
    if (totalPlayers === 0) return []
    const scores = participants.map((p) => (p.total_score as number) || 0)
    const maxScore = Math.max(...scores, 1)
    const bucketCount = Math.min(8, totalPlayers)
    const bucketSize = Math.ceil(maxScore / bucketCount) || 1
    const buckets: { label: string; count: number }[] = []
    for (let i = 0; i < bucketCount; i++) {
      const lo = i * bucketSize
      const hi = lo + bucketSize - 1
      buckets.push({
        label: `${lo.toLocaleString()}-${hi.toLocaleString()}`,
        count: scores.filter((s) => s >= lo && s <= hi).length,
      })
    }
    // Remove trailing empty buckets
    while (buckets.length > 1 && buckets[buckets.length - 1].count === 0) buckets.pop()
    return buckets
  }, [participants, totalPlayers])

  // NPS calculation (for nps_survey questions)
  const npsData = useMemo(() => {
    const npsQuestions = questions.filter((q) => q.type === 'nps_survey')
    if (npsQuestions.length === 0) return null

    let detractors = 0
    let passives = 0
    let promoters = 0
    let total = 0

    for (const q of npsQuestions) {
      const qAnswers = answersByQuestion[q.id as string] || []
      for (const a of qAnswers) {
        const data = a.answer_data as Record<string, unknown>
        const value = data?.value as number | undefined
        if (value == null) continue
        total++
        if (value <= 6) detractors++
        else if (value <= 8) passives++
        else promoters++
      }
    }

    if (total === 0) return null
    const score = Math.round(((promoters - detractors) / total) * 100)
    return { score, detractors, passives, promoters, total }
  }, [questions, answersByQuestion])

  // Sorted participant table
  const sortedParticipants = useMemo(() => {
    const list = participants.map((p, idx) => {
      const pAnswers = answersByParticipant[p.id as string] || []
      const correct = pAnswers.filter((a) => a.is_correct === true).length
      const incorrect = pAnswers.filter((a) => a.is_correct === false).length
      const times = pAnswers.map((a) => a.time_taken_ms as number | null).filter((t): t is number => t != null)
      const avgTime = times.length > 0 ? times.reduce((s, t) => s + t, 0) / times.length : null
      return {
        id: p.id as string,
        rank: idx + 1,
        nickname: (p.nickname as string) || 'Anonymous',
        score: (p.total_score as number) || 0,
        correct,
        incorrect,
        avgTime,
      }
    })

    list.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'rank':
          cmp = a.rank - b.rank
          break
        case 'nickname':
          cmp = a.nickname.localeCompare(b.nickname)
          break
        case 'score':
          cmp = a.score - b.score
          break
        case 'correct':
          cmp = a.correct - b.correct
          break
        case 'incorrect':
          cmp = a.incorrect - b.incorrect
          break
        case 'avgTime':
          cmp = (a.avgTime ?? Infinity) - (b.avgTime ?? Infinity)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [participants, answersByParticipant, sortField, sortDir])

  // ---------- Handlers ----------

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'nickname' ? 'asc' : 'desc')
    }
  }

  // ---------- Render helpers ----------

  function renderSortArrow(field: SortField) {
    if (sortField !== field) return null
    return <span className="ml-1 text-xs">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
  }

  // ---------- Tab: Summary ----------

  function renderSummary() {
    return (
      <div className="space-y-6">
        {/* NPS section */}
        {npsData && (
          <div className="bg-white rounded-lg border border-mid-gray p-4">
            <h3 className="text-sm font-bold text-gray-text uppercase tracking-wide mb-3">NPS Score</h3>
            <div className="flex items-center gap-6 flex-wrap">
              <div
                className={`text-4xl font-bold ${
                  npsData.score >= 50 ? 'text-correct-green' : npsData.score >= 0 ? 'text-yellow-accent' : 'text-answer-red'
                }`}
              >
                {npsData.score}
              </div>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="inline-block w-3 h-3 rounded-full bg-correct-green mr-1" />
                  Promoters: {npsData.promoters} ({pct(npsData.promoters, npsData.total)}%)
                </div>
                <div>
                  <span className="inline-block w-3 h-3 rounded-full bg-yellow-accent mr-1" />
                  Passives: {npsData.passives} ({pct(npsData.passives, npsData.total)}%)
                </div>
                <div>
                  <span className="inline-block w-3 h-3 rounded-full bg-answer-red mr-1" />
                  Detractors: {npsData.detractors} ({pct(npsData.detractors, npsData.total)}%)
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top 3 podium */}
        {top3.length > 0 && (
          <div className="bg-white rounded-lg border border-mid-gray p-4">
            <h3 className="text-sm font-bold text-gray-text uppercase tracking-wide mb-4">Top Players</h3>
            <div className="flex items-end justify-center gap-4">
              {/* 2nd place */}
              {top3.length >= 2 && (
                <div className="flex flex-col items-center">
                  <div className="text-silver text-2xl font-bold mb-1">2nd</div>
                  <div className="w-20 h-20 bg-silver/20 rounded-lg flex items-center justify-center border-2 border-silver">
                    <span className="text-lg font-bold text-dark-text truncate px-1">
                      {(top3[1].nickname as string) || '?'}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-dark-text mt-1">
                    {((top3[1].total_score as number) || 0).toLocaleString()}
                  </div>
                </div>
              )}
              {/* 1st place */}
              {top3.length >= 1 && (
                <div className="flex flex-col items-center">
                  <div className="text-gold text-2xl font-bold mb-1">1st</div>
                  <div className="w-24 h-24 bg-gold/20 rounded-lg flex items-center justify-center border-2 border-gold">
                    <span className="text-lg font-bold text-dark-text truncate px-1">
                      {(top3[0].nickname as string) || '?'}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-dark-text mt-1">
                    {((top3[0].total_score as number) || 0).toLocaleString()}
                  </div>
                </div>
              )}
              {/* 3rd place */}
              {top3.length >= 3 && (
                <div className="flex flex-col items-center">
                  <div className="text-bronze text-2xl font-bold mb-1">3rd</div>
                  <div className="w-18 h-18 bg-bronze/20 rounded-lg flex items-center justify-center border-2 border-bronze"
                    style={{ width: '4.5rem', height: '4.5rem' }}
                  >
                    <span className="text-lg font-bold text-dark-text truncate px-1">
                      {(top3[2].nickname as string) || '?'}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-dark-text mt-1">
                    {((top3[2].total_score as number) || 0).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Score distribution histogram */}
        {scoreDistribution.length > 0 && (
          <div className="bg-white rounded-lg border border-mid-gray p-4">
            <h3 className="text-sm font-bold text-gray-text uppercase tracking-wide mb-4">Score Distribution</h3>
            <div className="flex items-end gap-2 h-40">
              {scoreDistribution.map((bucket, i) => {
                const maxCount = Math.max(...scoreDistribution.map((b) => b.count), 1)
                const heightPct = (bucket.count / maxCount) * 100
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div className="text-xs font-bold text-dark-text mb-1">{bucket.count}</div>
                    <div
                      className="w-full bg-purple-primary rounded-t-md transition-all"
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                    />
                    <div className="text-[10px] text-gray-text mt-1 truncate w-full text-center">{bucket.label}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {totalPlayers === 0 && (
          <div className="border-2 border-dashed border-mid-gray rounded-lg p-12 text-center">
            <h2 className="text-lg font-bold text-dark-text mb-2">No participants</h2>
            <p className="text-gray-text text-sm">This session had no players join.</p>
          </div>
        )}
      </div>
    )
  }

  // ---------- Tab: Per Question ----------

  function renderPerQuestion() {
    if (questions.length === 0) {
      return (
        <div className="border-2 border-dashed border-mid-gray rounded-lg p-12 text-center">
          <h2 className="text-lg font-bold text-dark-text mb-2">No questions</h2>
          <p className="text-gray-text text-sm">This quiz has no questions.</p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {questions.map((q, idx) => {
          const qid = q.id as string
          const type = q.type as QuestionType
          const qAnswers = answersByQuestion[qid] || []
          const isNonScored = NON_SCORED_TYPES.includes(type)
          const options = q.options as Record<string, unknown>[] | null
          const correctAnswers = q.correct_answers as unknown

          // Correct rate
          const correctCount = qAnswers.filter((a) => a.is_correct === true).length
          const correctRate = pct(correctCount, qAnswers.length)

          // Avg response time
          const times = qAnswers
            .map((a) => a.time_taken_ms as number | null)
            .filter((t): t is number => t != null)
          const avgTime = times.length > 0 ? times.reduce((s, t) => s + t, 0) / times.length : null

          return (
            <div key={qid} className="bg-white rounded-lg border border-mid-gray p-4">
              {/* Question header */}
              <div className="flex items-start gap-3 mb-3 flex-wrap">
                <div className="text-sm font-bold text-gray-text">Q{idx + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-dark-text">
                    {(q.question_text as string) || '(No text)'}
                  </div>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeBadgeColor(type)}`}>
                  {TYPE_LABELS[type] || type}
                </span>
              </div>

              {/* Stats row */}
              <div className="flex gap-4 text-sm mb-3 flex-wrap">
                {!isNonScored && (
                  <div className={correctRate >= 50 ? 'text-correct-green font-bold' : 'text-incorrect-red font-bold'}>
                    {correctRate}% correct
                  </div>
                )}
                <div className="text-gray-text">
                  {qAnswers.length} response{qAnswers.length !== 1 ? 's' : ''}
                </div>
                {avgTime != null && (
                  <div className="text-gray-text">Avg time: {fmtTime(avgTime)}</div>
                )}
              </div>

              {/* Answer distribution */}
              {renderAnswerDistribution(type, qAnswers, options, correctAnswers)}
            </div>
          )
        })}
      </div>
    )
  }

  function renderAnswerDistribution(
    type: QuestionType,
    qAnswers: Record<string, unknown>[],
    options: Record<string, unknown>[] | null,
    correctAnswers: unknown
  ) {
    // Content slide - no responses
    if (type === 'content_slide') {
      return <div className="text-sm text-gray-text italic">No responses (info slide)</div>
    }

    // Quiz - horizontal bars per option
    if (type === 'quiz') {
      const optionList = (options as { text: string }[]) || []
      const correctIndices = (correctAnswers as number[]) || []
      const counts: number[] = optionList.map(() => 0)
      for (const a of qAnswers) {
        const data = a.answer_data as Record<string, unknown>
        const selected = (data?.selectedIndices as number[]) || []
        for (const i of selected) {
          if (i >= 0 && i < counts.length) counts[i]++
        }
      }
      const maxCount = Math.max(...counts, 1)
      return (
        <div className="space-y-2">
          {optionList.map((opt, i) => {
            const isCorrect = correctIndices.includes(i)
            const widthPct = pct(counts[i], maxCount)
            const shape = ANSWER_SHAPES[i]
            return (
              <div key={i} className="flex items-center gap-2">
                {shape && (
                  <span className="text-sm" style={{ color: shape.color }}>
                    {shape.symbol}
                  </span>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm text-dark-text truncate">{opt.text || `Option ${i + 1}`}</span>
                    {isCorrect && <span className="text-xs text-correct-green font-bold">(Correct)</span>}
                  </div>
                  <div className="h-5 bg-light-gray rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isCorrect ? 'bg-correct-green' : 'bg-mid-gray'}`}
                      style={{ width: `${Math.max(widthPct, 2)}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm font-bold text-dark-text w-8 text-right">{counts[i]}</span>
              </div>
            )
          })}
        </div>
      )
    }

    // True/False - horizontal bars
    if (type === 'true_false') {
      const correctVal = (correctAnswers as boolean[])?.[0]
      const trueCount = qAnswers.filter((a) => (a.answer_data as Record<string, unknown>)?.selected === true).length
      const falseCount = qAnswers.filter((a) => (a.answer_data as Record<string, unknown>)?.selected === false).length
      const maxCount = Math.max(trueCount, falseCount, 1)
      const items = [
        { label: 'True', count: trueCount, isCorrect: correctVal === true },
        { label: 'False', count: falseCount, isCorrect: correctVal === false },
      ]
      return (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm text-dark-text">{item.label}</span>
                  {item.isCorrect && <span className="text-xs text-correct-green font-bold">(Correct)</span>}
                </div>
                <div className="h-5 bg-light-gray rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${item.isCorrect ? 'bg-correct-green' : 'bg-mid-gray'}`}
                    style={{ width: `${Math.max(pct(item.count, maxCount), 2)}%` }}
                  />
                </div>
              </div>
              <span className="text-sm font-bold text-dark-text w-8 text-right">{item.count}</span>
            </div>
          ))}
        </div>
      )
    }

    // Type answer / Image reveal - list of submitted answers with counts
    if (type === 'type_answer' || type === 'image_reveal') {
      const textCounts: Record<string, { count: number; correct: boolean }> = {}
      for (const a of qAnswers) {
        const data = a.answer_data as Record<string, unknown>
        const text = ((data?.text as string) || '').trim() || '(empty)'
        const key = text.toLowerCase()
        if (!textCounts[key]) textCounts[key] = { count: 0, correct: a.is_correct === true }
        textCounts[key].count++
        if (a.is_correct === true) textCounts[key].correct = true
      }
      const sorted = Object.entries(textCounts).sort((a, b) => b[1].count - a[1].count)
      const maxCount = sorted.length > 0 ? sorted[0][1].count : 1
      return (
        <div className="space-y-2">
          {sorted.slice(0, 10).map(([text, { count, correct }]) => (
            <div key={text} className="flex items-center gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm text-dark-text">{text}</span>
                  {correct && <span className="text-xs text-correct-green font-bold">(Correct)</span>}
                </div>
                <div className="h-5 bg-light-gray rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${correct ? 'bg-correct-green' : 'bg-mid-gray'}`}
                    style={{ width: `${Math.max(pct(count, maxCount), 2)}%` }}
                  />
                </div>
              </div>
              <span className="text-sm font-bold text-dark-text w-8 text-right">{count}</span>
            </div>
          ))}
          {sorted.length > 10 && (
            <div className="text-xs text-gray-text">...and {sorted.length - 10} more unique answers</div>
          )}
        </div>
      )
    }

    // Slider - avg value vs correct value
    if (type === 'slider') {
      const correct = correctAnswers as { value: number; margin?: number } | null
      const values = qAnswers
        .map((a) => (a.answer_data as Record<string, unknown>)?.value as number | undefined)
        .filter((v): v is number => v != null)
      const avgVal = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null
      return (
        <div className="text-sm space-y-1">
          {avgVal != null && (
            <div className="text-dark-text">
              Average response: <span className="font-bold">{avgVal.toFixed(1)}</span>
            </div>
          )}
          {correct && (
            <div className="text-gray-text">
              Correct value: <span className="font-bold">{correct.value}</span>
              {correct.margin != null && correct.margin > 0 && <span> (+/- {correct.margin})</span>}
            </div>
          )}
          {values.length === 0 && <div className="text-gray-text italic">No responses</div>}
        </div>
      )
    }

    // Puzzle - % got correct order
    if (type === 'puzzle') {
      const correctCount = qAnswers.filter((a) => a.is_correct === true).length
      const rate = pct(correctCount, qAnswers.length)
      return (
        <div className="text-sm">
          <span className={rate >= 50 ? 'text-correct-green font-bold' : 'text-incorrect-red font-bold'}>
            {rate}% got correct order
          </span>
          <span className="text-gray-text ml-2">({correctCount}/{qAnswers.length})</span>
        </div>
      )
    }

    // NPS Survey - score breakdown
    if (type === 'nps_survey') {
      const buckets: Record<number, number> = {}
      for (const a of qAnswers) {
        const val = (a.answer_data as Record<string, unknown>)?.value as number | undefined
        if (val != null) buckets[val] = (buckets[val] || 0) + 1
      }
      const maxCount = Math.max(...Object.values(buckets), 1)
      return (
        <div className="space-y-1">
          <div className="flex items-end gap-1 h-20">
            {Array.from({ length: 11 }, (_, i) => {
              const count = buckets[i] || 0
              const heightPct = (count / maxCount) * 100
              const color = i <= 6 ? 'bg-answer-red' : i <= 8 ? 'bg-yellow-accent' : 'bg-correct-green'
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                  {count > 0 && <div className="text-[10px] font-bold text-dark-text mb-0.5">{count}</div>}
                  <div
                    className={`w-full rounded-t ${color} transition-all`}
                    style={{ height: `${Math.max(heightPct, count > 0 ? 4 : 0)}%` }}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 11 }, (_, i) => (
              <div key={i} className="flex-1 text-center text-[10px] text-gray-text">
                {i}
              </div>
            ))}
          </div>
        </div>
      )
    }

    // Poll / Word Cloud / Open-ended / Brainstorm - response summary
    if (type === 'poll') {
      // Show option counts with bars (same as quiz but no correct marking)
      const optionList = (options as { text: string }[]) || []
      if (optionList.length > 0) {
        const counts: number[] = optionList.map(() => 0)
        for (const a of qAnswers) {
          const data = a.answer_data as Record<string, unknown>
          const selected = (data?.selectedIndices as number[]) || []
          for (const i of selected) {
            if (i >= 0 && i < counts.length) counts[i]++
          }
        }
        const maxCount = Math.max(...counts, 1)
        return (
          <div className="space-y-2">
            {optionList.map((opt, i) => {
              const widthPct = pct(counts[i], maxCount)
              const shape = ANSWER_SHAPES[i]
              return (
                <div key={i} className="flex items-center gap-2">
                  {shape && (
                    <span className="text-sm" style={{ color: shape.color }}>
                      {shape.symbol}
                    </span>
                  )}
                  <div className="flex-1">
                    <div className="text-sm text-dark-text mb-0.5 truncate">{opt.text || `Option ${i + 1}`}</div>
                    <div className="h-5 bg-light-gray rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all bg-blue-cta"
                        style={{ width: `${Math.max(widthPct, 2)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-dark-text w-8 text-right">{counts[i]}</span>
                </div>
              )
            })}
          </div>
        )
      }
    }

    // Word cloud / open-ended / brainstorm - list of text responses
    if (type === 'word_cloud' || type === 'open_ended' || type === 'brainstorm' || (type === 'poll' && !(options as unknown[])?.[0])) {
      const textCounts: Record<string, number> = {}
      for (const a of qAnswers) {
        const data = a.answer_data as Record<string, unknown>
        const text = ((data?.text as string) || '').trim() || '(empty)'
        const key = text.toLowerCase()
        textCounts[key] = (textCounts[key] || 0) + 1
      }
      const sorted = Object.entries(textCounts).sort((a, b) => b[1] - a[1])
      return (
        <div className="space-y-1">
          {sorted.slice(0, 15).map(([text, count]) => (
            <div key={text} className="flex justify-between items-center text-sm">
              <span className="text-dark-text truncate mr-2">{text}</span>
              <span className="text-gray-text font-bold flex-shrink-0">{count}</span>
            </div>
          ))}
          {sorted.length > 15 && (
            <div className="text-xs text-gray-text">...and {sorted.length - 15} more</div>
          )}
          {sorted.length === 0 && <div className="text-sm text-gray-text italic">No responses</div>}
        </div>
      )
    }

    return <div className="text-sm text-gray-text italic">No responses</div>
  }

  // ---------- Tab: Per Participant ----------

  function renderPerParticipant() {
    if (sortedParticipants.length === 0) {
      return (
        <div className="border-2 border-dashed border-mid-gray rounded-lg p-12 text-center">
          <h2 className="text-lg font-bold text-dark-text mb-2">No participants</h2>
          <p className="text-gray-text text-sm">No players joined this session.</p>
        </div>
      )
    }

    return (
      <div className="bg-white rounded-lg border border-mid-gray overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mid-gray bg-light-gray">
                {(
                  [
                    ['rank', 'Rank'],
                    ['nickname', 'Nickname'],
                    ['score', 'Score'],
                    ['correct', 'Correct'],
                    ['incorrect', 'Incorrect'],
                    ['avgTime', 'Avg Time'],
                  ] as [SortField, string][]
                ).map(([field, label]) => (
                  <th
                    key={field}
                    className="px-4 py-3 text-left font-bold text-gray-text cursor-pointer hover:text-dark-text select-none"
                    onClick={() => toggleSort(field)}
                  >
                    {label}
                    {renderSortArrow(field)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedParticipants.map((p) => {
                const isExpanded = expandedParticipant === p.id
                const pAnswers = answersByParticipant[p.id] || []
                return (
                  <Fragment key={p.id}>
                    <tr
                      className="border-b border-mid-gray hover:bg-light-gray/50 cursor-pointer transition-colors"
                      onClick={() => setExpandedParticipant(isExpanded ? null : p.id)}
                    >
                      <td className="px-4 py-3 font-bold text-gray-text">{p.rank}</td>
                      <td className="px-4 py-3 font-bold text-dark-text">{p.nickname}</td>
                      <td className="px-4 py-3 font-bold text-dark-text">{p.score.toLocaleString()}</td>
                      <td className="px-4 py-3 text-correct-green font-bold">{p.correct}</td>
                      <td className="px-4 py-3 text-incorrect-red font-bold">{p.incorrect}</td>
                      <td className="px-4 py-3 text-gray-text">{fmtTime(p.avgTime)}</td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="px-4 py-3 bg-light-gray">
                          {renderParticipantBreakdown(pAnswers)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-mid-gray">
          {sortedParticipants.map((p) => {
            const isExpanded = expandedParticipant === p.id
            const pAnswers = answersByParticipant[p.id] || []
            return (
              <div key={p.id}>
                <div
                  className="p-4 cursor-pointer active:bg-light-gray/50"
                  onClick={() => setExpandedParticipant(isExpanded ? null : p.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-text">#{p.rank}</span>
                      <span className="font-bold text-dark-text">{p.nickname}</span>
                    </div>
                    <span className="font-bold text-dark-text">{p.score.toLocaleString()} pts</span>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="text-correct-green font-bold">{p.correct} correct</span>
                    <span className="text-incorrect-red font-bold">{p.incorrect} incorrect</span>
                    <span className="text-gray-text">Avg {fmtTime(p.avgTime)}</span>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4">
                    {renderParticipantBreakdown(pAnswers)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderParticipantBreakdown(pAnswers: Record<string, unknown>[]) {
    if (questions.length === 0) {
      return <div className="text-sm text-gray-text italic">No questions</div>
    }

    return (
      <div className="space-y-2">
        {questions.map((q, idx) => {
          const qid = q.id as string
          const type = q.type as QuestionType
          const answer = pAnswers.find((a) => a.question_id === qid)
          const isNonScored = NON_SCORED_TYPES.includes(type)

          return (
            <div key={qid} className="flex items-start gap-2 text-sm">
              <span className="text-gray-text font-bold flex-shrink-0 w-8">Q{idx + 1}</span>
              {answer ? (
                <div className="flex-1 flex items-center gap-2 flex-wrap">
                  {!isNonScored && (
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        answer.is_correct ? 'bg-correct-green/20 text-correct-green' : 'bg-incorrect-red/20 text-incorrect-red'
                      }`}
                    >
                      {answer.is_correct ? 'Correct' : 'Incorrect'}
                    </span>
                  )}
                  <span className="text-dark-text">
                    {((answer.points_awarded as number) || 0).toLocaleString()} pts
                  </span>
                  <span className="text-gray-text">{fmtTime(answer.time_taken_ms as number | null)}</span>
                </div>
              ) : (
                <span className="text-gray-text italic">No answer</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ---------- Main render ----------

  const tabs: { key: Tab; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'per-question', label: 'Per Question' },
    { key: 'per-participant', label: 'Per Participant' },
  ]

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/reports"
          className="text-sm text-blue-cta hover:underline inline-flex items-center gap-1 mb-3"
        >
          <span>&larr;</span> All Reports
        </Link>
        <h1 className="text-xl font-bold text-dark-text">
          {(quiz?.title as string) || 'Untitled Quiz'}
        </h1>
        <div className="flex items-center gap-3 text-sm text-gray-text mt-1 flex-wrap">
          <span>{fmtDate(session.started_at as string | null)}</span>
          <span className="text-mid-gray">|</span>
          <span>PIN: {(session.pin as string) || '-'}</span>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Players', value: totalPlayers.toLocaleString() },
          { label: 'Avg Score', value: avgScore.toLocaleString() },
          { label: 'Completion Rate', value: `${completionRate}%` },
          { label: 'Total Questions', value: totalQuestions.toLocaleString() },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg border border-mid-gray p-4">
            <div className="text-xs text-gray-text uppercase tracking-wide">{stat.label}</div>
            <div className="text-2xl font-bold text-dark-text mt-1">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              activeTab === tab.key
                ? 'bg-purple-primary text-white'
                : 'bg-light-gray text-gray-text hover:bg-mid-gray'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'summary' && renderSummary()}
      {activeTab === 'per-question' && renderPerQuestion()}
      {activeTab === 'per-participant' && renderPerParticipant()}
    </div>
  )
}


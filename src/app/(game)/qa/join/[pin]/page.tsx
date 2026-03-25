'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface QAQuestion {
  id: string
  question_text: string
  upvotes: number
  is_answered: boolean
  created_at: string
}

export default function QAPlayerPage() {
  const { pin } = useParams<{ pin: string }>()
  const [phase, setPhase] = useState<'nickname' | 'qa'>('nickname')
  const [nickname, setNickname] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<QAQuestion[]>([])
  const [newQuestion, setNewQuestion] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [upvoted, setUpvoted] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  // Load questions + real-time
  useEffect(() => {
    if (!sessionId) return

    async function load() {
      const { data } = await supabase
        .from('qa_questions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('is_hidden', false)
        .order('upvotes', { ascending: false })
      if (data) setQuestions(data)
    }

    load()

    const channel = supabase
      .channel(`qa-player-standalone-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qa_questions', filter: `session_id=eq.${sessionId}` }, () => load())
      .subscribe()

    const poll = setInterval(load, 3000)
    return () => { channel.unsubscribe(); clearInterval(poll) }
  }, [sessionId])

  // Load upvotes
  useEffect(() => {
    if (!participantId) return
    async function loadUpvotes() {
      const { data } = await supabase.from('qa_upvotes').select('qa_question_id').eq('participant_id', participantId)
      if (data) setUpvoted(new Set(data.map((u: { qa_question_id: string }) => u.qa_question_id)))
    }
    loadUpvotes()
  }, [participantId])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!nickname.trim()) return
    setError(null)

    const { data: session } = await supabase
      .from('sessions').select('id').eq('pin', pin).neq('status', 'completed').single()

    if (!session) { setError('Session not found'); return }

    const { data: participant, error: err } = await supabase
      .from('participants')
      .insert({ session_id: session.id, nickname: nickname.trim() })
      .select().single()

    if (err || !participant) { setError('Failed to join'); return }

    setSessionId(session.id)
    setParticipantId(participant.id)
    setPhase('qa')
  }

  async function submitQuestion(e: React.FormEvent) {
    e.preventDefault()
    if (!newQuestion.trim() || submitting || !sessionId || !participantId) return
    setSubmitting(true)

    await supabase.from('qa_questions').insert({
      session_id: sessionId,
      participant_id: participantId,
      question_text: newQuestion.trim(),
      upvotes: 0,
      is_answered: false,
      is_hidden: false,
    })

    setNewQuestion('')
    setSubmitting(false)
  }

  async function toggleUpvote(questionId: string) {
    if (!participantId) return
    const alreadyUpvoted = upvoted.has(questionId)

    if (alreadyUpvoted) {
      await supabase.from('qa_upvotes').delete().eq('qa_question_id', questionId).eq('participant_id', participantId)
      await supabase.from('qa_questions').update({ upvotes: Math.max(0, (questions.find((q) => q.id === questionId)?.upvotes || 1) - 1) }).eq('id', questionId)
      setUpvoted((prev) => { const next = new Set(prev); next.delete(questionId); return next })
    } else {
      await supabase.from('qa_upvotes').insert({ qa_question_id: questionId, participant_id: participantId })
      await supabase.from('qa_questions').update({ upvotes: (questions.find((q) => q.id === questionId)?.upvotes || 0) + 1 }).eq('id', questionId)
      setUpvoted((prev) => new Set(prev).add(questionId))
    }
  }

  // Nickname screen
  if (phase === 'nickname') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #46178F 0%, #2a0e5a 100%)' }}>
        <h1 className="text-4xl font-bold text-white mb-2">
          9Hoot<span className="text-yellow-accent">!</span> Q&A
        </h1>
        <p className="text-white/60 text-sm mb-6">Join the discussion</p>

        <form onSubmit={handleJoin} className="w-72">
          <div className="bg-white rounded-lg overflow-hidden">
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your name"
              maxLength={20}
              className="w-full h-12 px-4 text-center text-dark-text font-bold text-base border-b-2 border-border-gray focus:outline-none focus:border-purple-primary placeholder:font-normal placeholder:text-border-gray"
              autoFocus
            />
            <button
              type="submit"
              className="w-full h-12 bg-purple-primary text-white font-bold text-base hover:bg-purple-primary/90 transition-colors"
            >
              Join
            </button>
          </div>
          {error && (
            <p className="text-white bg-answer-red/80 text-sm text-center py-2 px-3 rounded mt-3">{error}</p>
          )}
        </form>
      </div>
    )
  }

  // Q&A screen
  const unanswered = questions.filter((q) => !q.is_answered)
  const answered = questions.filter((q) => q.is_answered)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #46178F 0%, #2a0e5a 100%)' }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <h2 className="text-white font-bold text-sm">
          9Hoot<span className="text-yellow-accent">!</span> Q&A
        </h2>
        <span className="text-white/40 text-xs">{nickname}</span>
      </div>

      {/* Submit form */}
      <form onSubmit={submitQuestion} className="px-4 pb-3 flex gap-2">
        <input
          type="text"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          placeholder="Ask a question..."
          className="flex-1 h-10 px-3 text-sm rounded-lg bg-white/15 text-white placeholder:text-white/40 border border-white/20 focus:outline-none focus:border-white/50"
        />
        <button
          type="submit"
          disabled={!newQuestion.trim() || submitting}
          className="h-10 px-4 bg-white text-purple-primary text-sm font-bold rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          {submitting ? '...' : 'Ask'}
        </button>
      </form>

      {/* Questions */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {unanswered.length === 0 && answered.length === 0 && (
          <div className="text-center py-12">
            <div className="text-3xl mb-2">💬</div>
            <p className="text-white/60 text-sm">No questions yet. Be the first to ask!</p>
          </div>
        )}

        {unanswered.map((q) => {
          const hasUpvoted = upvoted.has(q.id)
          return (
            <div key={q.id} className="bg-white/15 backdrop-blur rounded-xl p-3 flex gap-3">
              <button
                onClick={() => toggleUpvote(q.id)}
                className={`flex flex-col items-center gap-0.5 flex-shrink-0 px-2 py-1.5 rounded-lg transition-colors ${
                  hasUpvoted ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="text-xs">▲</span>
                <span className="text-base font-bold">{q.upvotes}</span>
              </button>
              <p className="text-white text-sm flex-1 py-1.5">{q.question_text}</p>
            </div>
          )
        })}

        {answered.length > 0 && (
          <>
            <div className="text-[10px] font-bold text-white/30 uppercase tracking-wide pt-2">Answered</div>
            {answered.map((q) => (
              <div key={q.id} className="bg-correct-green/20 rounded-xl p-3 flex gap-3 opacity-50">
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0 px-2 py-1.5">
                  <span className="text-xs text-correct-green">✓</span>
                  <span className="text-base font-bold text-correct-green">{q.upvotes}</span>
                </div>
                <p className="text-white/60 text-sm flex-1 py-1.5 line-through">{q.question_text}</p>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

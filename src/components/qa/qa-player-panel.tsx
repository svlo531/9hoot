'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface QAQuestion {
  id: string
  question_text: string
  upvotes: number
  is_answered: boolean
  created_at: string
}

export function QAPlayerPanel({ sessionId, participantId }: { sessionId: string; participantId: string }) {
  const [open, setOpen] = useState(false)
  const [questions, setQuestions] = useState<QAQuestion[]>([])
  const [newQuestion, setNewQuestion] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [upvoted, setUpvoted] = useState<Set<string>>(new Set())
  const supabase = createClient()

  // Fetch questions + subscribe
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

    // Load existing upvotes for this participant
    async function loadUpvotes() {
      const { data } = await supabase
        .from('qa_upvotes')
        .select('qa_question_id')
        .eq('participant_id', participantId)

      if (data) setUpvoted(new Set(data.map((u: { qa_question_id: string }) => u.qa_question_id)))
    }

    load()
    loadUpvotes()

    // Real-time subscription
    const channel = supabase
      .channel(`qa-player-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'qa_questions', filter: `session_id=eq.${sessionId}` },
        () => { load() }
      )
      .subscribe()

    // Polling backup
    const poll = setInterval(load, 3000)

    return () => {
      channel.unsubscribe()
      clearInterval(poll)
    }
  }, [sessionId, participantId])

  async function submitQuestion(e: React.FormEvent) {
    e.preventDefault()
    if (!newQuestion.trim() || submitting) return
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
    const alreadyUpvoted = upvoted.has(questionId)

    if (alreadyUpvoted) {
      // Remove upvote
      await supabase.from('qa_upvotes').delete().eq('qa_question_id', questionId).eq('participant_id', participantId)
      await supabase.from('qa_questions').update({ upvotes: Math.max(0, (questions.find((q) => q.id === questionId)?.upvotes || 1) - 1) }).eq('id', questionId)
      setUpvoted((prev) => { const next = new Set(prev); next.delete(questionId); return next })
    } else {
      // Add upvote
      await supabase.from('qa_upvotes').insert({ qa_question_id: questionId, participant_id: participantId })
      await supabase.from('qa_questions').update({ upvotes: (questions.find((q) => q.id === questionId)?.upvotes || 0) + 1 }).eq('id', questionId)
      setUpvoted((prev) => new Set(prev).add(questionId))
    }
  }

  const unanswered = questions.filter((q) => !q.is_answered)
  const answered = questions.filter((q) => q.is_answered)

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-50 w-12 h-12 bg-purple-primary text-white rounded-full shadow-lg flex items-center justify-center text-lg hover:scale-110 transition-transform"
      >
        {open ? '✕' : '?'}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-80 max-h-[60vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-mid-gray">
            <h3 className="font-bold text-dark-text text-sm">Ask a Question</h3>
          </div>

          {/* Submit form */}
          <form onSubmit={submitQuestion} className="p-3 border-b border-mid-gray flex gap-2">
            <input
              type="text"
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="Type your question..."
              className="flex-1 h-9 px-3 text-sm border border-mid-gray rounded-lg bg-white text-dark-text placeholder:text-gray-text focus:outline-none focus:border-purple-primary"
            />
            <button
              type="submit"
              disabled={!newQuestion.trim() || submitting}
              className="h-9 px-3 bg-purple-primary text-white text-sm font-bold rounded-lg hover:bg-purple-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting ? '...' : 'Ask'}
            </button>
          </form>

          {/* Questions list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {unanswered.length === 0 && answered.length === 0 && (
              <div className="text-center py-6 text-gray-text text-xs">
                No questions yet. Be the first to ask!
              </div>
            )}

            {unanswered.map((q) => {
              const hasUpvoted = upvoted.has(q.id)
              return (
                <div key={q.id} className="bg-light-gray rounded-lg p-2.5 flex gap-2.5">
                  {/* Upvote button */}
                  <button
                    onClick={() => toggleUpvote(q.id)}
                    className={`flex flex-col items-center gap-0.5 flex-shrink-0 px-1.5 py-1 rounded transition-colors ${
                      hasUpvoted ? 'text-purple-primary bg-purple-primary/10' : 'text-gray-text hover:text-purple-primary hover:bg-purple-primary/5'
                    }`}
                  >
                    <span className="text-xs">▲</span>
                    <span className="text-sm font-bold">{q.upvotes}</span>
                  </button>
                  {/* Content */}
                  <p className="text-sm text-dark-text flex-1 py-1">{q.question_text}</p>
                </div>
              )
            })}

            {answered.length > 0 && (
              <>
                <div className="text-[10px] font-bold text-gray-text uppercase tracking-wide pt-2">Answered</div>
                {answered.map((q) => (
                  <div key={q.id} className="bg-correct-green/10 rounded-lg p-2.5 flex gap-2.5 opacity-50">
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0 px-1.5 py-1">
                      <span className="text-xs text-correct-green">✓</span>
                      <span className="text-sm font-bold text-correct-green">{q.upvotes}</span>
                    </div>
                    <p className="text-sm text-dark-text flex-1 py-1 line-through">{q.question_text}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

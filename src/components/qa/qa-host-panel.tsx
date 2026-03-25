'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface QAQuestion {
  id: string
  question_text: string
  upvotes: number
  is_answered: boolean
  is_hidden: boolean
  created_at: string
}

export function QAHostPanel({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false)
  const [questions, setQuestions] = useState<QAQuestion[]>([])
  const [sortBy, setSortBy] = useState<'popular' | 'recent'>('popular')
  const supabase = createClient()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Fetch questions + subscribe to real-time
  useEffect(() => {
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

    // Subscribe to real-time changes
    const channel = supabase
      .channel(`qa-host-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'qa_questions', filter: `session_id=eq.${sessionId}` },
        () => { load() }
      )
      .subscribe()

    channelRef.current = channel

    // Polling backup every 3s
    const poll = setInterval(load, 3000)

    return () => {
      channel.unsubscribe()
      clearInterval(poll)
    }
  }, [sessionId])

  async function toggleAnswered(id: string, current: boolean) {
    await supabase.from('qa_questions').update({ is_answered: !current }).eq('id', id)
    setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, is_answered: !current } : q))
  }

  async function hideQuestion(id: string) {
    await supabase.from('qa_questions').update({ is_hidden: true }).eq('id', id)
    setQuestions((prev) => prev.filter((q) => q.id !== id))
  }

  const sorted = [...questions].sort((a, b) => {
    if (sortBy === 'popular') return b.upvotes - a.upvotes
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const unanswered = sorted.filter((q) => !q.is_answered)
  const answered = sorted.filter((q) => q.is_answered)

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-4 right-4 z-50 h-10 px-4 bg-white/20 backdrop-blur text-white text-sm font-bold rounded-lg hover:bg-white/30 transition-all flex items-center gap-2 shadow-lg"
      >
        <span>Q&A</span>
        {unanswered.length > 0 && (
          <span className="bg-answer-red text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {unanswered.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed top-16 right-4 z-50 w-96 max-h-[70vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-mid-gray flex items-center justify-between">
            <h3 className="font-bold text-dark-text">Audience Questions</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSortBy('popular')}
                className={`text-xs px-2 py-1 rounded ${sortBy === 'popular' ? 'bg-purple-primary text-white' : 'text-gray-text hover:bg-light-gray'}`}
              >
                Popular
              </button>
              <button
                onClick={() => setSortBy('recent')}
                className={`text-xs px-2 py-1 rounded ${sortBy === 'recent' ? 'bg-purple-primary text-white' : 'text-gray-text hover:bg-light-gray'}`}
              >
                Recent
              </button>
            </div>
          </div>

          {/* Questions list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {unanswered.length === 0 && answered.length === 0 && (
              <div className="text-center py-8 text-gray-text text-sm">
                No questions yet. Participants can submit questions during the game.
              </div>
            )}

            {unanswered.map((q) => (
              <div key={q.id} className="bg-light-gray rounded-lg p-3 flex gap-3">
                {/* Upvote count */}
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                  <span className="text-lg font-bold text-purple-primary">{q.upvotes}</span>
                  <span className="text-[9px] text-gray-text">votes</span>
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-dark-text">{q.question_text}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => toggleAnswered(q.id, q.is_answered)}
                      className="text-[10px] font-bold text-correct-green hover:underline"
                    >
                      Mark answered
                    </button>
                    <button
                      onClick={() => hideQuestion(q.id)}
                      className="text-[10px] font-bold text-gray-text hover:text-answer-red"
                    >
                      Hide
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {answered.length > 0 && (
              <>
                <div className="text-[10px] font-bold text-gray-text uppercase tracking-wide pt-2">Answered</div>
                {answered.map((q) => (
                  <div key={q.id} className="bg-correct-green/10 rounded-lg p-3 flex gap-3 opacity-60">
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                      <span className="text-lg font-bold text-correct-green">{q.upvotes}</span>
                      <span className="text-[9px] text-gray-text">votes</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-dark-text line-through">{q.question_text}</p>
                      <button
                        onClick={() => toggleAnswered(q.id, q.is_answered)}
                        className="text-[10px] font-bold text-gray-text hover:underline mt-1"
                      >
                        Undo
                      </button>
                    </div>
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

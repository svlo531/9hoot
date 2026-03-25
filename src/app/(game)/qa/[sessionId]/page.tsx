'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface QAQuestion {
  id: string
  question_text: string
  upvotes: number
  is_answered: boolean
  is_hidden: boolean
  created_at: string
  participant_id: string | null
}

export default function QAHostPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [pin, setPin] = useState('')
  const [questions, setQuestions] = useState<QAQuestion[]>([])
  const [sortBy, setSortBy] = useState<'popular' | 'recent'>('popular')
  const [participantCount, setParticipantCount] = useState(0)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const supabase = createClient()

  // Fetch session PIN
  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('sessions').select('pin').eq('id', sessionId).single()
      if (data) setPin(data.pin)
    }
    load()
  }, [sessionId])

  // Generate QR
  useEffect(() => {
    if (!pin) return
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(`https://9hoot.vercel.app/play/${pin}`, {
        width: 200, margin: 1, color: { dark: '#46178F', light: '#ffffff' },
      }).then(url => setQrDataUrl(url))
    })
  }, [pin])

  // Load questions + real-time
  useEffect(() => {
    async function loadQuestions() {
      const { data } = await supabase
        .from('qa_questions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('is_hidden', false)
        .order('upvotes', { ascending: false })
      if (data) setQuestions(data)
    }

    async function loadParticipants() {
      const { count } = await supabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
      setParticipantCount(count || 0)
    }

    loadQuestions()
    loadParticipants()

    const channel = supabase
      .channel(`qa-standalone-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qa_questions', filter: `session_id=eq.${sessionId}` }, () => loadQuestions())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` }, () => loadParticipants())
      .subscribe()

    const poll = setInterval(() => { loadQuestions(); loadParticipants() }, 3000)

    return () => { channel.unsubscribe(); clearInterval(poll) }
  }, [sessionId])

  async function toggleAnswered(id: string, current: boolean) {
    await supabase.from('qa_questions').update({ is_answered: !current }).eq('id', id)
  }

  async function hideQuestion(id: string) {
    await supabase.from('qa_questions').update({ is_hidden: true }).eq('id', id)
  }

  async function endSession() {
    await supabase.from('sessions').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', sessionId)
    window.location.href = '/library'
  }

  const sorted = [...questions].sort((a, b) => {
    if (sortBy === 'popular') return b.upvotes - a.upvotes
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const unanswered = sorted.filter((q) => !q.is_answered)
  const answered = sorted.filter((q) => q.is_answered)

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <h1 className="text-2xl font-bold text-white">
          9Hoot<span className="text-yellow-accent">!</span> Q&A
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-white/60 text-sm">{participantCount} participants</span>
          <button
            onClick={endSession}
            className="h-9 px-4 text-sm font-bold text-white/80 border border-white/30 rounded-lg hover:bg-white/10 transition-colors"
          >
            End Session
          </button>
        </div>
      </div>

      <div className="flex gap-6 px-6 pb-6">
        {/* Left - Join info */}
        <div className="w-72 flex-shrink-0">
          <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-center">
            <p className="text-white/60 text-sm mb-2">Join at</p>
            <p className="text-white font-bold text-lg mb-3">9hoot.vercel.app/join</p>
            <div className="bg-white rounded-xl p-3 inline-block mb-3">
              {qrDataUrl && <img src={qrDataUrl} alt="QR Code" className="w-40 h-40" />}
            </div>
            <div className="text-5xl font-bold text-white tracking-[0.2em]">{pin}</div>
            <p className="text-white/40 text-xs mt-2">Game PIN</p>
          </div>
        </div>

        {/* Right - Questions */}
        <div className="flex-1">
          {/* Sort tabs */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">
              Questions ({unanswered.length})
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSortBy('popular')}
                className={`text-sm px-3 py-1.5 rounded-lg ${sortBy === 'popular' ? 'bg-white text-purple-primary font-bold' : 'text-white/60 hover:text-white'}`}
              >
                Popular
              </button>
              <button
                onClick={() => setSortBy('recent')}
                className={`text-sm px-3 py-1.5 rounded-lg ${sortBy === 'recent' ? 'bg-white text-purple-primary font-bold' : 'text-white/60 hover:text-white'}`}
              >
                Recent
              </button>
            </div>
          </div>

          {/* Questions list */}
          <div className="space-y-3">
            {unanswered.length === 0 && answered.length === 0 && (
              <div className="bg-white/10 rounded-xl p-12 text-center">
                <div className="text-4xl mb-3">💬</div>
                <p className="text-white font-bold text-lg">Waiting for questions...</p>
                <p className="text-white/40 text-sm mt-1">Participants can submit questions after joining</p>
              </div>
            )}

            {unanswered.map((q) => (
              <div key={q.id} className="bg-white rounded-xl p-4 flex gap-4 animate-question-enter">
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <span className="text-2xl font-bold text-purple-primary">{q.upvotes}</span>
                  <span className="text-[10px] text-gray-text">votes</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-dark-text text-base">{q.question_text}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={() => toggleAnswered(q.id, false)}
                      className="text-xs font-bold text-correct-green hover:underline"
                    >
                      Mark answered
                    </button>
                    <button
                      onClick={() => hideQuestion(q.id)}
                      className="text-xs font-bold text-gray-text hover:text-answer-red"
                    >
                      Hide
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {answered.length > 0 && (
              <>
                <div className="text-xs font-bold text-white/40 uppercase tracking-wide pt-3">Answered ({answered.length})</div>
                {answered.map((q) => (
                  <div key={q.id} className="bg-white/10 rounded-xl p-4 flex gap-4">
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <span className="text-2xl font-bold text-correct-green">{q.upvotes}</span>
                      <span className="text-[10px] text-white/40">votes</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/60 line-through">{q.question_text}</p>
                      <button
                        onClick={() => toggleAnswered(q.id, true)}
                        className="text-xs font-bold text-white/40 hover:text-white mt-1"
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
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ANSWER_SHAPES } from '@/lib/types'
import { checkAnswer, calculateScore, getStreakMultiplier } from '@/lib/game-utils'
import type { RealtimeChannel } from '@supabase/supabase-js'

type PlayerPhase = 'nickname' | 'waiting' | 'question' | 'answered' | 'result' | 'podium'

interface QuestionData {
  id: string
  index: number
  type: string
  questionText: string
  options: { text: string }[] | null
  correctAnswers: unknown
  timeLimit: number
  points: number
  totalQuestions: number
}

export function PlayerGame({ pin }: { pin: string }) {
  const [phase, setPhase] = useState<PlayerPhase>('nickname')
  const [nickname, setNickname] = useState('')
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [question, setQuestion] = useState<QuestionData | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<Record<string, unknown> | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [pointsAwarded, setPointsAwarded] = useState(0)
  const [totalScore, setTotalScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const questionStartRef = useRef<number>(0)
  const lastQuestionIndexRef = useRef<number>(-1)
  const questionsRef = useRef<QuestionData[]>([])
  const supabase = createClient()

  // Poll session state from DB — this is the primary game state mechanism
  useEffect(() => {
    if (!sessionId || !participantId) return
    if (phase === 'podium') return

    const interval = setInterval(async () => {
      const { data: session } = await supabase
        .from('sessions')
        .select('status, current_question_index')
        .eq('id', sessionId)
        .single()

      if (!session) return

      // Game completed
      if (session.status === 'completed') {
        // Fetch final results
        const { data: myParticipant } = await supabase
          .from('participants')
          .select('total_score, rank')
          .eq('id', participantId)
          .single()

        if (myParticipant) {
          setTotalScore(myParticipant.total_score || totalScore)
        }
        setPhase('podium')
        return
      }

      // Game is active and question index changed — new question!
      if (
        session.status === 'active' &&
        session.current_question_index >= 0 &&
        session.current_question_index !== lastQuestionIndexRef.current
      ) {
        const newIndex = session.current_question_index
        lastQuestionIndexRef.current = newIndex
        loadQuestion(newIndex)
      }
    }, 1500)

    return () => clearInterval(interval)
  }, [sessionId, participantId, phase, selectedAnswer, streak, supabase, totalScore])

  // Load questions once after joining
  useEffect(() => {
    if (!sessionId) return

    async function fetchQuestions() {
      // Get quiz_id from session
      const { data: session } = await supabase
        .from('sessions')
        .select('quiz_id')
        .eq('id', sessionId)
        .single()

      if (!session) return

      const { data: questions } = await supabase
        .from('questions')
        .select('*')
        .eq('quiz_id', session.quiz_id)
        .order('sort_order', { ascending: true })

      if (questions) {
        questionsRef.current = questions.map((q, i) => ({
          id: q.id,
          index: i,
          type: q.type,
          questionText: q.question_text || '',
          options: q.options as { text: string }[] | null,
          correctAnswers: q.correct_answers,
          timeLimit: q.time_limit,
          points: q.points,
          totalQuestions: questions.length,
        }))
      }
    }

    fetchQuestions()
  }, [sessionId, supabase])

  function loadQuestion(index: number) {
    const q = questionsRef.current[index]
    if (!q) return

    setQuestion(q)
    setSelectedAnswer(null)
    setIsCorrect(null)
    setPointsAwarded(0)
    setPhase('question')
    questionStartRef.current = Date.now()
  }

  // Set up Broadcast channel for sending answers (player → host)
  useEffect(() => {
    if (!participantId) return

    const channel = supabase.channel(`game:${pin}`, {
      config: { broadcast: { self: false } },
    })

    channel.subscribe()

    // Track presence
    channel.track({
      nickname,
      participantId,
    })

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
    }
  }, [participantId, pin, nickname, supabase])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!nickname.trim()) return
    setError(null)

    // Find session
    const { data: session } = await supabase
      .from('sessions')
      .select('id')
      .eq('pin', pin)
      .neq('status', 'completed')
      .single()

    if (!session) {
      setError('Game not found')
      return
    }

    // Create participant record
    const { data: participant, error: err } = await supabase
      .from('participants')
      .insert({
        session_id: session.id,
        nickname: nickname.trim(),
      })
      .select()
      .single()

    if (err || !participant) {
      setError('Failed to join: ' + (err?.message || 'Unknown error'))
      return
    }

    setSessionId(session.id)
    setParticipantId(participant.id)
    setPhase('waiting')
  }

  function submitAnswer(answerData: Record<string, unknown>) {
    if (!participantId || !question) return
    setSelectedAnswer(answerData)

    const timeTakenMs = Date.now() - questionStartRef.current

    // Check correctness immediately — we have the answer key cached
    const correct = checkAnswer(question.type, answerData, question.correctAnswers)
    setIsCorrect(correct)

    if (correct) {
      const pts = calculateScore(question.points, timeTakenMs, question.timeLimit * 1000, true)
      const multiplied = Math.round(pts * getStreakMultiplier(streak + 1))
      setPointsAwarded(multiplied)
      setTotalScore((prev) => prev + multiplied)
      setStreak((s) => s + 1)
    } else {
      setStreak(0)
      setPointsAwarded(0)
    }

    // Show result immediately
    setPhase('result')

    // Send via Broadcast to host for real-time answer count
    channelRef.current?.send({
      type: 'broadcast',
      event: 'player:answer',
      payload: {
        participantId,
        nickname,
        answerData,
        timeTakenMs,
      },
    })

    // Also write directly to DB as backup
    supabase.from('answers').insert({
      session_id: sessionId,
      participant_id: participantId,
      question_id: question.id,
      answer_data: answerData,
      is_correct: correct,
      points_awarded: correct ? calculateScore(question.points, timeTakenMs, question.timeLimit * 1000, true) : 0,
      time_taken_ms: timeTakenMs,
    }).then(() => {})
  }

  // ── RENDER ──────────────────────────────────

  if (phase === 'nickname') return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #46178F 0%, #2a0e5a 100%)' }}>
      <h1 className="text-4xl font-bold text-white mb-6">
        9Hoot<span className="text-yellow-accent">!</span>
      </h1>
      <form onSubmit={handleJoin} className="w-72">
        <div className="bg-white rounded-lg overflow-hidden">
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Nickname"
            maxLength={20}
            className="w-full h-12 px-4 text-center text-dark-text font-bold text-base border-b-2 border-border-gray focus:outline-none focus:border-blue-cta placeholder:font-normal placeholder:text-border-gray"
            autoFocus
          />
          <button
            type="submit"
            className="w-full h-12 bg-dark-text text-white font-bold text-base hover:bg-black transition-colors"
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

  if (phase === 'waiting') return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a0a3e 0%, #001b50 100%)' }}>
      <div className="text-center">
        <div className="text-5xl mb-4 animate-pulse">⏳</div>
        <p className="text-white font-bold text-xl">{nickname}</p>
        <p className="text-white/60 text-sm mt-2">You&apos;re in! Waiting for host...</p>
        <p className="text-white/40 text-xs mt-1">Total score: {totalScore}</p>
      </div>
    </div>
  )

  if (phase === 'question' && question) {
    const options = (question.options as { text: string }[]) || []

    if (question.type === 'quiz' || question.type === 'poll') {
      return (
        <div className="min-h-screen flex flex-col p-3 gap-3" style={{ background: '#333' }}>
          <div className="text-center text-white/60 text-xs py-1">
            {question.index + 1} of {question.totalQuestions}
          </div>
          <div className={`flex-1 grid gap-3 ${options.length <= 2 ? 'grid-cols-2 grid-rows-1' : 'grid-cols-2 grid-rows-2'}`}>
            {options.map((_, i) => {
              const shape = ANSWER_SHAPES[i]
              return (
                <button
                  key={i}
                  onClick={() => submitAnswer({ selectedIndices: [i] })}
                  className="rounded-lg flex items-center justify-center active:scale-95 transition-transform"
                  style={{ backgroundColor: shape.color }}
                >
                  <span className="text-white text-5xl">{shape.symbol}</span>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    if (question.type === 'true_false') {
      return (
        <div className="min-h-screen flex flex-col p-3 gap-3" style={{ background: '#333' }}>
          <div className="text-center text-white/60 text-xs py-1">
            {question.index + 1} of {question.totalQuestions}
          </div>
          <div className="flex-1 grid grid-cols-2 gap-3">
            <button
              onClick={() => submitAnswer({ selected: true })}
              className="rounded-lg flex items-center justify-center active:scale-95 transition-transform"
              style={{ backgroundColor: ANSWER_SHAPES[0].color }}
            >
              <span className="text-white text-4xl font-bold">{ANSWER_SHAPES[0].symbol} True</span>
            </button>
            <button
              onClick={() => submitAnswer({ selected: false })}
              className="rounded-lg flex items-center justify-center active:scale-95 transition-transform"
              style={{ backgroundColor: ANSWER_SHAPES[1].color }}
            >
              <span className="text-white text-4xl font-bold">{ANSWER_SHAPES[1].symbol} False</span>
            </button>
          </div>
        </div>
      )
    }

    // Fallback for other types
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#333' }}>
        <p className="text-white text-center">
          {question.type.replace('_', ' ')} — answer on host screen
        </p>
      </div>
    )
  }

  if (phase === 'answered') return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a0a3e 0%, #001b50 100%)' }}>
      <div className="text-4xl mb-4">👍</div>
      <p className="text-white font-bold text-lg">Answer submitted!</p>
      <p className="text-white/60 text-sm mt-2">Let&apos;s see how you did...</p>
    </div>
  )

  if (phase === 'result') return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{
        background: isCorrect
          ? 'linear-gradient(135deg, #1a5c2a 0%, #0a3d1a 100%)'
          : 'linear-gradient(135deg, #5c1a1a 0%, #3d0a0a 100%)',
      }}
    >
      <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${isCorrect ? 'bg-correct-green' : 'bg-answer-red'}`}>
        <span className="text-white text-3xl font-bold">{isCorrect ? '✓' : '✕'}</span>
      </div>
      <p className="text-white font-bold text-2xl">{isCorrect ? 'Correct!' : 'Incorrect'}</p>
      {isCorrect && pointsAwarded > 0 && (
        <div className="mt-3 bg-black/30 rounded-full px-4 py-2">
          <span className="text-white font-bold">+{pointsAwarded}</span>
        </div>
      )}
      <p className="text-white/60 text-sm mt-4">Total: {totalScore} pts</p>
    </div>
  )

  if (phase === 'podium') return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
      <h2 className="text-3xl font-bold text-white mb-6">Game Over!</h2>
      <p className="text-white font-bold text-xl">{nickname}</p>
      <p className="text-white/60 text-lg mt-2">Final score: {totalScore} pts</p>
    </div>
  )

  return null
}

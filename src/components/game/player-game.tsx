'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ANSWER_SHAPES } from '@/lib/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

type PlayerPhase = 'nickname' | 'waiting' | 'question' | 'answered' | 'result' | 'podium'

interface QuestionData {
  index: number
  type: string
  questionText: string
  options: { text: string }[] | null
  timeLimit: number
  points: number
  totalQuestions: number
}

export function PlayerGame({ pin }: { pin: string }) {
  const [phase, setPhase] = useState<PlayerPhase>('nickname')
  const [nickname, setNickname] = useState('')
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [question, setQuestion] = useState<QuestionData | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<Record<string, unknown> | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [pointsAwarded, setPointsAwarded] = useState(0)
  const [totalScore, setTotalScore] = useState(0)
  const [finalRank, setFinalRank] = useState<number | null>(null)
  const [podium, setPodium] = useState<{ nickname: string; score: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const questionStartRef = useRef<number>(0)
  const supabase = createClient()

  // Set up channel after joining
  useEffect(() => {
    if (!participantId) return

    const channel = supabase.channel(`game:${pin}`, {
      config: { broadcast: { self: false } },
    })

    channel
      .on('broadcast', { event: 'game:start' }, () => {
        setPhase('waiting')
      })
      .on('broadcast', { event: 'game:question' }, (payload) => {
        setQuestion(payload.payload as QuestionData)
        setSelectedAnswer(null)
        setIsCorrect(null)
        setPointsAwarded(0)
        setPhase('question')
        questionStartRef.current = Date.now()
      })
      .on('broadcast', { event: 'game:answer_lock' }, () => {
        if (phase === 'question') {
          setPhase('answered')
        }
      })
      .on('broadcast', { event: 'game:results' }, (payload) => {
        // Check if our answer was correct
        const correctAnswers = payload.payload.correctAnswers
        if (selectedAnswer && question) {
          let correct = false
          if (question.type === 'quiz') {
            const selected = (selectedAnswer.selectedIndices as number[]) || []
            correct = selected.length > 0 && selected.every((i: number) => (correctAnswers as number[]).includes(i))
          } else if (question.type === 'true_false') {
            correct = selectedAnswer.selected === (correctAnswers as boolean[])?.[0]
          }
          setIsCorrect(correct)
          if (correct) {
            const timeTaken = Date.now() - questionStartRef.current
            const maxPts = question.points
            const pts = Math.round(maxPts * (1 - (timeTaken / (question.timeLimit * 1000)) * 0.5))
            setPointsAwarded(Math.max(0, pts))
            setTotalScore((prev) => prev + Math.max(0, pts))
          }
        }
        setPhase('result')
      })
      .on('broadcast', { event: 'game:leaderboard' }, () => {
        setPhase('waiting')
      })
      .on('broadcast', { event: 'game:podium' }, (payload) => {
        setPodium(payload.payload.podium || [])
        // Find our rank
        const rank = (payload.payload.podium as { id: string }[])?.findIndex((p) => p.id === participantId)
        setFinalRank(rank !== undefined && rank >= 0 ? rank + 1 : null)
        setPhase('podium')
      })
      .subscribe()

    // Track presence
    channel.track({
      nickname,
      participantId,
    })

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
    }
  }, [participantId, pin, supabase])

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

    setParticipantId(participant.id)
    setPhase('waiting')
  }

  function submitAnswer(answerData: Record<string, unknown>) {
    if (!participantId || !question) return
    setSelectedAnswer(answerData)
    setPhase('answered')

    const timeTakenMs = Date.now() - questionStartRef.current

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
      {finalRank && finalRank <= 3 ? (
        <>
          <div className="text-6xl mb-4">🏆</div>
          <p className="text-yellow-accent font-bold text-2xl">You finished #{finalRank}!</p>
        </>
      ) : (
        <>
          <p className="text-white font-bold text-xl">{nickname}</p>
          <p className="text-white/60 text-lg mt-2">Final score: {totalScore} pts</p>
        </>
      )}
    </div>
  )

  return null
}

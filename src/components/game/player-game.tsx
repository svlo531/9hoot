'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ANSWER_SHAPES } from '@/lib/types'
import { checkAnswer, calculateScore, getStreakMultiplier } from '@/lib/game-utils'
import { useGameAudio } from '@/lib/use-game-audio'
import type { RealtimeChannel } from '@supabase/supabase-js'

type PlayerPhase = 'nickname' | 'waiting' | 'question' | 'answerFill' | 'result' | 'ranking' | 'podium'

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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [pointsAwarded, setPointsAwarded] = useState(0)
  const [displayedPoints, setDisplayedPoints] = useState(0)
  const [totalScore, setTotalScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [currentRank, setCurrentRank] = useState<number | null>(null)
  const [playerCount, setPlayerCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const questionStartRef = useRef<number>(0)
  const lastQuestionIndexRef = useRef<number>(-1)
  const questionsRef = useRef<QuestionData[]>([])
  const supabase = createClient()
  const audio = useGameAudio()

  // Poll session state from DB
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

      if (session.status === 'completed') {
        const { data: myParticipant } = await supabase
          .from('participants')
          .select('total_score, rank')
          .eq('id', participantId)
          .single()

        if (myParticipant) {
          setTotalScore(myParticipant.total_score || totalScore)
          setCurrentRank(myParticipant.rank)
        }
        setPhase('podium')
        return
      }

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
    setSelectedIndex(null)
    setIsCorrect(null)
    setPointsAwarded(0)
    setDisplayedPoints(0)
    setPhase('question')
    questionStartRef.current = Date.now()
  }

  // Set up Broadcast channel
  useEffect(() => {
    if (!participantId) return

    const channel = supabase.channel(`game:${pin}`, {
      config: { broadcast: { self: false } },
    })

    channel.subscribe()
    channel.track({ nickname, participantId })

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
    }
  }, [participantId, pin, nickname, supabase])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!nickname.trim()) return
    setError(null)

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

    audio.play('answerSubmit')
    setSessionId(session.id)
    setParticipantId(participant.id)
    setPhase('waiting')
  }

  function submitAnswer(answerData: Record<string, unknown>, answerIndex: number) {
    if (!participantId || !question) return

    audio.play('answerSubmit')
    setSelectedAnswer(answerData)
    setSelectedIndex(answerIndex)

    // Show full-screen color fill briefly
    setPhase('answerFill')

    const timeTakenMs = Date.now() - questionStartRef.current

    // Check correctness
    const correct = checkAnswer(question.type, answerData, question.correctAnswers)
    setIsCorrect(correct)

    let earnedPts = 0
    if (correct) {
      const pts = calculateScore(question.points, timeTakenMs, question.timeLimit * 1000, true)
      const multiplied = Math.round(pts * getStreakMultiplier(streak + 1))
      setPointsAwarded(multiplied)
      setTotalScore((prev) => prev + multiplied)
      setStreak((s) => s + 1)
      earnedPts = multiplied
    } else {
      setStreak(0)
      setPointsAwarded(0)
    }

    // After brief fill animation, show result
    setTimeout(() => {
      if (correct) {
        audio.play('correct')
      } else {
        audio.play('incorrect')
      }
      setPhase('result')

      // Animate points counter
      if (earnedPts > 0) {
        animatePoints(earnedPts)
      }
    }, 600)

    // After result, transition to ranking
    setTimeout(async () => {
      if (sessionId) {
        const { data: participants } = await supabase
          .from('participants')
          .select('id, total_score')
          .eq('session_id', sessionId)
          .order('total_score', { ascending: false })

        if (participants) {
          setPlayerCount(participants.length)
          const myIndex = participants.findIndex((p) => p.id === participantId)
          setCurrentRank(myIndex >= 0 ? myIndex + 1 : null)
        }
      }
      setPhase('ranking')
    }, 3100)

    // Send via Broadcast
    channelRef.current?.send({
      type: 'broadcast',
      event: 'player:answer',
      payload: { participantId, nickname, answerData, timeTakenMs },
    })

    // Write to DB
    const dbPts = correct ? calculateScore(question.points, timeTakenMs, question.timeLimit * 1000, true) : 0
    supabase.from('answers').insert({
      session_id: sessionId,
      participant_id: participantId,
      question_id: question.id,
      answer_data: answerData,
      is_correct: correct,
      points_awarded: dbPts,
      time_taken_ms: timeTakenMs,
    }).then(() => {})

    supabase.rpc('increment_participant_score', {
      participant_id_input: participantId,
      points_input: dbPts,
    }).then(() => {})
  }

  function animatePoints(target: number) {
    const duration = 400
    const start = performance.now()
    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // Ease out
      const eased = 1 - (1 - progress) * (1 - progress)
      setDisplayedPoints(Math.round(eased * target))
      if (progress < 1) {
        requestAnimationFrame(tick)
      }
    }
    requestAnimationFrame(tick)
  }

  // ── RENDER ──────────────────────────────────

  if (phase === 'nickname') return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #46178F 0%, #2a0e5a 100%)' }}>
      <h1 className="text-4xl font-bold text-white mb-6 animate-player-enter">
        9Hoot<span className="text-yellow-accent">!</span>
      </h1>
      <form onSubmit={handleJoin} className="w-72 animate-player-form">
        <div className="bg-white rounded-lg overflow-hidden shadow-2xl">
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
            className="w-full h-12 bg-dark-text text-white font-bold text-base hover:bg-black transition-all active:scale-95"
          >
            Join
          </button>
        </div>
        {error && (
          <p className="text-white bg-answer-red/80 text-sm text-center py-2 px-3 rounded mt-3 animate-player-error">{error}</p>
        )}
      </form>

      <style jsx>{`
        @keyframes player-enter {
          0% { transform: scale(0.8) translateY(-20px); opacity: 0; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        .animate-player-enter {
          animation: player-enter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes player-form {
          0% { transform: translateY(30px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-player-form {
          animation: player-form 0.5s ease-out 0.2s both;
        }
        @keyframes player-error {
          0% { transform: translateY(-5px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-player-error {
          animation: player-error 0.3s ease-out both;
        }
      `}</style>
    </div>
  )

  if (phase === 'waiting') return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a0a3e 0%, #001b50 100%)' }}>
      <div className="text-center animate-player-enter">
        <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4 animate-waiting-ring">
          <span className="text-3xl">✓</span>
        </div>
        <p className="text-white font-bold text-xl">{nickname}</p>
        <p className="text-white/60 text-sm mt-2">You&apos;re in! Waiting for host...</p>
        <div className="flex justify-center gap-1 mt-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-white/40 animate-waiting-dot"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes player-enter {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-player-enter {
          animation: player-enter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes waiting-ring {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.2); }
          50% { box-shadow: 0 0 0 15px rgba(255,255,255,0); }
        }
        .animate-waiting-ring {
          animation: waiting-ring 2s ease-in-out infinite;
        }
        @keyframes waiting-dot {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.5); }
        }
        .animate-waiting-dot {
          animation: waiting-dot 1.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )

  if (phase === 'question' && question) {
    const options = (question.options as { text: string }[]) || []

    if (question.type === 'quiz' || question.type === 'poll') {
      return (
        <div className="min-h-screen flex flex-col p-3 gap-3" style={{ background: '#1a1a2e' }}>
          <div className="text-center text-white/50 text-xs py-1 font-bold">
            {question.index + 1} of {question.totalQuestions}
          </div>
          <div className={`flex-1 grid gap-3 ${options.length <= 2 ? 'grid-cols-2 grid-rows-1' : 'grid-cols-2 grid-rows-2'}`}>
            {options.map((_, i) => {
              const shape = ANSWER_SHAPES[i]
              return (
                <button
                  key={i}
                  onClick={() => submitAnswer({ selectedIndices: [i] }, i)}
                  className="rounded-xl flex items-center justify-center shadow-lg animate-answer-pop transition-transform active:scale-90"
                  style={{
                    backgroundColor: shape.color,
                    animationDelay: `${i * 80}ms`,
                  }}
                >
                  <span className="text-white text-5xl drop-shadow-lg">{shape.symbol}</span>
                </button>
              )
            })}
          </div>

          <style jsx>{`
            @keyframes answer-pop {
              0% { transform: scale(0.8); opacity: 0; }
              100% { transform: scale(1); opacity: 1; }
            }
            .animate-answer-pop {
              animation: answer-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
            }
          `}</style>
        </div>
      )
    }

    if (question.type === 'true_false') {
      return (
        <div className="min-h-screen flex flex-col p-3 gap-3" style={{ background: '#1a1a2e' }}>
          <div className="text-center text-white/50 text-xs py-1 font-bold">
            {question.index + 1} of {question.totalQuestions}
          </div>
          <div className="flex-1 grid grid-cols-2 gap-3">
            <button
              onClick={() => submitAnswer({ selected: true }, 0)}
              className="rounded-xl flex items-center justify-center shadow-lg animate-answer-pop transition-transform active:scale-90"
              style={{ backgroundColor: ANSWER_SHAPES[0].color }}
            >
              <span className="text-white text-3xl font-bold drop-shadow-lg">{ANSWER_SHAPES[0].symbol} True</span>
            </button>
            <button
              onClick={() => submitAnswer({ selected: false }, 1)}
              className="rounded-xl flex items-center justify-center shadow-lg animate-answer-pop transition-transform active:scale-90"
              style={{ backgroundColor: ANSWER_SHAPES[1].color, animationDelay: '80ms' }}
            >
              <span className="text-white text-3xl font-bold drop-shadow-lg">{ANSWER_SHAPES[1].symbol} False</span>
            </button>
          </div>

          <style jsx>{`
            @keyframes answer-pop {
              0% { transform: scale(0.8); opacity: 0; }
              100% { transform: scale(1); opacity: 1; }
            }
            .animate-answer-pop {
              animation: answer-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
            }
          `}</style>
        </div>
      )
    }

    // Fallback
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#1a1a2e' }}>
        <p className="text-white text-center">
          {question.type.replace('_', ' ')} — answer on host screen
        </p>
      </div>
    )
  }

  // Full-screen color fill after answering
  if (phase === 'answerFill') {
    const shape = selectedIndex !== null ? ANSWER_SHAPES[selectedIndex] : null
    return (
      <div
        className="min-h-screen flex items-center justify-center animate-fill-expand"
        style={{ backgroundColor: shape?.color || '#333' }}
      >
        <span className="text-white text-8xl animate-fill-symbol">{shape?.symbol || '●'}</span>

        <style jsx>{`
          @keyframes fill-expand {
            0% { transform: scale(0.3); border-radius: 50%; }
            100% { transform: scale(1); border-radius: 0; }
          }
          .animate-fill-expand {
            animation: fill-expand 0.3s ease-out both;
          }
          @keyframes fill-symbol {
            0% { transform: scale(2); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
          .animate-fill-symbol {
            animation: fill-symbol 0.2s ease-out 0.15s both;
          }
        `}</style>
      </div>
    )
  }

  if (phase === 'result') return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{
        background: isCorrect
          ? 'linear-gradient(135deg, #1a5c2a 0%, #0a3d1a 100%)'
          : 'linear-gradient(135deg, #5c1a1a 0%, #3d0a0a 100%)',
      }}
    >
      {/* Correct/Incorrect icon with bounce */}
      <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 animate-result-icon ${isCorrect ? 'bg-correct-green' : 'bg-answer-red'}`}>
        <span className="text-white text-4xl font-bold">{isCorrect ? '✓' : '✕'}</span>
      </div>

      <p className="text-white font-bold text-2xl animate-result-text">{isCorrect ? 'Correct!' : 'Incorrect'}</p>

      {/* Points counter animation */}
      {isCorrect && pointsAwarded > 0 && (
        <div className="mt-4 bg-black/30 rounded-full px-6 py-2.5 animate-result-points">
          <span className="text-white font-bold text-lg tabular-nums">+{displayedPoints}</span>
        </div>
      )}

      {streak > 1 && isCorrect && (
        <div className="mt-3 animate-result-streak">
          <span className="text-yellow-accent font-bold text-sm">🔥 {streak} streak!</span>
        </div>
      )}

      <p className="text-white/50 text-sm mt-6 animate-result-total">Total: {totalScore} pts</p>

      <style jsx>{`
        @keyframes result-icon {
          0% { transform: scale(0); }
          50% { transform: scale(1.3); }
          70% { transform: scale(0.9); }
          100% { transform: scale(1); }
        }
        .animate-result-icon {
          animation: result-icon 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes result-text {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-result-text {
          animation: result-text 0.3s ease-out 0.2s both;
        }
        @keyframes result-points {
          0% { opacity: 0; transform: scale(0.5) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-result-points {
          animation: result-points 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both;
        }
        @keyframes result-streak {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-result-streak {
          animation: result-streak 0.3s ease-out 0.5s both;
        }
        @keyframes result-total {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .animate-result-total {
          animation: result-total 0.3s ease-out 0.6s both;
        }
      `}</style>
    </div>
  )

  if (phase === 'ranking') return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #0a0033 0%, #1a0a3e 100%)' }}>
      <div className="text-center animate-rank-enter">
        {currentRank && (
          <div className="mb-4">
            <div className="text-7xl font-bold text-white mb-2 animate-rank-number">
              {currentRank === 1 ? '🥇' : currentRank === 2 ? '🥈' : currentRank === 3 ? '🥉' : `#${currentRank}`}
            </div>
            <p className="text-white/80 text-lg font-bold">
              {currentRank === 1 ? '1st place!' : currentRank === 2 ? '2nd place!' : currentRank === 3 ? '3rd place!' : `${currentRank}th place`}
            </p>
            {playerCount > 0 && (
              <p className="text-white/40 text-sm mt-1">out of {playerCount} player{playerCount !== 1 ? 's' : ''}</p>
            )}
          </div>
        )}
        <div className="bg-white/5 rounded-xl px-8 py-4 mt-4">
          <p className="text-white font-bold text-xl">{nickname}</p>
          <p className="text-white/60 text-sm mt-1 tabular-nums">{totalScore.toLocaleString()} points</p>
        </div>
        {streak > 1 && (
          <p className="text-yellow-accent text-sm mt-3 font-bold animate-rank-streak">🔥 {streak} answer streak!</p>
        )}
        <div className="flex justify-center gap-1 mt-8">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-white/30 animate-rank-dot"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
        </div>
        <p className="text-white/25 text-xs mt-2">Waiting for next question...</p>
      </div>

      <style jsx>{`
        @keyframes rank-enter {
          0% { opacity: 0; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
        .animate-rank-enter {
          animation: rank-enter 0.4s ease-out both;
        }
        @keyframes rank-number {
          0% { transform: scale(0) rotate(-15deg); }
          60% { transform: scale(1.2) rotate(5deg); }
          100% { transform: scale(1) rotate(0); }
        }
        .animate-rank-number {
          animation: rank-number 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes rank-streak {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-rank-streak {
          animation: rank-streak 0.4s ease-out 0.3s both;
        }
        @keyframes rank-dot {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.5); }
        }
        .animate-rank-dot {
          animation: rank-dot 1.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )

  if (phase === 'podium') return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
      {/* Mini confetti */}
      {currentRank && currentRank <= 3 && (
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full animate-podium-confetti"
              style={{
                backgroundColor: ['#FFD700', '#E21B3C', '#1368CE', '#26890C', '#D89E00', '#FF69B4'][i % 6],
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="text-center z-10 animate-podium-enter">
        <h2 className="text-3xl font-bold text-white mb-4">Game Over!</h2>
        {currentRank && currentRank <= 3 && (
          <div className="text-7xl mb-4 animate-podium-trophy">{currentRank === 1 ? '🏆' : currentRank === 2 ? '🥈' : '🥉'}</div>
        )}
        <p className="text-white font-bold text-xl">{nickname}</p>
        {currentRank && (
          <p className="text-yellow-accent font-bold text-lg mt-2">
            Finished {currentRank === 1 ? '1st' : currentRank === 2 ? '2nd' : currentRank === 3 ? '3rd' : `${currentRank}th`}
            {playerCount > 0 ? ` out of ${playerCount}` : ''}
          </p>
        )}
        <div className="bg-white/10 rounded-xl px-8 py-4 mt-4">
          <p className="text-white/80 text-sm">Final Score</p>
          <p className="text-white font-bold text-3xl tabular-nums">{totalScore.toLocaleString()}</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes podium-confetti {
          0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .animate-podium-confetti {
          animation: podium-confetti 3s ease-in-out infinite;
        }
        @keyframes podium-enter {
          0% { opacity: 0; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1); }
        }
        .animate-podium-enter {
          animation: podium-enter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes podium-trophy {
          0% { transform: scale(0) rotate(-30deg); }
          60% { transform: scale(1.3) rotate(10deg); }
          100% { transform: scale(1) rotate(0); }
        }
        .animate-podium-trophy {
          animation: podium-trophy 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both;
        }
      `}</style>
    </div>
  )

  return null
}

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { GameSession, Question, Participant } from '@/lib/types'
import { ANSWER_SHAPES } from '@/lib/types'
import { calculateScore, getStreakMultiplier, checkAnswer } from '@/lib/game-utils'
import type { RealtimeChannel } from '@supabase/supabase-js'

type GamePhase = 'lobby' | 'question' | 'results' | 'leaderboard' | 'podium'

interface PlayerAnswer {
  participantId: string
  nickname: string
  answerData: Record<string, unknown>
  timeTakenMs: number
}

export function HostGame({
  session,
  questions,
  quizTitle,
}: {
  session: GameSession
  questions: Question[]
  quizTitle: string
}) {
  const [phase, setPhase] = useState<GamePhase>('lobby')
  const [players, setPlayers] = useState<Map<string, { nickname: string; id?: string }>>(new Map())
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [timeLeft, setTimeLeft] = useState(0)
  const [answers, setAnswers] = useState<PlayerAnswer[]>([])
  const [leaderboard, setLeaderboard] = useState<{ id: string; nickname: string; score: number; delta: number }[]>([])
  const [scores, setScores] = useState<Map<string, { score: number; streak: number }>>(new Map())
  const [muted, setMuted] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const questionStartRef = useRef<number>(0)
  const supabase = createClient()

  const currentQuestion = currentIndex >= 0 ? questions[currentIndex] : null

  // Set up Realtime channel
  useEffect(() => {
    const channel = supabase.channel(`game:${session.pin}`, {
      config: { broadcast: { self: false } },
    })

    channel
      .on('broadcast', { event: 'player:answer' }, (payload) => {
        const { participantId, nickname, answerData, timeTakenMs } = payload.payload
        setAnswers((prev) => {
          if (prev.some((a) => a.participantId === participantId)) return prev
          return [...prev, { participantId, nickname, answerData, timeTakenMs }]
        })
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        setPlayers((prev) => {
          const next = new Map(prev)
          for (const p of newPresences) {
            next.set(p.presence_ref, { nickname: p.nickname, id: p.participantId })
          }
          return next
        })
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        setPlayers((prev) => {
          const next = new Map(prev)
          for (const p of leftPresences) {
            next.delete(p.presence_ref)
          }
          return next
        })
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
    }
  }, [session.pin, supabase])

  // Poll DB for participants (fallback for same-browser testing where Presence doesn't work)
  useEffect(() => {
    if (phase !== 'lobby') return
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('participants')
        .select('id, nickname')
        .eq('session_id', session.id)
      if (data && data.length > 0) {
        setPlayers((prev) => {
          const next = new Map(prev)
          for (const p of data) {
            if (!Array.from(next.values()).some((v) => v.id === p.id)) {
              next.set(`db-${p.id}`, { nickname: p.nickname, id: p.id })
            }
          }
          return next
        })
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [phase, session.id, supabase])

  // Timer countdown
  useEffect(() => {
    if (phase !== 'question' || timeLeft <= 0) return

    timerRef.current = setTimeout(() => {
      if (timeLeft <= 1) {
        // Time's up — lock answers
        channelRef.current?.send({
          type: 'broadcast',
          event: 'game:answer_lock',
          payload: {},
        })
        handleShowResults()
      } else {
        setTimeLeft(timeLeft - 1)
      }
    }, 1000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [phase, timeLeft])

  // Check if all players answered
  useEffect(() => {
    if (phase !== 'question') return
    if (answers.length >= players.size && players.size > 0) {
      // All players answered — auto advance
      if (timerRef.current) clearTimeout(timerRef.current)
      channelRef.current?.send({
        type: 'broadcast',
        event: 'game:answer_lock',
        payload: {},
      })
      handleShowResults()
    }
  }, [answers.length, players.size, phase])

  function startGame() {
    setPhase('question')
    advanceToQuestion(0)

    channelRef.current?.send({
      type: 'broadcast',
      event: 'game:start',
      payload: {},
    })

    // Update session status
    supabase.from('sessions').update({
      status: 'active',
      started_at: new Date().toISOString(),
      current_question_index: 0,
    }).eq('id', session.id).then(() => {})
  }

  function advanceToQuestion(index: number) {
    const q = questions[index]
    if (!q) return

    setCurrentIndex(index)
    setTimeLeft(q.time_limit)
    setAnswers([])
    setPhase('question')
    questionStartRef.current = Date.now()

    // Broadcast question to players (without correct answers)
    channelRef.current?.send({
      type: 'broadcast',
      event: 'game:question',
      payload: {
        index,
        type: q.type,
        questionText: q.question_text,
        options: q.options,
        timeLimit: q.time_limit,
        points: q.points,
        mediaUrl: q.media_url,
        totalQuestions: questions.length,
      },
    })

    supabase.from('sessions').update({ current_question_index: index }).eq('id', session.id).then(() => {})
  }

  const handleShowResults = useCallback(() => {
    if (!currentQuestion) return
    setPhase('results')

    // Calculate scores for each answer
    const newScores = new Map(scores)
    const deltas = new Map<string, number>()

    for (const answer of answers) {
      const isCorrect = checkAnswer(currentQuestion.type, answer.answerData, currentQuestion.correct_answers)
      const playerScore = newScores.get(answer.participantId) || { score: 0, streak: 0 }

      if (isCorrect) {
        playerScore.streak += 1
        const multiplier = getStreakMultiplier(playerScore.streak)
        const base = calculateScore(currentQuestion.points, answer.timeTakenMs, currentQuestion.time_limit * 1000, true)
        const points = Math.round(base * multiplier)
        playerScore.score += points
        deltas.set(answer.participantId, points)
      } else {
        playerScore.streak = 0
        deltas.set(answer.participantId, 0)
      }

      newScores.set(answer.participantId, playerScore)

      // Save answer to DB
      supabase.from('answers').insert({
        session_id: session.id,
        participant_id: answer.participantId,
        question_id: currentQuestion.id,
        answer_data: answer.answerData,
        is_correct: isCorrect,
        points_awarded: deltas.get(answer.participantId) || 0,
        time_taken_ms: answer.timeTakenMs,
      }).then(() => {})
    }

    setScores(newScores)

    // Build leaderboard
    const lb = Array.from(newScores.entries())
      .map(([id, s]) => {
        const player = Array.from(players.values()).find((p) => p.id === id)
        return {
          id,
          nickname: player?.nickname || 'Unknown',
          score: s.score,
          delta: deltas.get(id) || 0,
        }
      })
      .sort((a, b) => b.score - a.score)
    setLeaderboard(lb)

    // Broadcast results
    channelRef.current?.send({
      type: 'broadcast',
      event: 'game:results',
      payload: {
        correctAnswers: currentQuestion.correct_answers,
        answerCounts: getAnswerCounts(),
      },
    })
  }, [currentQuestion, answers, scores, players, session.id, supabase])

  function getAnswerCounts() {
    const counts: Record<string, number> = {}
    for (const a of answers) {
      const key = JSON.stringify(a.answerData)
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }

  function showLeaderboard() {
    setPhase('leaderboard')
    channelRef.current?.send({
      type: 'broadcast',
      event: 'game:leaderboard',
      payload: { leaderboard: leaderboard.slice(0, 5) },
    })
  }

  function nextQuestion() {
    const nextIndex = currentIndex + 1
    if (nextIndex >= questions.length) {
      showPodium()
    } else {
      advanceToQuestion(nextIndex)
    }
  }

  function showPodium() {
    setPhase('podium')

    // Update participants with final scores
    for (const [id, s] of scores) {
      supabase.from('participants').update({
        total_score: s.score,
        total_correct: s.streak, // simplified
      }).eq('id', id).then(() => {})
    }

    // Update final ranks
    leaderboard.forEach((entry, i) => {
      supabase.from('participants').update({ rank: i + 1 }).eq('id', entry.id).then(() => {})
    })

    supabase.from('sessions').update({
      status: 'completed',
      ended_at: new Date().toISOString(),
    }).eq('id', session.id).then(() => {})

    // Increment play count
    supabase.rpc('increment_play_count', { quiz_id_input: session.quiz_id }).then(() => {})

    channelRef.current?.send({
      type: 'broadcast',
      event: 'game:podium',
      payload: { podium: leaderboard.slice(0, 3) },
    })
  }

  // ── RENDER ──────────────────────────────────

  if (phase === 'lobby') return (
    <LobbyScreen
      pin={session.pin}
      players={players}
      quizTitle={quizTitle}
      onStart={startGame}
      muted={muted}
      onToggleMute={() => setMuted(!muted)}
    />
  )

  if (phase === 'question' && currentQuestion) return (
    <QuestionScreen
      question={currentQuestion}
      index={currentIndex}
      total={questions.length}
      timeLeft={timeLeft}
      answerCount={answers.length}
      playerCount={players.size}
    />
  )

  if (phase === 'results' && currentQuestion) return (
    <ResultsScreen
      question={currentQuestion}
      answers={answers}
      onNext={showLeaderboard}
    />
  )

  if (phase === 'leaderboard') return (
    <LeaderboardScreen
      leaderboard={leaderboard.slice(0, 5)}
      onNext={nextQuestion}
      isLast={currentIndex >= questions.length - 1}
    />
  )

  if (phase === 'podium') return (
    <PodiumScreen podium={leaderboard.slice(0, 3)} quizTitle={quizTitle} />
  )

  return null
}

// ── LOBBY ──────────────────────────────────

function LobbyScreen({
  pin,
  players,
  quizTitle,
  onStart,
  muted,
  onToggleMute,
}: {
  pin: string
  players: Map<string, { nickname: string; id?: string }>
  quizTitle: string
  onStart: () => void
  muted: boolean
  onToggleMute: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #0a0033 0%, #001b50 50%, #002a5c 100%)' }}>
      {/* Header */}
      <div className="text-center pt-6">
        <h1 className="text-3xl font-bold text-white">
          9Hoot<span className="text-yellow-accent">!</span>
        </h1>
        <p className="text-white/60 text-sm mt-1">{quizTitle}</p>
      </div>

      {/* PIN display */}
      <div className="flex justify-center mt-8">
        <div className="bg-white rounded-lg px-10 py-6 text-center shadow-2xl">
          <p className="text-sm text-gray-text font-bold mb-1">Game PIN:</p>
          <p className="text-5xl font-bold text-dark-text tracking-widest">{pin}</p>
          <p className="text-xs text-gray-text mt-2">Join at <span className="font-bold">9hoot.vercel.app/join</span></p>
        </div>
      </div>

      {/* Players */}
      <div className="flex-1 flex flex-col items-center mt-8 px-8">
        <div className="flex flex-wrap gap-2 justify-center max-w-3xl">
          {Array.from(players.values()).map((p, i) => (
            <span
              key={i}
              className="bg-white/10 text-white text-sm font-bold px-3 py-1.5 rounded animate-bounce-in"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {p.nickname}
            </span>
          ))}
        </div>
        {players.size === 0 && (
          <p className="text-white/40 text-sm mt-4">Waiting for players to join...</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-white text-sm font-bold">{players.size} player{players.size !== 1 ? 's' : ''}</span>
          <button onClick={onToggleMute} className="text-white/60 hover:text-white text-sm">
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
        {players.size > 0 && (
          <button
            onClick={onStart}
            className="h-12 px-10 bg-correct-green hover:bg-green-600 text-white font-bold text-lg rounded-lg shadow-lg transition-colors"
          >
            Start
          </button>
        )}
      </div>

      <style jsx>{`
        @keyframes bounce-in {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-bounce-in {
          animation: bounce-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
      `}</style>
    </div>
  )
}

// ── QUESTION DISPLAY ──────────────────────────────────

function QuestionScreen({
  question,
  index,
  total,
  timeLeft,
  answerCount,
  playerCount,
}: {
  question: Question
  index: number
  total: number
  timeLeft: number
  answerCount: number
  playerCount: number
}) {
  const options = (question.options as { text: string }[]) || []

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3">
        <span className="text-white/60 text-sm">{index + 1} of {total}</span>
        <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
          <span className="text-white text-2xl font-bold">{timeLeft}</span>
        </div>
        <span className="text-white/60 text-sm">{answerCount}/{playerCount} answers</span>
      </div>

      {/* Question */}
      <div className="px-8 py-4">
        <div className="bg-white/15 backdrop-blur rounded-lg px-8 py-4 text-center">
          <h2 className="text-2xl font-bold text-white">{question.question_text || 'Untitled question'}</h2>
        </div>
      </div>

      {/* Media */}
      {question.media_url && (
        <div className="flex justify-center px-8 mb-4">
          <img src={question.media_url} alt="" className="max-h-48 rounded-lg" />
        </div>
      )}

      {/* Answer options */}
      {options.length > 0 && (
        <div className="flex-1 px-8 pb-6">
          <div className={`grid gap-3 h-full ${options.length <= 2 ? 'grid-cols-2' : options.length <= 4 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-3 grid-rows-2'}`}>
            {options.map((opt, i) => {
              const shape = ANSWER_SHAPES[i]
              return (
                <div
                  key={i}
                  className="rounded-lg flex items-center gap-3 px-6 min-h-[80px]"
                  style={{ backgroundColor: shape.color }}
                >
                  <span className="text-white text-2xl">{shape.symbol}</span>
                  <span className="text-white font-bold text-lg">{opt.text || `Option ${i + 1}`}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── RESULTS ──────────────────────────────────

function ResultsScreen({
  question,
  answers,
  onNext,
}: {
  question: Question
  answers: PlayerAnswer[]
  onNext: () => void
}) {
  const options = (question.options as { text: string }[]) || []
  const correctAnswers = (question.correct_answers as number[]) || []

  // Count answers per option for MCQ/TF/Poll
  const optionCounts = options.map((_, i) => {
    return answers.filter((a) => {
      const selected = (a.answerData.selectedIndices as number[]) || (a.answerData.selected !== undefined ? [a.answerData.selected ? 0 : 1] : [])
      return selected.includes(i)
    }).length
  })

  const maxCount = Math.max(...optionCounts, 1)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
      {/* Question bar */}
      <div className="px-8 py-4 mt-4">
        <div className="bg-white/15 backdrop-blur rounded-lg px-8 py-3 text-center">
          <h2 className="text-xl font-bold text-white">{question.question_text}</h2>
        </div>
      </div>

      {/* Bar chart */}
      <div className="flex-1 flex items-end justify-center gap-6 px-12 pb-4">
        {options.map((_, i) => {
          const shape = ANSWER_SHAPES[i]
          const height = optionCounts[i] > 0 ? (optionCounts[i] / maxCount) * 200 : 4
          return (
            <div key={i} className="flex flex-col items-center gap-2">
              <div
                className="w-24 rounded-t-lg transition-all duration-700 ease-out"
                style={{
                  backgroundColor: shape.color,
                  height: `${height}px`,
                }}
              />
              <div className="flex items-center gap-1 text-white text-sm font-bold">
                <span>{shape.symbol}</span>
                <span>{optionCounts[i]}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Answer blocks with correct/incorrect indicators */}
      <div className={`grid gap-3 px-8 pb-6 ${options.length <= 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
        {options.map((opt, i) => {
          const shape = ANSWER_SHAPES[i]
          const isCorrect = correctAnswers.includes(i)
          return (
            <div
              key={i}
              className="rounded-lg flex items-center gap-3 px-6 py-4 transition-opacity"
              style={{
                backgroundColor: shape.color,
                opacity: isCorrect ? 1 : 0.5,
              }}
            >
              <span className="text-white text-xl">{shape.symbol}</span>
              <span className="text-white font-bold flex-1">{opt.text}</span>
              <span className="text-white text-xl">
                {isCorrect ? '✓' : '✕'}
              </span>
            </div>
          )
        })}
      </div>

      {/* Next button */}
      <div className="flex justify-end px-8 pb-6">
        <button
          onClick={onNext}
          className="h-12 px-8 bg-white text-purple-primary font-bold text-sm rounded-lg hover:bg-gray-100 transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  )
}

// ── LEADERBOARD ──────────────────────────────────

function LeaderboardScreen({
  leaderboard,
  onNext,
  isLast,
}: {
  leaderboard: { id: string; nickname: string; score: number; delta: number }[]
  onNext: () => void
  isLast: boolean
}) {
  return (
    <div className="min-h-screen flex flex-col items-center" style={{ background: 'linear-gradient(135deg, #0a0033 0%, #1a0a3e 100%)' }}>
      <h2 className="text-3xl font-bold text-white mt-10 mb-8">Leaderboard</h2>

      <div className="w-full max-w-xl px-8 space-y-3">
        {leaderboard.map((entry, i) => (
          <div
            key={entry.id}
            className="flex items-center gap-4 bg-white/10 rounded-lg px-6 py-4 transition-all duration-800"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            <span className="text-2xl font-bold text-white w-8">{i + 1}</span>
            <span className="flex-1 text-white font-bold text-lg">{entry.nickname}</span>
            {entry.delta > 0 && (
              <span className="text-correct-green text-sm font-bold">+{entry.delta}</span>
            )}
            <span className="text-white font-bold text-xl">{entry.score}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto pb-8">
        <button
          onClick={onNext}
          className="h-12 px-8 bg-white text-purple-primary font-bold text-sm rounded-lg hover:bg-gray-100 transition-colors"
        >
          {isLast ? 'Show Podium' : 'Next Question →'}
        </button>
      </div>
    </div>
  )
}

// ── PODIUM ──────────────────────────────────

function PodiumScreen({
  podium,
  quizTitle,
}: {
  podium: { id: string; nickname: string; score: number }[]
  quizTitle: string
}) {
  const podiumColors = ['#FFD700', '#C0C0C0', '#CD7F32']
  const podiumHeights = [200, 160, 130]
  // Reorder: 2nd, 1st, 3rd
  const ordered = [podium[1], podium[0], podium[2]].filter(Boolean)
  const orderedColors = [podiumColors[1], podiumColors[0], podiumColors[2]]
  const orderedHeights = [podiumHeights[1], podiumHeights[0], podiumHeights[2]]
  const orderedLabels = ['2nd', '1st', '3rd']

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
      {/* Confetti placeholder */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 40 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full animate-confetti"
            style={{
              backgroundColor: ['#FFD700', '#E21B3C', '#1368CE', '#26890C', '#D89E00', '#FF69B4'][i % 6],
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      <h1 className="text-4xl font-bold text-white mb-2 z-10">
        9Hoot<span className="text-yellow-accent">!</span>
      </h1>
      <p className="text-white/60 text-sm mb-12 z-10">{quizTitle}</p>

      {/* Podium */}
      <div className="flex items-end gap-4 z-10">
        {ordered.map((entry, i) => entry && (
          <div key={entry.id} className="flex flex-col items-center">
            <span className="text-white font-bold text-lg mb-2">{entry.nickname}</span>
            <span className="text-white/80 text-sm mb-2">{entry.score} pts</span>
            <div
              className="w-32 rounded-t-lg flex items-start justify-center pt-4 transition-all duration-1000"
              style={{
                backgroundColor: orderedColors[i],
                height: `${orderedHeights[i]}px`,
              }}
            >
              <span className="text-2xl font-bold text-white/90">{orderedLabels[i]}</span>
            </div>
          </div>
        ))}
      </div>

      <a
        href="/library"
        className="mt-12 h-12 px-8 bg-white text-purple-primary font-bold text-sm rounded-lg flex items-center hover:bg-gray-100 transition-colors z-10"
      >
        Back to Library
      </a>

      <style jsx>{`
        @keyframes confetti {
          0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .animate-confetti {
          animation: confetti 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

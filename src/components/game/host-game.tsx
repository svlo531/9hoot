'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { GameSession, Question } from '@/lib/types'
import { ANSWER_SHAPES } from '@/lib/types'
import { calculateScore, getStreakMultiplier, checkAnswer } from '@/lib/game-utils'
import { useGameAudio } from '@/lib/use-game-audio'
import { CountdownTimer } from './countdown-timer'
import type { RealtimeChannel } from '@supabase/supabase-js'

type GamePhase = 'lobby' | 'getReady' | 'question' | 'results' | 'leaderboard' | 'podium'

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
  const [getReadyCount, setGetReadyCount] = useState(3)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const questionStartRef = useRef<number>(0)
  const handleShowResultsRef = useRef<() => void>(() => {})
  const supabase = createClient()
  const audio = useGameAudio()

  const currentQuestion = currentIndex >= 0 ? questions[currentIndex] : null

  // Sync mute state with audio engine
  useEffect(() => {
    audio.setMuted(muted)
  }, [muted, audio])

  // Set up Realtime channel
  useEffect(() => {
    const channel = supabase.channel(`game:${session.pin}`, {
      config: { broadcast: { self: false } },
    })

    channel
      .on('broadcast', { event: 'player:answer' }, (payload: { payload: Record<string, unknown> }) => {
        const { participantId, nickname, answerData, timeTakenMs } = payload.payload as { participantId: string; nickname: string; answerData: Record<string, unknown>; timeTakenMs: number }
        setAnswers((prev) => {
          if (prev.some((a) => a.participantId === participantId)) return prev
          return [...prev, { participantId, nickname, answerData, timeTakenMs }]
        })
      })
      .on('presence', { event: 'join' }, ({ newPresences }: { newPresences: Record<string, unknown>[] }) => {
        setPlayers((prev) => {
          const next = new Map(prev)
          for (const p of newPresences) {
            next.set(p.presence_ref as string, { nickname: p.nickname as string, id: p.participantId as string })
          }
          return next
        })
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }: { leftPresences: Record<string, unknown>[] }) => {
        setPlayers((prev) => {
          const next = new Map(prev)
          for (const p of leftPresences) {
            next.delete(p.presence_ref as string)
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

  // Poll DB for participants (fallback)
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
        audio.play('timesUp')
        channelRef.current?.send({
          type: 'broadcast',
          event: 'game:answer_lock',
          payload: {},
        })
        handleShowResultsRef.current()
      } else {
        // Play tick sound
        if (timeLeft <= 6) {
          audio.play('countdownUrgent')
        } else {
          audio.play('countdownTick')
        }
        setTimeLeft(timeLeft - 1)
      }
    }, 1000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [phase, timeLeft, audio])

  // Check if all players answered
  useEffect(() => {
    if (phase !== 'question') return
    if (answers.length >= players.size && players.size > 0) {
      if (timerRef.current) clearTimeout(timerRef.current)
      channelRef.current?.send({
        type: 'broadcast',
        event: 'game:answer_lock',
        payload: {},
      })
      handleShowResults()
    }
  }, [answers.length, players.size, phase])

  // Poll DB for answers during question phase (fallback)
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion) return
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('answers')
        .select('participant_id, answer_data, time_taken_ms')
        .eq('session_id', session.id)
        .eq('question_id', currentQuestion.id)

      if (data && data.length > 0) {
        setAnswers((prev) => {
          const existing = new Set(prev.map((a) => a.participantId))
          const newAnswers = [...prev]
          for (const a of data) {
            if (!existing.has(a.participant_id)) {
              const player = Array.from(players.values()).find((p) => p.id === a.participant_id)
              newAnswers.push({
                participantId: a.participant_id,
                nickname: player?.nickname || 'Player',
                answerData: a.answer_data as Record<string, unknown>,
                timeTakenMs: a.time_taken_ms || 5000,
              })
              existing.add(a.participant_id)
            }
          }
          return newAnswers
        })
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [phase, currentQuestion, session.id, players, supabase])

  function startGame() {
    // BGM keeps playing through the entire game — only stops at podium
    audio.play('gameStart')

    channelRef.current?.send({
      type: 'broadcast',
      event: 'game:start',
      payload: {},
    })

    // Only set status to active — DO NOT set current_question_index yet.
    // The player polls for index changes, so setting it here would make
    // them see the question before the Get Ready countdown finishes.
    supabase.from('sessions').update({
      status: 'active',
      started_at: new Date().toISOString(),
    }).eq('id', session.id).then(() => {})

    // Show Get Ready screen first
    showGetReady(0)
  }

  function showGetReady(index: number) {
    setCurrentIndex(index)
    setPhase('getReady')
    setGetReadyCount(3)
    audio.play('getReady')

    let count = 3
    const interval = setInterval(() => {
      count--
      if (count <= 0) {
        clearInterval(interval)
        startQuestion(index)
      } else {
        setGetReadyCount(count)
      }
    }, 1000)
  }

  function startQuestion(index: number) {
    const q = questions[index]
    if (!q) return

    setCurrentIndex(index)
    setTimeLeft(q.time_limit)
    setAnswers([])
    setPhase('question')
    questionStartRef.current = Date.now()

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

    supabase.from('sessions').update({ current_question_index: index, status: 'active' }).eq('id', session.id).then(() => {})
  }

  const handleShowResults = useCallback(() => {
    if (!currentQuestion) return
    setPhase('results')

    // Lock answers in DB — Postgres Changes pushes this to players instantly
    supabase.from('sessions').update({ status: 'reviewing' }).eq('id', session.id).then(() => {})

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
      // NOTE: Player already inserted the answer row to DB.
      // Host only calculates scores in memory — final totals
      // are written to participants table in showPodium().
    }

    setScores(newScores)

    // Build leaderboard from ALL players, not just those who scored
    const lb = Array.from(players.entries())
      .filter(([, p]) => p.id) // Only DB-confirmed players
      .map(([, p]) => {
        const id = p.id!
        const s = newScores.get(id)
        return {
          id,
          nickname: p.nickname,
          score: s?.score || 0,
          delta: deltas.get(id) || 0,
        }
      })
      .sort((a, b) => b.score - a.score)
    setLeaderboard(lb)

    channelRef.current?.send({
      type: 'broadcast',
      event: 'game:results',
      payload: {
        correctAnswers: currentQuestion.correct_answers,
        answerCounts: getAnswerCounts(),
      },
    })
  }, [currentQuestion, answers, scores, players, session.id, supabase])

  handleShowResultsRef.current = handleShowResults

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
    audio.play('leaderboardReveal')
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
      showGetReady(nextIndex)
    }
  }

  async function showPodium() {
    setPhase('podium')
    audio.stopLobbyMusic()
    audio.play('podiumCelebration')

    // Write scores and ranks FIRST — must complete before status change
    // so player reads correct values when podium triggers
    const scoreWrites = Array.from(scores).map(([id, s]) =>
      supabase.from('participants').update({
        total_score: s.score,
        total_correct: s.streak,
      }).eq('id', id)
    )

    const rankWrites = leaderboard.map((entry, i) =>
      supabase.from('participants').update({ rank: i + 1 }).eq('id', entry.id)
    )

    await Promise.all([...scoreWrites, ...rankWrites])

    // THEN set completed — this triggers player podium via Postgres Changes
    await supabase.from('sessions').update({
      status: 'completed',
      ended_at: new Date().toISOString(),
    }).eq('id', session.id)

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
      audio={audio}
    />
  )

  if (phase === 'getReady') return (
    <GetReadyScreen
      questionIndex={currentIndex}
      totalQuestions={questions.length}
      count={getReadyCount}
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

  if (phase === 'results' && currentQuestion) {
    const isNonScored = ['open_ended', 'nps_survey', 'poll', 'word_cloud'].includes(currentQuestion.type)
    return (
      <ResultsScreen
        question={currentQuestion}
        answers={answers}
        onNext={isNonScored ? nextQuestion : showLeaderboard}
      />
    )
  }

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

// ── GET READY ──────────────────────────────────

function GetReadyScreen({
  questionIndex,
  totalQuestions,
  count,
}: {
  questionIndex: number
  totalQuestions: number
  count: number
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
      <div className="text-center animate-getready-enter">
        <p className="text-white/60 text-lg mb-4 font-bold">
          Question {questionIndex + 1} of {totalQuestions}
        </p>
        <div className="relative">
          <div className="w-32 h-32 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-6 animate-getready-pulse">
            <span className="text-white text-6xl font-bold animate-getready-number" key={count}>
              {count}
            </span>
          </div>
        </div>
        <h2 className="text-white text-3xl font-bold">Get Ready!</h2>
      </div>

      <style jsx>{`
        @keyframes getready-enter {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-getready-enter {
          animation: getready-enter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes getready-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0.3); }
          50% { transform: scale(1.05); box-shadow: 0 0 0 20px rgba(255,255,255,0); }
        }
        .animate-getready-pulse {
          animation: getready-pulse 1s ease-in-out infinite;
        }
        @keyframes getready-number {
          0% { transform: scale(1.5); opacity: 0; }
          30% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-getready-number {
          animation: getready-number 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
      `}</style>
    </div>
  )
}

// ── LOBBY ──────────────────────────────────

function LobbyScreen({
  pin,
  players,
  quizTitle,
  onStart,
  muted,
  onToggleMute,
  audio,
}: {
  pin: string
  players: Map<string, { nickname: string; id?: string }>
  quizTitle: string
  onStart: () => void
  muted: boolean
  onToggleMute: () => void
  audio: ReturnType<typeof useGameAudio>
}) {
  // Start lobby music — persists through the entire game, stopped at podium
  useEffect(() => {
    if (!muted) {
      audio.play('lobbyMusic')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="bg-white rounded-lg px-10 py-6 text-center shadow-2xl animate-lobby-pin">
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
              className="bg-white/10 text-white text-sm font-bold px-3 py-1.5 rounded animate-bounce-in backdrop-blur-sm"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {p.nickname}
            </span>
          ))}
        </div>
        {players.size === 0 && (
          <div className="text-center mt-8 animate-lobby-waiting">
            <div className="text-4xl mb-3">👋</div>
            <p className="text-white/40 text-sm">Waiting for players to join...</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 rounded-full px-4 py-2 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-correct-green animate-pulse" />
            <span className="text-white text-sm font-bold">{players.size} player{players.size !== 1 ? 's' : ''}</span>
          </div>
          <button
            onClick={onToggleMute}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all"
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
        {players.size > 0 && (
          <button
            onClick={onStart}
            className="h-12 px-10 bg-correct-green hover:bg-green-600 text-white font-bold text-lg rounded-lg shadow-lg transition-all hover:scale-105 active:scale-95 animate-lobby-start"
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
        @keyframes lobby-pin {
          0% { transform: translateY(-20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-lobby-pin {
          animation: lobby-pin 0.6s ease-out both;
        }
        @keyframes lobby-waiting {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        .animate-lobby-waiting {
          animation: lobby-waiting 3s ease-in-out infinite;
        }
        @keyframes lobby-start {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-lobby-start {
          animation: lobby-start 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
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
    <div className="min-h-screen flex flex-col animate-question-enter" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3">
        <span className="text-white/60 text-sm font-bold">{index + 1} of {total}</span>
        <CountdownTimer timeLeft={timeLeft} totalTime={question.time_limit} size={80} />
        <div className="flex items-center gap-2">
          <span className="text-white/60 text-sm font-bold">{answerCount}/{playerCount}</span>
          <span className="text-white/40 text-xs">answers</span>
        </div>
      </div>

      {/* Question */}
      <div className="px-8 py-4">
        <div className="bg-white/15 backdrop-blur-md rounded-xl px-8 py-5 text-center shadow-lg">
          <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight">{question.question_text || 'Untitled question'}</h2>
        </div>
      </div>

      {/* Media */}
      {question.media_url && (
        <div className="flex justify-center px-8 mb-4">
          <img src={question.media_url} alt="" className="max-h-48 rounded-lg shadow-lg" />
        </div>
      )}

      {/* Answer area — varies by type */}
      {question.type === 'type_answer' && (
        <div className="flex-1 flex items-center justify-center px-8 pb-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-12 py-8 text-center animate-answer-slide">
            <div className="text-5xl mb-4">⌨️</div>
            <p className="text-white font-bold text-xl">Type your answer!</p>
            <p className="text-white/40 text-sm mt-2">{answerCount} of {playerCount} answered</p>
          </div>
        </div>
      )}

      {question.type === 'open_ended' && (
        <div className="flex-1 flex items-center justify-center px-8 pb-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-12 py-8 text-center animate-answer-slide">
            <div className="text-5xl mb-4">💬</div>
            <p className="text-white font-bold text-xl">Share your thoughts!</p>
            <p className="text-white/40 text-sm mt-2">{answerCount} of {playerCount} responded</p>
          </div>
        </div>
      )}

      {question.type === 'nps_survey' && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-6 animate-answer-slide">
          <div className="flex gap-2 mb-4">
            {Array.from({ length: 11 }, (_, i) => (
              <div
                key={i}
                className="w-12 h-12 rounded-lg text-white font-bold text-lg flex items-center justify-center shadow-lg"
                style={{ backgroundColor: i <= 6 ? '#E21B3C' : i <= 8 ? '#D89E00' : '#26890C' }}
              >
                {i}
              </div>
            ))}
          </div>
          <div className="flex justify-between w-full max-w-lg text-xs text-white/40">
            <span>Not likely</span>
            <span>Very likely</span>
          </div>
          <p className="text-white/40 text-sm mt-4">{answerCount} of {playerCount} responded</p>
        </div>
      )}

      {question.type === 'slider' && (
        <div className="flex-1 flex items-center justify-center px-8 pb-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-12 py-8 text-center w-full max-w-lg animate-answer-slide">
            <div className="text-5xl mb-4">🎚️</div>
            <p className="text-white font-bold text-xl mb-4">Drag to answer!</p>
            {(() => {
              const sOpts = question.options as { min?: number; max?: number } | null
              return (
                <div className="flex justify-between text-white/40 text-sm">
                  <span>{sOpts?.min ?? 0}</span>
                  <span>{sOpts?.max ?? 100}</span>
                </div>
              )
            })()}
            <div className="w-full h-3 bg-white/20 rounded-full mt-2" />
            <p className="text-white/40 text-sm mt-4">{answerCount} of {playerCount} answered</p>
          </div>
        </div>
      )}

      {question.type === 'puzzle' && (
        <div className="flex-1 flex items-center justify-center px-8 pb-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-12 py-8 text-center animate-answer-slide">
            <div className="text-5xl mb-4">🧩</div>
            <p className="text-white font-bold text-xl">Put them in order!</p>
            <p className="text-white/40 text-sm mt-2">{answerCount} of {playerCount} answered</p>
          </div>
        </div>
      )}

      {question.type === 'word_cloud' && (
        <div className="flex-1 flex items-center justify-center px-8 pb-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-12 py-8 text-center animate-answer-slide">
            <div className="text-5xl mb-4">☁️</div>
            <p className="text-white font-bold text-xl">Type your word!</p>
            <p className="text-white/40 text-sm mt-2">{answerCount} of {playerCount} responded</p>
          </div>
        </div>
      )}

      {/* Standard answer options (quiz, true_false, poll) */}
      {options.length > 0 && !['type_answer', 'open_ended', 'nps_survey', 'slider', 'puzzle', 'word_cloud'].includes(question.type) && (
        <div className="flex-1 px-8 pb-6">
          <div className={`grid gap-3 h-full ${options.length <= 2 ? 'grid-cols-2' : options.length <= 4 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-3 grid-rows-2'}`}>
            {options.map((opt, i) => {
              const shape = ANSWER_SHAPES[i]
              return (
                <div
                  key={i}
                  className="rounded-lg flex items-center gap-3 px-6 min-h-[80px] shadow-lg animate-answer-slide"
                  style={{
                    backgroundColor: shape.color,
                    animationDelay: `${i * 100}ms`,
                  }}
                >
                  <span className="text-white text-2xl opacity-80">{shape.symbol}</span>
                  <span className="text-white font-bold text-lg">{opt.text || `Option ${i + 1}`}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes question-enter {
          0% { opacity: 0; transform: translateX(30px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        .animate-question-enter {
          animation: question-enter 0.5s ease-out both;
        }
        @keyframes answer-slide {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-answer-slide {
          animation: answer-slide 0.4s ease-out both;
        }
      `}</style>
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
  const [barsVisible, setBarsVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setBarsVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  // Type Answer results
  if (question.type === 'type_answer') {
    const accepted = (question.correct_answers as { text: string }[]) || []
    const correctCount = answers.filter((a) => checkAnswer('type_answer', a.answerData, question.correct_answers)).length
    const incorrectCount = answers.length - correctCount

    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
        <div className="px-8 py-4 mt-4">
          <div className="bg-white/15 backdrop-blur-md rounded-xl px-8 py-3 text-center">
            <h2 className="text-xl font-bold text-white">{question.question_text}</h2>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8">
          {/* Correct answers reveal */}
          <div className="mb-6">
            <p className="text-white/60 text-sm text-center mb-3 font-bold">Correct answer{accepted.length > 1 ? 's' : ''}</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {accepted.map((a, i) => (
                <div key={i} className="bg-correct-green rounded-lg px-6 py-3 shadow-lg animate-results-check">
                  <span className="text-white font-bold text-xl">{a.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Correct/Incorrect bars */}
          <div className="flex items-end gap-12">
            <div className="flex flex-col items-center gap-2">
              <div className={`text-white font-bold text-2xl transition-opacity duration-500 ${barsVisible ? 'opacity-100' : 'opacity-0'}`}>{correctCount}</div>
              <div className="w-28 rounded-t-lg transition-all ease-out" style={{ backgroundColor: '#26890C', height: barsVisible ? `${Math.max((correctCount / Math.max(answers.length, 1)) * 150, 8)}px` : '4px', transitionDuration: '700ms' }} />
              <span className="text-correct-green font-bold text-sm">Correct</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className={`text-white font-bold text-2xl transition-opacity duration-500 ${barsVisible ? 'opacity-100' : 'opacity-0'}`}>{incorrectCount}</div>
              <div className="w-28 rounded-t-lg transition-all ease-out" style={{ backgroundColor: '#E21B3C', height: barsVisible ? `${Math.max((incorrectCount / Math.max(answers.length, 1)) * 150, 8)}px` : '4px', transitionDuration: '700ms', transitionDelay: '100ms' }} />
              <span className="text-answer-red font-bold text-sm">Incorrect</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end px-8 pb-6">
          <button onClick={onNext} className="h-12 px-8 bg-white text-purple-primary font-bold text-sm rounded-lg hover:bg-gray-100 transition-all hover:scale-105 active:scale-95 shadow-lg">Next →</button>
        </div>
        <style jsx>{`@keyframes results-check { 0% { transform: scale(0); opacity: 0; } 50% { transform: scale(1.3); } 100% { transform: scale(1); opacity: 1; } } .animate-results-check { animation: results-check 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both; }`}</style>
      </div>
    )
  }

  // Open-ended results — response wall
  if (question.type === 'open_ended') {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
        <div className="px-8 py-4 mt-4">
          <div className="bg-white/15 backdrop-blur-md rounded-xl px-8 py-3 text-center">
            <h2 className="text-xl font-bold text-white">{question.question_text}</h2>
          </div>
        </div>

        <div className="flex-1 px-8 pb-4 overflow-y-auto">
          <p className="text-white/50 text-sm text-center mb-4">{answers.length} response{answers.length !== 1 ? 's' : ''}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-4xl mx-auto">
            {answers.map((a, i) => (
              <div
                key={i}
                className="bg-white/10 backdrop-blur-sm rounded-lg p-4 animate-response-card"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <p className="text-white text-sm leading-relaxed">{(a.answerData.text as string) || ''}</p>
                <p className="text-white/30 text-xs mt-2">{a.nickname}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end px-8 pb-6 flex-shrink-0">
          <button onClick={onNext} className="h-12 px-8 bg-white text-purple-primary font-bold text-sm rounded-lg hover:bg-gray-100 transition-all hover:scale-105 active:scale-95 shadow-lg">Next →</button>
        </div>
        <style jsx>{`@keyframes response-card { 0% { transform: translateY(10px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } } .animate-response-card { animation: response-card 0.3s ease-out both; }`}</style>
      </div>
    )
  }

  // NPS results — segmented bar chart
  if (question.type === 'nps_survey') {
    const scores = answers.map((a) => (a.answerData.score as number) ?? -1).filter((s) => s >= 0)
    const detractors = scores.filter((s) => s <= 6).length
    const passives = scores.filter((s) => s >= 7 && s <= 8).length
    const promoters = scores.filter((s) => s >= 9).length
    const total = scores.length || 1
    const npsScore = Math.round(((promoters - detractors) / total) * 100)
    const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—'

    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
        <div className="px-8 py-4 mt-4">
          <div className="bg-white/15 backdrop-blur-md rounded-xl px-8 py-3 text-center">
            <h2 className="text-xl font-bold text-white">{question.question_text}</h2>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8">
          {/* NPS Score */}
          <div className="text-center mb-8">
            <p className="text-white/50 text-sm font-bold mb-1">NPS Score</p>
            <div className="text-6xl font-bold text-white">{npsScore}</div>
            <p className="text-white/40 text-sm mt-1">Average: {avgScore}/10</p>
          </div>

          {/* Segmented bar */}
          <div className="w-full max-w-lg">
            <div className="flex rounded-lg overflow-hidden h-12 shadow-lg">
              {detractors > 0 && (
                <div
                  className="flex items-center justify-center transition-all duration-700"
                  style={{ backgroundColor: '#E21B3C', width: barsVisible ? `${(detractors / total) * 100}%` : '0%' }}
                >
                  <span className="text-white font-bold text-sm">{detractors}</span>
                </div>
              )}
              {passives > 0 && (
                <div
                  className="flex items-center justify-center transition-all duration-700"
                  style={{ backgroundColor: '#D89E00', width: barsVisible ? `${(passives / total) * 100}%` : '0%', transitionDelay: '100ms' }}
                >
                  <span className="text-white font-bold text-sm">{passives}</span>
                </div>
              )}
              {promoters > 0 && (
                <div
                  className="flex items-center justify-center transition-all duration-700"
                  style={{ backgroundColor: '#26890C', width: barsVisible ? `${(promoters / total) * 100}%` : '0%', transitionDelay: '200ms' }}
                >
                  <span className="text-white font-bold text-sm">{promoters}</span>
                </div>
              )}
            </div>
            <div className="flex justify-between mt-2 text-xs">
              <span className="text-[#E21B3C] font-bold">Detractors ({Math.round((detractors / total) * 100)}%)</span>
              <span className="text-[#D89E00] font-bold">Passives ({Math.round((passives / total) * 100)}%)</span>
              <span className="text-[#26890C] font-bold">Promoters ({Math.round((promoters / total) * 100)}%)</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end px-8 pb-6">
          <button onClick={onNext} className="h-12 px-8 bg-white text-purple-primary font-bold text-sm rounded-lg hover:bg-gray-100 transition-all hover:scale-105 active:scale-95 shadow-lg">Next →</button>
        </div>
      </div>
    )
  }

  // Slider results — show correct value + answer distribution
  if (question.type === 'slider') {
    const sOpts = (question.options as { min?: number; max?: number } | null) || {}
    const correct = (question.correct_answers as { value: number; margin?: number }) || { value: 50, margin: 0 }
    const playerValues = answers.map((a) => (a.answerData.value as number) ?? null).filter((v): v is number => v !== null)
    const correctCount = answers.filter((a) => checkAnswer('slider', a.answerData, question.correct_answers)).length
    const avgValue = playerValues.length > 0 ? (playerValues.reduce((a, b) => a + b, 0) / playerValues.length).toFixed(1) : '—'

    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
        <div className="px-8 py-4 mt-4">
          <div className="bg-white/15 backdrop-blur-md rounded-xl px-8 py-3 text-center">
            <h2 className="text-xl font-bold text-white">{question.question_text}</h2>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="mb-6 text-center">
            <p className="text-white/50 text-sm font-bold mb-1">Correct answer</p>
            <div className="bg-correct-green rounded-lg px-8 py-3 shadow-lg animate-results-check inline-block">
              <span className="text-white font-bold text-3xl">{correct.value}</span>
              {(correct.margin ?? 0) > 0 && <span className="text-white/70 text-lg ml-2">(±{correct.margin})</span>}
            </div>
          </div>

          <div className="flex items-end gap-12 mb-4">
            <div className="flex flex-col items-center gap-2">
              <div className={`text-white font-bold text-2xl transition-opacity duration-500 ${barsVisible ? 'opacity-100' : 'opacity-0'}`}>{correctCount}</div>
              <div className="w-28 rounded-t-lg transition-all ease-out" style={{ backgroundColor: '#26890C', height: barsVisible ? `${Math.max((correctCount / Math.max(answers.length, 1)) * 150, 8)}px` : '4px', transitionDuration: '700ms' }} />
              <span className="text-correct-green font-bold text-sm">Within range</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className={`text-white font-bold text-2xl transition-opacity duration-500 ${barsVisible ? 'opacity-100' : 'opacity-0'}`}>{answers.length - correctCount}</div>
              <div className="w-28 rounded-t-lg transition-all ease-out" style={{ backgroundColor: '#E21B3C', height: barsVisible ? `${Math.max(((answers.length - correctCount) / Math.max(answers.length, 1)) * 150, 8)}px` : '4px', transitionDuration: '700ms', transitionDelay: '100ms' }} />
              <span className="text-answer-red font-bold text-sm">Outside range</span>
            </div>
          </div>

          <p className="text-white/40 text-sm">Average answer: {avgValue} | Range: {sOpts.min ?? 0}–{sOpts.max ?? 100}</p>
        </div>

        <div className="flex justify-end px-8 pb-6">
          <button onClick={onNext} className="h-12 px-8 bg-white text-purple-primary font-bold text-sm rounded-lg hover:bg-gray-100 transition-all hover:scale-105 active:scale-95 shadow-lg">Next →</button>
        </div>
        <style jsx>{`@keyframes results-check { 0% { transform: scale(0); opacity: 0; } 50% { transform: scale(1.3); } 100% { transform: scale(1); opacity: 1; } } .animate-results-check { animation: results-check 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both; }`}</style>
      </div>
    )
  }

  // Puzzle results — show correct order + how many got it right
  if (question.type === 'puzzle') {
    const items = (question.options as { text: string }[]) || []
    const correctCount = answers.filter((a) => checkAnswer('puzzle', a.answerData, question.correct_answers)).length

    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
        <div className="px-8 py-4 mt-4">
          <div className="bg-white/15 backdrop-blur-md rounded-xl px-8 py-3 text-center">
            <h2 className="text-xl font-bold text-white">{question.question_text}</h2>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <p className="text-white/50 text-sm font-bold mb-3">Correct order</p>
          <div className="space-y-2 mb-6 w-full max-w-md">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-correct-green/20 border border-correct-green/40 rounded-lg px-4 py-2 animate-response-card" style={{ animationDelay: `${i * 100}ms` }}>
                <span className="text-correct-green font-bold text-lg w-6">{i + 1}</span>
                <span className="text-white font-bold text-sm">{item.text}</span>
              </div>
            ))}
          </div>

          <div className="flex items-end gap-12">
            <div className="flex flex-col items-center gap-2">
              <div className={`text-white font-bold text-2xl transition-opacity duration-500 ${barsVisible ? 'opacity-100' : 'opacity-0'}`}>{correctCount}</div>
              <div className="w-28 rounded-t-lg transition-all ease-out" style={{ backgroundColor: '#26890C', height: barsVisible ? `${Math.max((correctCount / Math.max(answers.length, 1)) * 120, 8)}px` : '4px', transitionDuration: '700ms' }} />
              <span className="text-correct-green font-bold text-sm">Perfect</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className={`text-white font-bold text-2xl transition-opacity duration-500 ${barsVisible ? 'opacity-100' : 'opacity-0'}`}>{answers.length - correctCount}</div>
              <div className="w-28 rounded-t-lg transition-all ease-out" style={{ backgroundColor: '#E21B3C', height: barsVisible ? `${Math.max(((answers.length - correctCount) / Math.max(answers.length, 1)) * 120, 8)}px` : '4px', transitionDuration: '700ms', transitionDelay: '100ms' }} />
              <span className="text-answer-red font-bold text-sm">Wrong order</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end px-8 pb-6">
          <button onClick={onNext} className="h-12 px-8 bg-white text-purple-primary font-bold text-sm rounded-lg hover:bg-gray-100 transition-all hover:scale-105 active:scale-95 shadow-lg">Next →</button>
        </div>
        <style jsx>{`@keyframes response-card { 0% { transform: translateY(10px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } } .animate-response-card { animation: response-card 0.3s ease-out both; }`}</style>
      </div>
    )
  }

  // Word Cloud results — animated cloud
  if (question.type === 'word_cloud') {
    const wordMap = new Map<string, number>()
    for (const a of answers) {
      const word = ((a.answerData.text as string) || '').trim().toLowerCase()
      if (word) wordMap.set(word, (wordMap.get(word) || 0) + 1)
    }
    const words = Array.from(wordMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
    const maxFreq = Math.max(...words.map(([, c]) => c), 1)
    const cloudColors = ['#E21B3C', '#1368CE', '#D89E00', '#26890C', '#0AA3CF', '#B8116E', '#FFD700', '#FF69B4']

    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
        <div className="px-8 py-4 mt-4">
          <div className="bg-white/15 backdrop-blur-md rounded-xl px-8 py-3 text-center">
            <h2 className="text-xl font-bold text-white">{question.question_text}</h2>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-8 pb-4">
          {words.length === 0 ? (
            <p className="text-white/40 text-sm">No responses yet</p>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-3 max-w-3xl">
              {words.map(([word, count], i) => {
                const scale = 0.7 + (count / maxFreq) * 1.8
                return (
                  <span
                    key={word}
                    className="font-bold transition-all animate-cloud-word"
                    style={{
                      fontSize: `${scale}rem`,
                      color: cloudColors[i % cloudColors.length],
                      animationDelay: `${i * 60}ms`,
                    }}
                  >
                    {word}
                    {count > 1 && <sup className="text-white/40 text-xs ml-0.5">{count}</sup>}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center px-8 pb-6">
          <span className="text-white/30 text-sm">{answers.length} response{answers.length !== 1 ? 's' : ''}</span>
          <button onClick={onNext} className="h-12 px-8 bg-white text-purple-primary font-bold text-sm rounded-lg hover:bg-gray-100 transition-all hover:scale-105 active:scale-95 shadow-lg">Next →</button>
        </div>

        <style jsx>{`@keyframes cloud-word { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } } .animate-cloud-word { animation: cloud-word 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both; }`}</style>
      </div>
    )
  }

  // Default results (quiz, true_false, poll) — bar chart
  const options = (question.options as { text: string }[]) || []
  const correctAnswers = (question.correct_answers as number[]) || []

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
        <div className="bg-white/15 backdrop-blur-md rounded-xl px-8 py-3 text-center">
          <h2 className="text-xl font-bold text-white">{question.question_text}</h2>
        </div>
      </div>

      {/* Bar chart */}
      <div className="flex-1 flex items-end justify-center gap-6 px-12 pb-4">
        {options.map((_, i) => {
          const shape = ANSWER_SHAPES[i]
          const targetHeight = optionCounts[i] > 0 ? (optionCounts[i] / maxCount) * 200 : 4
          const isCorrect = correctAnswers.includes(i)
          return (
            <div key={i} className="flex flex-col items-center gap-2">
              {/* Count badge */}
              <div className={`text-white font-bold text-lg transition-opacity duration-500 ${barsVisible ? 'opacity-100' : 'opacity-0'}`}>
                {optionCounts[i]}
              </div>
              {/* Bar */}
              <div
                className="w-24 rounded-t-lg transition-all ease-out relative overflow-hidden"
                style={{
                  backgroundColor: shape.color,
                  height: barsVisible ? `${targetHeight}px` : '4px',
                  transitionDuration: '700ms',
                  transitionDelay: `${i * 100}ms`,
                  opacity: isCorrect ? 1 : 0.6,
                }}
              >
                {/* Shimmer effect on correct */}
                {isCorrect && barsVisible && (
                  <div className="absolute inset-0 animate-results-shimmer" />
                )}
              </div>
              {/* Shape + correct indicator */}
              <div className="flex items-center gap-1.5">
                <span className="text-white text-lg">{shape.symbol}</span>
                {isCorrect && (
                  <span className="text-correct-green text-lg animate-results-check">✓</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Answer blocks */}
      <div className={`grid gap-3 px-8 pb-6 ${options.length <= 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
        {options.map((opt, i) => {
          const shape = ANSWER_SHAPES[i]
          const isCorrect = correctAnswers.includes(i)
          return (
            <div
              key={i}
              className="rounded-lg flex items-center gap-3 px-6 py-4 transition-all duration-500 shadow-lg"
              style={{
                backgroundColor: shape.color,
                opacity: isCorrect ? 1 : 0.4,
                transform: isCorrect ? 'scale(1)' : 'scale(0.97)',
              }}
            >
              <span className="text-white text-xl opacity-80">{shape.symbol}</span>
              <span className="text-white font-bold flex-1">{opt.text}</span>
              <span className={`text-xl transition-all duration-300 ${isCorrect ? 'text-white animate-results-check' : 'text-white/50'}`}>
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
          className="h-12 px-8 bg-white text-purple-primary font-bold text-sm rounded-lg hover:bg-gray-100 transition-all hover:scale-105 active:scale-95 shadow-lg"
        >
          Next →
        </button>
      </div>

      <style jsx>{`
        @keyframes results-shimmer {
          0% { background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%); background-position: -200% 0; }
          100% { background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%); background-position: 200% 0; }
        }
        .animate-results-shimmer {
          animation: results-shimmer 1.5s ease-in-out;
          background-size: 200% 100%;
        }
        @keyframes results-check {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-results-check {
          animation: results-check 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          animation-delay: 0.6s;
        }
      `}</style>
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
      <h2 className="text-3xl font-bold text-white mt-10 mb-8 animate-lb-title">Leaderboard</h2>

      <div className="w-full max-w-xl px-8 space-y-3">
        {leaderboard.length === 0 && (
          <div className="text-center py-12 animate-lb-row" style={{ animationDelay: '200ms' }}>
            <p className="text-white/60 text-lg">No correct answers yet!</p>
            <p className="text-white/30 text-sm mt-2">Everyone starts fresh next round</p>
          </div>
        )}
        {leaderboard.map((entry, i) => {
          const isTop3 = i < 3 && entry.score > 0
          const medals = ['🥇', '🥈', '🥉']
          return (
            <div
              key={entry.id}
              className="flex items-center gap-4 rounded-xl px-6 py-4 animate-lb-row"
              style={{
                animationDelay: `${i * 150 + 200}ms`,
                background: isTop3
                  ? `linear-gradient(90deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)`
                  : 'rgba(255,255,255,0.08)',
                borderLeft: isTop3 ? `4px solid ${['#FFD700', '#C0C0C0', '#CD7F32'][i]}` : '4px solid transparent',
              }}
            >
              <span className="text-2xl w-10 text-center">
                {isTop3 ? medals[i] : <span className="text-white/50 font-bold">{i + 1}</span>}
              </span>
              <span className="flex-1 text-white font-bold text-lg">{entry.nickname}</span>
              {entry.delta > 0 && (
                <span className="text-correct-green text-sm font-bold animate-lb-delta" style={{ animationDelay: `${i * 150 + 600}ms` }}>
                  +{entry.delta}
                </span>
              )}
              <span className="text-white font-bold text-xl tabular-nums">{entry.score.toLocaleString()}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-auto pb-8">
        <button
          onClick={onNext}
          className="h-12 px-8 bg-white text-purple-primary font-bold text-sm rounded-lg hover:bg-gray-100 transition-all hover:scale-105 active:scale-95 shadow-lg"
        >
          {isLast ? 'Show Podium' : 'Next Question →'}
        </button>
      </div>

      <style jsx>{`
        @keyframes lb-title {
          0% { opacity: 0; transform: translateY(-20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-lb-title {
          animation: lb-title 0.5s ease-out both;
        }
        @keyframes lb-row {
          0% { opacity: 0; transform: translateX(-40px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        .animate-lb-row {
          animation: lb-row 0.6s cubic-bezier(0.25, 0.1, 0.25, 1) both;
        }
        @keyframes lb-delta {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-lb-delta {
          animation: lb-delta 0.4s ease-out both;
        }
      `}</style>
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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pillarsVisible, setPillarsVisible] = useState(false)

  // Staggered reveal
  useEffect(() => {
    const t = setTimeout(() => setPillarsVisible(true), 500)
    return () => clearTimeout(t)
  }, [])

  // Canvas confetti
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: {
      x: number; y: number; vx: number; vy: number;
      color: string; size: number; rotation: number; rotationSpeed: number;
      shape: 'rect' | 'circle'
    }[] = []

    const colors = ['#FFD700', '#E21B3C', '#1368CE', '#26890C', '#D89E00', '#FF69B4', '#00D4FF', '#FF6B35']

    // Create particles
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.5,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 3,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
      })
    }

    let animFrame: number
    function animate() {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const p of particles) {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.max(0, 1 - p.y / canvas.height)

        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.restore()

        // Physics
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.05 // gravity
        p.vx *= 0.99 // air resistance
        p.rotation += p.rotationSpeed

        // Reset when off screen
        if (p.y > canvas.height + 20) {
          p.y = -20
          p.x = Math.random() * canvas.width
          p.vy = Math.random() * 3 + 1
        }
      }

      animFrame = requestAnimationFrame(animate)
    }

    animate()

    return () => cancelAnimationFrame(animFrame)
  }, [])

  const podiumConfig = [
    { color: '#FFD700', height: 200, label: '1st', delay: '0.8s' },
    { color: '#C0C0C0', height: 160, label: '2nd', delay: '0.5s' },
    { color: '#CD7F32', height: 130, label: '3rd', delay: '1.1s' },
  ]

  // Visual order: 2nd, 1st, 3rd
  const displayOrder = podium.length >= 3
    ? [
        { entry: podium[1], config: podiumConfig[1] },
        { entry: podium[0], config: podiumConfig[0] },
        { entry: podium[2], config: podiumConfig[2] },
      ]
    : podium.map((entry, i) => ({ entry, config: podiumConfig[i] }))

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
      {/* Canvas confetti */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0" />

      <h1 className="text-4xl font-bold text-white mb-2 z-10 animate-podium-title">
        9Hoot<span className="text-yellow-accent">!</span>
      </h1>
      <p className="text-white/60 text-sm mb-12 z-10">{quizTitle}</p>

      {/* Podium */}
      <div className="flex items-end gap-4 z-10">
        {displayOrder.map(({ entry, config }) => (
          <div key={entry.id} className="flex flex-col items-center animate-podium-pillar" style={{ animationDelay: config.delay }}>
            <span className="text-white font-bold text-lg mb-1 animate-podium-name" style={{ animationDelay: `calc(${config.delay} + 0.3s)` }}>
              {entry.nickname}
            </span>
            <span className="text-white/70 text-sm mb-3 animate-podium-name" style={{ animationDelay: `calc(${config.delay} + 0.4s)` }}>
              {entry.score.toLocaleString()} pts
            </span>
            <div
              className="w-32 rounded-t-xl flex items-start justify-center pt-4 shadow-2xl"
              style={{
                backgroundColor: config.color,
                height: pillarsVisible ? `${config.height}px` : '0px',
                transition: 'height 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
                transitionDelay: config.delay,
              }}
            >
              <span className="text-2xl font-bold text-white/90 drop-shadow">{config.label}</span>
            </div>
          </div>
        ))}
      </div>

      <a
        href="/library"
        className="mt-12 h-12 px-8 bg-white text-purple-primary font-bold text-sm rounded-lg flex items-center hover:bg-gray-100 transition-all hover:scale-105 active:scale-95 shadow-lg z-10"
      >
        Back to Library
      </a>

      <style jsx>{`
        @keyframes podium-title {
          0% { opacity: 0; transform: scale(0.5); }
          100% { opacity: 1; transform: scale(1); }
        }
        .animate-podium-title {
          animation: podium-title 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes podium-pillar {
          0% { opacity: 0; transform: translateY(40px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-podium-pillar {
          animation: podium-pillar 0.5s ease-out both;
        }
        @keyframes podium-name {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-podium-name {
          animation: podium-name 0.4s ease-out both;
        }
      `}</style>
    </div>
  )
}

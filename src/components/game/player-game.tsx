'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ANSWER_SHAPES } from '@/lib/types'
import { checkAnswer, calculateScore, getStreakMultiplier } from '@/lib/game-utils'
import { useGameAudio } from '@/lib/use-game-audio'
import type { RealtimeChannel } from '@supabase/supabase-js'

type PlayerPhase = 'nickname' | 'waiting' | 'question' | 'answerFill' | 'result' | 'timeUp' | 'ranking' | 'podium'

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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [pointsAwarded, setPointsAwarded] = useState(0)
  const [displayedPoints, setDisplayedPoints] = useState(0)
  const [totalScore, setTotalScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [currentRank, setCurrentRank] = useState<number | null>(null)
  const [playerCount, setPlayerCount] = useState(0)
  const [podiumData, setPodiumData] = useState<{ nickname: string; score: number; rank: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const questionStartRef = useRef<number>(0)
  const lastQuestionIndexRef = useRef<number>(-1)
  const questionsRef = useRef<QuestionData[]>([])
  const answerLockedRef = useRef(false)
  const podiumTriggeredRef = useRef(false)
  const supabase = createClient()
  const audio = useGameAudio()

  // === REFS for stable callbacks ===
  const phaseRef = useRef<PlayerPhase>('nickname')
  const sessionIdRef = useRef<string | null>(null)
  const participantIdRef = useRef<string | null>(null)
  const nicknameRef = useRef('')
  phaseRef.current = phase
  sessionIdRef.current = sessionId
  participantIdRef.current = participantId
  nicknameRef.current = nickname

  // =================================================================
  // PODIUM TRANSITION — called by multiple detection mechanisms
  // Sets phase FIRST, then enriches with data. Never fails to show podium.
  // =================================================================
  function goToPodium() {
    if (podiumTriggeredRef.current) return
    podiumTriggeredRef.current = true
    answerLockedRef.current = true

    // Phase change FIRST — player sees podium immediately
    setPhase('podium')

    // Then fetch enrichment data (scores, rank, top 3) in background
    const sid = sessionIdRef.current
    const pid = participantIdRef.current
    if (sid && pid) {
      fetchPodiumData(sid, pid)
    }
  }

  async function fetchPodiumData(sid: string, pid: string) {
    try {
      const [myResult, topResult, countResult] = await Promise.all([
        supabase.from('participants').select('total_score, rank').eq('id', pid).single(),
        supabase.from('participants').select('nickname, total_score, rank').eq('session_id', sid).order('total_score', { ascending: false }).limit(3),
        supabase.from('participants').select('id', { count: 'exact', head: true }).eq('session_id', sid),
      ])

      if (myResult.data) {
        setTotalScore(myResult.data.total_score || 0)
        setCurrentRank(myResult.data.rank)
      }

      if (topResult.data) {
        setPodiumData(topResult.data.map((p: Record<string, unknown>, i: number) => ({
          nickname: p.nickname as string,
          score: (p.total_score as number) || 0,
          rank: (p.rank as number) || i + 1,
        })))
      }

      if (countResult.count) setPlayerCount(countResult.count)
    } catch {
      // Podium already showing — enrichment failure is non-fatal
    }
  }

  // =================================================================
  // DETECTION MECHANISM 1: Polling loop (stable, never torn down by phase)
  // =================================================================
  useEffect(() => {
    if (!sessionId || !participantId) return

    const interval = setInterval(async () => {
      if (podiumTriggeredRef.current) return

      const sid = sessionIdRef.current
      const pid = participantIdRef.current
      if (!sid || !pid) return

      try {
        const { data: session } = await supabase
          .from('sessions')
          .select('status, current_question_index')
          .eq('id', sid)
          .single()

        if (!session) return

        if (session.status === 'completed') {
          goToPodium()
          return
        }

        if (
          session.status === 'active' &&
          session.current_question_index >= 0 &&
          session.current_question_index !== lastQuestionIndexRef.current
        ) {
          lastQuestionIndexRef.current = session.current_question_index
          loadQuestion(session.current_question_index)
        }
      } catch {
        // Network error — will retry next interval
      }
    }, 1500)

    return () => clearInterval(interval)
  }, [sessionId, participantId]) // eslint-disable-line react-hooks/exhaustive-deps

  // =================================================================
  // DETECTION MECHANISM 2: Supabase Postgres Changes (server-push)
  // Subscribes to actual DB row changes — reliable, no polling needed
  // =================================================================
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`session-watch-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          if (payload.new.status === 'completed') {
            goToPodium()
          }
          // Also detect new questions via server push
          const newIndex = payload.new.current_question_index as number
          if (
            payload.new.status === 'active' &&
            newIndex >= 0 &&
            newIndex !== lastQuestionIndexRef.current
          ) {
            lastQuestionIndexRef.current = newIndex
            loadQuestion(newIndex)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // =================================================================
  // DETECTION MECHANISM 3: Broadcast (best-effort, fast)
  // =================================================================
  useEffect(() => {
    if (!participantId) return

    const channel = supabase.channel(`game:${pin}`, {
      config: { broadcast: { self: false } },
    })

    channel
      .on('broadcast', { event: 'game:answer_lock' }, () => {
        if (answerLockedRef.current) return
        answerLockedRef.current = true
        if (phaseRef.current === 'question') {
          setStreak(0)
          audio.play('timesUp')
          setIsCorrect(false)
          setPointsAwarded(0)
          setPhase('timeUp')
          setTimeout(() => {
            if (podiumTriggeredRef.current) return
            fetchRankAndShow()
          }, 2500)
        }
      })
      .on('broadcast', { event: 'game:podium' }, () => {
        goToPodium()
      })
      .subscribe()

    channel.track({ nickname, participantId })
    channelRef.current = channel

    return () => { channel.unsubscribe() }
  }, [participantId, pin, nickname, supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  // === HELPERS ===

  function loadQuestion(index: number) {
    const q = questionsRef.current[index]
    if (!q) return
    setQuestion(q)
    setSelectedIndex(null)
    setIsCorrect(null)
    setPointsAwarded(0)
    setDisplayedPoints(0)
    answerLockedRef.current = false
    setPhase('question')
    questionStartRef.current = Date.now()
  }

  async function fetchRankAndShow() {
    const sid = sessionIdRef.current
    const pid = participantIdRef.current
    if (sid && pid) {
      try {
        const { data: participants } = await supabase
          .from('participants')
          .select('id, total_score')
          .eq('session_id', sid)
          .order('total_score', { ascending: false })

        if (participants) {
          setPlayerCount(participants.length)
          const myIndex = participants.findIndex((p: Record<string, unknown>) => p.id === pid)
          setCurrentRank(myIndex >= 0 ? myIndex + 1 : null)
        }
      } catch { /* non-fatal */ }
    }
    if (!podiumTriggeredRef.current) setPhase('ranking')
  }

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
        questionsRef.current = questions.map((q: Record<string, unknown>, i: number) => ({
          id: q.id, index: i, type: q.type,
          questionText: q.question_text || '',
          options: q.options as { text: string }[] | null,
          correctAnswers: q.correct_answers,
          timeLimit: q.time_limit, points: q.points,
          totalQuestions: questions.length,
        }))
      }
    }
    fetchQuestions()
  }, [sessionId, supabase])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!nickname.trim()) return
    setError(null)

    const { data: session } = await supabase
      .from('sessions').select('id').eq('pin', pin).neq('status', 'completed').single()

    if (!session) { setError('Game not found'); return }

    const { data: participant, error: err } = await supabase
      .from('participants')
      .insert({ session_id: session.id, nickname: nickname.trim() })
      .select().single()

    if (err || !participant) { setError('Failed to join: ' + (err?.message || 'Unknown error')); return }

    audio.play('answerSubmit')
    setSessionId(session.id)
    setParticipantId(participant.id)
    setPhase('waiting')
  }

  function submitAnswer(answerData: Record<string, unknown>, answerIndex: number) {
    if (!participantId || !question || answerLockedRef.current) return
    answerLockedRef.current = true

    audio.play('answerSubmit')
    setSelectedIndex(answerIndex)
    setPhase('answerFill')

    const timeTakenMs = Date.now() - questionStartRef.current
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

    setTimeout(() => {
      if (correct) audio.play('correct')
      else audio.play('incorrect')
      setPhase('result')
      if (earnedPts > 0) animatePoints(earnedPts)
    }, 600)

    setTimeout(() => {
      if (podiumTriggeredRef.current) return
      fetchRankAndShow()
    }, 3100)

    channelRef.current?.send({
      type: 'broadcast', event: 'player:answer',
      payload: { participantId, nickname, answerData, timeTakenMs },
    })

    // Write answer to DB (host polls this for scoring)
    supabase.from('answers').insert({
      session_id: sessionId, participant_id: participantId,
      question_id: question.id, answer_data: answerData,
      is_correct: correct, points_awarded: 0, time_taken_ms: timeTakenMs,
    }).then(() => {})
    // NOTE: Player does NOT write scores to DB. Host is the single
    // source of truth — it calculates scores in handleShowResults
    // and writes final totals in showPodium.
  }

  function animatePoints(target: number) {
    const duration = 400
    const start = performance.now()
    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - (1 - progress) * (1 - progress)
      setDisplayedPoints(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  // ── RENDER ──────────────────────────────────

  if (phase === 'nickname') return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #46178F 0%, #2a0e5a 100%)' }}>
      <h1 className="text-4xl font-bold text-white mb-6 animate-player-enter">9Hoot<span className="text-yellow-accent">!</span></h1>
      <form onSubmit={handleJoin} className="w-72 animate-player-form">
        <div className="bg-white rounded-lg overflow-hidden shadow-2xl">
          <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)}
            placeholder="Nickname" maxLength={20}
            className="w-full h-12 px-4 text-center text-dark-text font-bold text-base border-b-2 border-border-gray focus:outline-none focus:border-blue-cta placeholder:font-normal placeholder:text-border-gray" autoFocus />
          <button type="submit" className="w-full h-12 bg-dark-text text-white font-bold text-base hover:bg-black transition-all active:scale-95">Join</button>
        </div>
        {error && <p className="text-white bg-answer-red/80 text-sm text-center py-2 px-3 rounded mt-3">{error}</p>}
      </form>
      <style jsx>{`
        @keyframes player-enter { 0% { transform: scale(0.8) translateY(-20px); opacity: 0; } 100% { transform: scale(1) translateY(0); opacity: 1; } }
        .animate-player-enter { animation: player-enter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @keyframes player-form { 0% { transform: translateY(30px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
        .animate-player-form { animation: player-form 0.5s ease-out 0.2s both; }
      `}</style>
    </div>
  )

  if (phase === 'waiting') return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a0a3e 0%, #001b50 100%)' }}>
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4 animate-waiting-ring"><span className="text-3xl">✓</span></div>
        <p className="text-white font-bold text-xl">{nickname}</p>
        <p className="text-white/60 text-sm mt-2">You&apos;re in! Waiting for host...</p>
        <div className="flex justify-center gap-1 mt-4">
          {[0, 1, 2].map((i) => (<div key={i} className="w-2 h-2 rounded-full bg-white/40 animate-waiting-dot" style={{ animationDelay: `${i * 0.3}s` }} />))}
        </div>
      </div>
      <style jsx>{`
        @keyframes waiting-ring { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.2); } 50% { box-shadow: 0 0 0 15px rgba(255,255,255,0); } }
        .animate-waiting-ring { animation: waiting-ring 2s ease-in-out infinite; }
        @keyframes waiting-dot { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 1; transform: scale(1.5); } }
        .animate-waiting-dot { animation: waiting-dot 1.2s ease-in-out infinite; }
      `}</style>
    </div>
  )

  if (phase === 'question' && question) {
    const options = (question.options as { text: string }[]) || []
    if (question.type === 'quiz' || question.type === 'poll') {
      return (
        <div className="min-h-screen flex flex-col p-3 gap-3" style={{ background: '#1a1a2e' }}>
          <div className="text-center text-white/50 text-xs py-1 font-bold">{question.index + 1} of {question.totalQuestions}</div>
          <div className={`flex-1 grid gap-3 ${options.length <= 2 ? 'grid-cols-2 grid-rows-1' : 'grid-cols-2 grid-rows-2'}`}>
            {options.map((_, i) => {
              const shape = ANSWER_SHAPES[i]
              return (
                <button key={i} onClick={() => submitAnswer({ selectedIndices: [i] }, i)}
                  className="rounded-xl flex items-center justify-center shadow-lg animate-answer-pop transition-transform active:scale-90"
                  style={{ backgroundColor: shape.color, animationDelay: `${i * 80}ms` }}>
                  <span className="text-white text-5xl drop-shadow-lg">{shape.symbol}</span>
                </button>
              )
            })}
          </div>
          <style jsx>{`@keyframes answer-pop { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } } .animate-answer-pop { animation: answer-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both; }`}</style>
        </div>
      )
    }
    if (question.type === 'true_false') {
      return (
        <div className="min-h-screen flex flex-col p-3 gap-3" style={{ background: '#1a1a2e' }}>
          <div className="text-center text-white/50 text-xs py-1 font-bold">{question.index + 1} of {question.totalQuestions}</div>
          <div className="flex-1 grid grid-cols-2 gap-3">
            <button onClick={() => submitAnswer({ selected: true }, 0)} className="rounded-xl flex items-center justify-center shadow-lg animate-answer-pop transition-transform active:scale-90" style={{ backgroundColor: ANSWER_SHAPES[0].color }}>
              <span className="text-white text-3xl font-bold drop-shadow-lg">{ANSWER_SHAPES[0].symbol} True</span>
            </button>
            <button onClick={() => submitAnswer({ selected: false }, 1)} className="rounded-xl flex items-center justify-center shadow-lg animate-answer-pop transition-transform active:scale-90" style={{ backgroundColor: ANSWER_SHAPES[1].color, animationDelay: '80ms' }}>
              <span className="text-white text-3xl font-bold drop-shadow-lg">{ANSWER_SHAPES[1].symbol} False</span>
            </button>
          </div>
          <style jsx>{`@keyframes answer-pop { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } } .animate-answer-pop { animation: answer-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both; }`}</style>
        </div>
      )
    }
    return (<div className="min-h-screen flex items-center justify-center" style={{ background: '#1a1a2e' }}><p className="text-white text-center">{question.type.replace('_', ' ')} — answer on host screen</p></div>)
  }

  if (phase === 'answerFill') {
    const shape = selectedIndex !== null ? ANSWER_SHAPES[selectedIndex] : null
    return (
      <div className="min-h-screen flex items-center justify-center animate-fill-expand" style={{ backgroundColor: shape?.color || '#333' }}>
        <span className="text-white text-8xl animate-fill-symbol">{shape?.symbol || '●'}</span>
        <style jsx>{`
          @keyframes fill-expand { 0% { transform: scale(0.3); border-radius: 50%; } 100% { transform: scale(1); border-radius: 0; } } .animate-fill-expand { animation: fill-expand 0.3s ease-out both; }
          @keyframes fill-symbol { 0% { transform: scale(2); opacity: 0; } 100% { transform: scale(1); opacity: 1; } } .animate-fill-symbol { animation: fill-symbol 0.2s ease-out 0.15s both; }
        `}</style>
      </div>
    )
  }

  if (phase === 'timeUp') return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #5c1a1a 0%, #3d0a0a 100%)' }}>
      <div className="w-24 h-24 rounded-full bg-answer-red/30 flex items-center justify-center mb-4 animate-timeup-icon"><span className="text-white text-5xl">⏱</span></div>
      <p className="text-white font-bold text-2xl animate-timeup-text">Time&apos;s Up!</p>
      <p className="text-white/50 text-sm mt-3">You didn&apos;t answer in time</p>
      <div className="mt-4 bg-black/30 rounded-full px-6 py-2.5"><span className="text-white/70 font-bold text-lg">+0</span></div>
      <p className="text-white/40 text-sm mt-6">Total: {totalScore} pts</p>
      <style jsx>{`
        @keyframes timeup-icon { 0% { transform: scale(0) rotate(-20deg); } 50% { transform: scale(1.2) rotate(5deg); } 100% { transform: scale(1) rotate(0); } } .animate-timeup-icon { animation: timeup-icon 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @keyframes timeup-text { 0% { opacity: 0; transform: translateY(15px); } 100% { opacity: 1; transform: translateY(0); } } .animate-timeup-text { animation: timeup-text 0.3s ease-out 0.2s both; }
      `}</style>
    </div>
  )

  if (phase === 'result') return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: isCorrect ? 'linear-gradient(135deg, #1a5c2a 0%, #0a3d1a 100%)' : 'linear-gradient(135deg, #5c1a1a 0%, #3d0a0a 100%)' }}>
      <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 animate-result-icon ${isCorrect ? 'bg-correct-green' : 'bg-answer-red'}`}>
        <span className="text-white text-4xl font-bold">{isCorrect ? '✓' : '✕'}</span>
      </div>
      <p className="text-white font-bold text-2xl animate-result-text">{isCorrect ? 'Correct!' : 'Incorrect'}</p>
      {isCorrect && pointsAwarded > 0 && (<div className="mt-4 bg-black/30 rounded-full px-6 py-2.5 animate-result-points"><span className="text-white font-bold text-lg tabular-nums">+{displayedPoints}</span></div>)}
      {streak > 1 && isCorrect && (<div className="mt-3"><span className="text-yellow-accent font-bold text-sm">🔥 {streak} streak!</span></div>)}
      <p className="text-white/50 text-sm mt-6">Total: {totalScore} pts</p>
      <style jsx>{`
        @keyframes result-icon { 0% { transform: scale(0); } 50% { transform: scale(1.3); } 70% { transform: scale(0.9); } 100% { transform: scale(1); } } .animate-result-icon { animation: result-icon 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @keyframes result-text { 0% { opacity: 0; transform: translateY(15px); } 100% { opacity: 1; transform: translateY(0); } } .animate-result-text { animation: result-text 0.3s ease-out 0.2s both; }
        @keyframes result-points { 0% { opacity: 0; transform: scale(0.5); } 100% { opacity: 1; transform: scale(1); } } .animate-result-points { animation: result-points 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both; }
      `}</style>
    </div>
  )

  if (phase === 'ranking') return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #0a0033 0%, #1a0a3e 100%)' }}>
      <div className="text-center">
        {currentRank && (
          <div className="mb-4">
            <div className="text-7xl font-bold text-white mb-2">{currentRank === 1 ? '🥇' : currentRank === 2 ? '🥈' : currentRank === 3 ? '🥉' : `#${currentRank}`}</div>
            <p className="text-white/80 text-lg font-bold">{currentRank === 1 ? '1st place!' : currentRank === 2 ? '2nd place!' : currentRank === 3 ? '3rd place!' : `${currentRank}th place`}</p>
            {playerCount > 0 && (<p className="text-white/40 text-sm mt-1">out of {playerCount} player{playerCount !== 1 ? 's' : ''}</p>)}
          </div>
        )}
        <div className="bg-white/5 rounded-xl px-8 py-4 mt-4">
          <p className="text-white font-bold text-xl">{nickname}</p>
          <p className="text-white/60 text-sm mt-1 tabular-nums">{totalScore.toLocaleString()} points</p>
        </div>
        {streak > 1 && (<p className="text-yellow-accent text-sm mt-3 font-bold">🔥 {streak} answer streak!</p>)}
        <div className="flex justify-center gap-1 mt-8">
          {[0, 1, 2].map((i) => (<div key={i} className="w-2 h-2 rounded-full bg-white/30 animate-rank-dot" style={{ animationDelay: `${i * 0.3}s` }} />))}
        </div>
        <p className="text-white/25 text-xs mt-2">Waiting for next question...</p>
      </div>
      <style jsx>{`@keyframes rank-dot { 0%, 100% { opacity: 0.2; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.5); } } .animate-rank-dot { animation: rank-dot 1.2s ease-in-out infinite; }`}</style>
    </div>
  )

  if (phase === 'podium') {
    const podiumConfig = [
      { color: '#FFD700', height: 120, label: '1st' },
      { color: '#C0C0C0', height: 90, label: '2nd' },
      { color: '#CD7F32', height: 70, label: '3rd' },
    ]
    const displayOrder = podiumData.length >= 3
      ? [{ entry: podiumData[1], config: podiumConfig[1] }, { entry: podiumData[0], config: podiumConfig[0] }, { entry: podiumData[2], config: podiumConfig[2] }]
      : podiumData.map((entry, i) => ({ entry, config: podiumConfig[i] }))
    const isOnPodium = currentRank !== null && currentRank <= 3

    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="absolute w-2 h-2 rounded-full animate-podium-confetti"
              style={{ backgroundColor: ['#FFD700', '#E21B3C', '#1368CE', '#26890C', '#D89E00', '#FF69B4'][i % 6], left: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 3}s`, animationDuration: `${2 + Math.random() * 2}s` }} />
          ))}
        </div>
        <div className="z-10 w-full px-6">
          <h2 className="text-2xl font-bold text-white text-center mb-6 animate-podium-enter">Game Over!</h2>
          {podiumData.length > 0 && (
            <div className="flex items-end justify-center gap-3 mb-8">
              {displayOrder.map(({ entry, config }, i) => {
                const isMe = entry.nickname === nickname
                return (
                  <div key={i} className="flex flex-col items-center animate-podium-pillar" style={{ animationDelay: `${[0.5, 0.3, 0.7][i]}s` }}>
                    <span className={`text-sm font-bold mb-1 truncate max-w-[90px] ${isMe ? 'text-yellow-accent' : 'text-white'}`}>{entry.nickname}</span>
                    <span className="text-white/60 text-xs mb-2 tabular-nums">{entry.score.toLocaleString()}</span>
                    <div className="w-20 rounded-t-lg flex items-start justify-center pt-3 shadow-lg" style={{ backgroundColor: config.color, height: `${config.height}px` }}>
                      <span className="text-lg font-bold text-white/90">{config.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className={`rounded-xl px-6 py-4 text-center mx-auto max-w-xs animate-podium-result ${isOnPodium ? 'bg-yellow-accent/15 border border-yellow-accent/30' : 'bg-white/10'}`}>
            {isOnPodium && (<div className="text-4xl mb-2 animate-podium-trophy">{currentRank === 1 ? '🏆' : currentRank === 2 ? '🥈' : '🥉'}</div>)}
            <p className="text-white font-bold text-lg">{nickname}</p>
            {currentRank && (<p className={`font-bold text-sm mt-1 ${isOnPodium ? 'text-yellow-accent' : 'text-white/60'}`}>{currentRank === 1 ? '1st' : currentRank === 2 ? '2nd' : currentRank === 3 ? '3rd' : `${currentRank}th`} place</p>)}
            <p className="text-white font-bold text-2xl mt-2 tabular-nums">{totalScore.toLocaleString()} <span className="text-white/50 text-sm font-normal">pts</span></p>
          </div>
        </div>
        <style jsx>{`
          @keyframes podium-confetti { 0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } } .animate-podium-confetti { animation: podium-confetti 3s ease-in-out infinite; }
          @keyframes podium-enter { 0% { opacity: 0; transform: scale(0.8); } 100% { opacity: 1; transform: scale(1); } } .animate-podium-enter { animation: podium-enter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
          @keyframes podium-pillar { 0% { opacity: 0; transform: translateY(30px); } 100% { opacity: 1; transform: translateY(0); } } .animate-podium-pillar { animation: podium-pillar 0.5s ease-out both; }
          @keyframes podium-result { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } } .animate-podium-result { animation: podium-result 0.4s ease-out 1s both; }
          @keyframes podium-trophy { 0% { transform: scale(0) rotate(-30deg); } 60% { transform: scale(1.3) rotate(10deg); } 100% { transform: scale(1) rotate(0); } } .animate-podium-trophy { animation: podium-trophy 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 1.2s both; }
        `}</style>
      </div>
    )
  }

  return null
}

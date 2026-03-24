import { createClient } from '@/lib/supabase/server'
import { ReportList } from '@/components/reports/report-list'

export const dynamic = 'force-dynamic'

export interface ReportEntry {
  sessionId: string
  quizTitle: string
  coverImageUrl: string | null
  pin: string
  date: string
  participantCount: number
  avgScore: number
  questionCount: number
}

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get all quizzes owned by this user
  const { data: quizzes } = await supabase
    .from('quizzes')
    .select('id, title, cover_image_url, question_count')
    .eq('owner_id', user!.id)

  const quizMap = new Map(
    (quizzes || []).map(q => [q.id, q])
  )
  const quizIds = Array.from(quizMap.keys())

  if (quizIds.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-dark-text">Reports</h1>
        </div>
        <ReportList reports={[]} />
      </div>
    )
  }

  // Get all completed sessions for those quizzes
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, quiz_id, pin, started_at, ended_at')
    .eq('status', 'completed')
    .in('quiz_id', quizIds)
    .order('ended_at', { ascending: false })

  if (!sessions || sessions.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-dark-text">Reports</h1>
        </div>
        <ReportList reports={[]} />
      </div>
    )
  }

  const sessionIds = sessions.map(s => s.id)

  // Get participant stats for all sessions
  const { data: participantStats } = await supabase
    .from('participants')
    .select('session_id, total_score')
    .in('session_id', sessionIds)

  // Build participant aggregates per session
  const statsMap = new Map<string, { count: number; totalScore: number }>()
  for (const p of participantStats || []) {
    const existing = statsMap.get(p.session_id)
    if (existing) {
      existing.count += 1
      existing.totalScore += p.total_score
    } else {
      statsMap.set(p.session_id, { count: 1, totalScore: p.total_score })
    }
  }

  // Build enriched report entries
  const reports: ReportEntry[] = sessions.map(session => {
    const quiz = quizMap.get(session.quiz_id)
    const stats = statsMap.get(session.id)
    const participantCount = stats?.count || 0
    const avgScore = participantCount > 0
      ? Math.round((stats!.totalScore) / participantCount)
      : 0

    return {
      sessionId: session.id,
      quizTitle: quiz?.title || 'Untitled Quiz',
      coverImageUrl: quiz?.cover_image_url || null,
      pin: session.pin,
      date: session.ended_at || session.started_at || '',
      participantCount,
      avgScore,
      questionCount: quiz?.question_count || 0,
    }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-dark-text">Reports</h1>
      </div>
      <ReportList reports={reports} />
    </div>
  )
}

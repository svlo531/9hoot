import { createClient } from '@/lib/supabase/server'
import { SessionReport } from '@/components/reports/session-report'

export const dynamic = 'force-dynamic'

export default async function SessionReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Fetch session
  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single()
  if (!session) return <div>Session not found</div>

  // Fetch quiz with questions
  const { data: quiz } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', session.quiz_id)
    .single()

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('quiz_id', session.quiz_id)
    .order('sort_order', { ascending: true })

  // Fetch participants
  const { data: participants } = await supabase
    .from('participants')
    .select('*')
    .eq('session_id', sessionId)
    .order('total_score', { ascending: false })

  // Fetch all answers
  const { data: answers } = await supabase
    .from('answers')
    .select('*')
    .eq('session_id', sessionId)

  // Fetch teams
  const { data: teams } = await supabase
    .from('teams')
    .select('*')
    .eq('session_id', sessionId)
    .order('rank', { ascending: true })

  return (
    <SessionReport
      session={session}
      quiz={quiz}
      questions={questions || []}
      participants={participants || []}
      answers={answers || []}
      teams={teams || []}
    />
  )
}

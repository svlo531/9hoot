import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QuizEditor } from '@/components/quiz/quiz-editor'

export const dynamic = 'force-dynamic'

export default async function QuizEditorPage({
  params,
}: {
  params: Promise<{ quizId: string }>
}) {
  const { quizId } = await params
  const supabase = await createClient()

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', quizId)
    .single()

  if (!quiz) notFound()

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('quiz_id', quizId)
    .order('sort_order', { ascending: true })

  return <QuizEditor quiz={quiz} initialQuestions={questions || []} />
}

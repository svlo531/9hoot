import { createClient } from '@/lib/supabase/server'
import { QuizList } from '@/components/dashboard/quiz-list'

export const dynamic = 'force-dynamic'

export default async function LibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: quizzes } = await supabase
    .from('quizzes')
    .select('*')
    .eq('owner_id', user!.id)
    .order('updated_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-dark-text">Your 9Hoots</h1>
      </div>
      <QuizList quizzes={quizzes || []} />
    </div>
  )
}

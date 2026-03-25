import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ quizId: string }> }
) {
  const { quizId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch original quiz
  const { data: quiz, error: quizError } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', quizId)
    .eq('owner_id', user.id)
    .single()

  if (!quiz || quizError) {
    return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })
  }

  // Fetch questions
  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('quiz_id', quizId)
    .order('sort_order', { ascending: true })

  // Create new quiz (copy of original)
  const { data: newQuiz, error: insertError } = await supabase
    .from('quizzes')
    .insert({
      owner_id: user.id,
      title: `Copy of ${quiz.title}`,
      description: quiz.description,
      folder_id: quiz.folder_id,
      cover_image_url: quiz.cover_image_url,
      theme_id: quiz.theme_id,
      settings: quiz.settings,
      is_public: false,
      question_count: quiz.question_count,
      play_count: 0,
    })
    .select('id')
    .single()

  if (!newQuiz || insertError) {
    return NextResponse.json({ error: insertError?.message || 'Failed to create' }, { status: 500 })
  }

  // Copy questions
  if (questions && questions.length > 0) {
    const newQuestions = questions.map((q) => ({
      quiz_id: newQuiz.id,
      sort_order: q.sort_order,
      type: q.type,
      question_text: q.question_text,
      media_url: q.media_url,
      media_type: q.media_type,
      time_limit: q.time_limit,
      points: q.points,
      options: q.options,
      correct_answers: q.correct_answers,
    }))

    await supabase.from('questions').insert(newQuestions)
  }

  return NextResponse.json({ id: newQuiz.id })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePin } from '@/lib/game-utils'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { quizId } = await request.json()

  // Verify quiz exists and user owns it
  const { data: quiz } = await supabase
    .from('quizzes')
    .select('id, question_count')
    .eq('id', quizId)
    .eq('owner_id', user.id)
    .single()

  if (!quiz) {
    return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })
  }

  if (quiz.question_count === 0) {
    return NextResponse.json({ error: 'Quiz has no questions' }, { status: 400 })
  }

  // Generate unique PIN with collision check
  let pin: string
  let attempts = 0
  do {
    pin = generatePin()
    const { data: existing } = await supabase
      .from('sessions')
      .select('id')
      .eq('pin', pin)
      .neq('status', 'completed')
      .single()
    if (!existing) break
    attempts++
  } while (attempts < 10)

  if (attempts >= 10) {
    return NextResponse.json({ error: 'Could not generate unique PIN' }, { status: 500 })
  }

  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      quiz_id: quizId,
      host_id: user.id,
      pin,
      status: 'lobby',
      mode: 'live',
      game_mode: 'classic',
      current_question_index: -1,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ session })
}

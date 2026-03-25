import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePin } from '@/lib/game-utils'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Generate unique PIN
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

  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      quiz_id: null,
      host_id: user.id,
      pin,
      status: 'lobby',
      mode: 'qa',
      game_mode: 'classic',
      current_question_index: -1,
    })
    .select('id')
    .single()

  if (error || !session) {
    return NextResponse.json({ error: error?.message || 'Failed to create Q&A' }, { status: 500 })
  }

  return NextResponse.json({ sessionId: session.id, pin })
}

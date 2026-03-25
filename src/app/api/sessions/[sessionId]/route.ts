import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { settings } = body

  const { data: session, error } = await supabase
    .from('sessions')
    .update({
      settings: settings || {},
      game_mode: settings?.teamMode ? 'team' : 'classic',
    })
    .eq('id', sessionId)
    .eq('host_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify session exists and user owns it (via quiz ownership)
  const { data: session } = await supabase
    .from('sessions')
    .select('id, quiz_id')
    .eq('id', sessionId)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('id')
    .eq('id', session.quiz_id)
    .eq('owner_id', user.id)
    .single()

  if (!quiz) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // Delete answers first, then participants, then session (cascade)
  await supabase.from('answers').delete().eq('session_id', sessionId)
  await supabase.from('participants').delete().eq('session_id', sessionId)
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

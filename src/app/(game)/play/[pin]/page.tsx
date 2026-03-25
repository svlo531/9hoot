import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PlayerGame } from '@/components/game/player-game'

export default async function PlayPage({
  params,
}: {
  params: Promise<{ pin: string }>
}) {
  const { pin } = await params

  // Check if this is a Q&A session - redirect to Q&A player page
  const supabase = await createClient()
  const { data: session } = await supabase
    .from('sessions')
    .select('mode')
    .eq('pin', pin)
    .neq('status', 'completed')
    .single()

  if (session?.mode === 'qa') {
    redirect(`/qa/join/${pin}`)
  }

  return <PlayerGame pin={pin} />
}

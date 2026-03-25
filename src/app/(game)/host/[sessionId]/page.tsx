import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { HostGame } from '@/components/game/host-game'
import { DEFAULT_THEME } from '@/lib/theme-utils'
import type { ThemeConfig } from '@/lib/theme-utils'

export default async function HostGamePage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('host_id', user.id)
    .single()

  if (!session) notFound()

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('quiz_id', session.quiz_id)
    .order('sort_order', { ascending: true })

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('title, theme_id')
    .eq('id', session.quiz_id)
    .single()

  // Fetch theme if set
  let themeConfig: ThemeConfig = DEFAULT_THEME
  if (quiz?.theme_id) {
    const { data: theme } = await supabase
      .from('themes')
      .select('config')
      .eq('id', quiz.theme_id)
      .single()

    if (theme?.config) {
      themeConfig = theme.config as ThemeConfig
    }
  }

  return (
    <HostGame
      session={session}
      questions={questions || []}
      quizTitle={quiz?.title || 'Untitled'}
      theme={themeConfig}
    />
  )
}

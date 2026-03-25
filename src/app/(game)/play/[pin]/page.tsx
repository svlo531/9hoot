import { PlayerGame } from '@/components/game/player-game'
import { QAPlayerWrapper } from '@/components/qa/qa-player-wrapper'

export default async function PlayPage({
  params,
}: {
  params: Promise<{ pin: string }>
}) {
  const { pin } = await params
  return (
    <>
      <PlayerGame pin={pin} />
      <QAPlayerWrapper />
    </>
  )
}

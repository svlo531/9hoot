import { PlayerGame } from '@/components/game/player-game'

export default async function PlayPage({
  params,
}: {
  params: Promise<{ pin: string }>
}) {
  const { pin } = await params
  return <PlayerGame pin={pin} />
}

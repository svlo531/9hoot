// Generate a unique 6-digit PIN
export function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Speed-based scoring: correct answers get more points for faster responses
// Formula: points = maxPoints * (1 - (timeTaken / timeLimit) * 0.5)
export function calculateScore(
  maxPoints: number,
  timeTakenMs: number,
  timeLimitMs: number,
  isCorrect: boolean
): number {
  if (!isCorrect || maxPoints === 0) return 0
  const timeFraction = Math.min(timeTakenMs / timeLimitMs, 1)
  const score = Math.round(maxPoints * (1 - timeFraction * 0.5))
  return Math.max(0, score)
}

// Answer streak bonus multiplier
export function getStreakMultiplier(streak: number): number {
  if (streak <= 0) return 1
  if (streak === 1) return 1
  if (streak === 2) return 1.1
  if (streak === 3) return 1.2
  if (streak === 4) return 1.3
  return 1.5 // 5+ streak
}

// Check if an answer is correct based on question type
export function checkAnswer(
  questionType: string,
  answerData: Record<string, unknown>,
  correctAnswers: unknown
): boolean {
  switch (questionType) {
    case 'quiz': {
      const selected = (answerData.selectedIndices as number[]) || []
      const correct = (correctAnswers as number[]) || []
      if (selected.length !== correct.length) return false
      return selected.every((i) => correct.includes(i)) && correct.every((i) => selected.includes(i))
    }
    case 'true_false': {
      const selected = answerData.selected as boolean
      const correct = (correctAnswers as boolean[])?.[0]
      return selected === correct
    }
    case 'type_answer': {
      const typed = ((answerData.text as string) || '').trim().toLowerCase().replace(/[^\w\s]/g, '')
      const accepted = (correctAnswers as { text: string; case_sensitive?: boolean }[]) || []
      return accepted.some((a) => {
        const target = a.case_sensitive ? a.text.trim() : a.text.trim().toLowerCase()
        const answer = a.case_sensitive ? ((answerData.text as string) || '').trim() : typed
        return answer.replace(/[^\w\s]/g, '') === target.replace(/[^\w\s]/g, '')
      })
    }
    case 'slider': {
      const value = answerData.value as number
      const correct = correctAnswers as { value: number; margin?: number }
      if (!correct) return false
      const margin = correct.margin ?? 0
      return Math.abs(value - correct.value) <= margin
    }
    case 'puzzle': {
      const order = (answerData.order as number[]) || []
      const correct = (correctAnswers as number[]) || []
      return order.length === correct.length && order.every((v, i) => v === correct[i])
    }
    case 'image_reveal': {
      // Same logic as type_answer — player guesses what the image shows
      const typed2 = ((answerData.text as string) || '').trim().toLowerCase().replace(/[^\w\s]/g, '')
      const accepted2 = (correctAnswers as { text: string; case_sensitive?: boolean }[]) || []
      return accepted2.some((a) => {
        const target = a.case_sensitive ? a.text.trim() : a.text.trim().toLowerCase()
        const answer = a.case_sensitive ? ((answerData.text as string) || '').trim() : typed2
        return answer.replace(/[^\w\s]/g, '') === target.replace(/[^\w\s]/g, '')
      })
    }
    // Non-scored types
    case 'poll':
    case 'word_cloud':
    case 'brainstorm':
    case 'open_ended':
    case 'nps_survey':
    case 'content_slide':
      return false
    default:
      return false
  }
}

const ADJECTIVES = [
  'Brave','Swift','Clever','Mighty','Cosmic','Lucky','Bold','Fierce',
  'Turbo','Mega','Super','Epic','Noble','Rapid','Bright','Jolly',
  'Witty','Daring','Grand','Hyper','Ultra','Funky','Zippy','Cool',
  'Nifty','Keen','Wild','Zesty','Vivid','Plucky','Snappy','Nimble',
  'Blazing','Flying','Roaring','Sparky','Stellar','Atomic','Thunder',
  'Crystal','Golden','Silver','Iron','Storm','Flash','Rocket','Phantom',
  'Shadow','Mystic','Polar','Sonic',
]

const ANIMALS = [
  'Panda','Eagle','Tiger','Dolphin','Phoenix','Wolf','Falcon','Dragon',
  'Koala','Fox','Hawk','Lion','Otter','Bear','Shark','Panther',
  'Cheetah','Owl','Raven','Cobra','Penguin','Jaguar','Lynx','Bison',
  'Moose','Whale','Gecko','Viper','Crane','Parrot','Toucan','Hippo',
  'Rhino','Gazelle','Husky','Puma','Badger','Condor','Mantis','Hornet',
  'Scorpion','Mammoth','Raptor','Stallion','Osprey','Meerkat','Lemur',
  'Iguana','Coyote','Llama',
]

export function generateNickname(existingNames: string[]): string {
  const existing = new Set(existingNames.map(n => n.toLowerCase()))
  for (let i = 0; i < 50; i++) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
    const name = `${adj} ${animal}`
    if (!existing.has(name.toLowerCase())) return name
  }
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  return `${adj} ${animal} ${Math.floor(Math.random() * 99) + 1}`
}

const TEAM_COLORS = [
  { name: 'Red', color: '#E21B3C' },
  { name: 'Blue', color: '#1368CE' },
  { name: 'Green', color: '#26890C' },
  { name: 'Orange', color: '#D89E00' },
  { name: 'Purple', color: '#46178F' },
  { name: 'Teal', color: '#0AA3CF' },
  { name: 'Pink', color: '#B8116E' },
  { name: 'Gold', color: '#FF6B35' },
]

export function getTeamConfigs(count: number): { name: string; color: string }[] {
  return TEAM_COLORS.slice(0, count).map(c => ({
    name: `${c.name} Team`,
    color: c.color,
  }))
}

export function assignPlayersToTeams<T>(players: T[], teamCount: number): T[][] {
  const shuffled = [...players].sort(() => Math.random() - 0.5)
  const teams: T[][] = Array.from({ length: teamCount }, () => [])
  shuffled.forEach((player, i) => {
    teams[i % teamCount].push(player)
  })
  return teams
}

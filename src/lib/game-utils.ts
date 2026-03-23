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
    // Non-scored types
    case 'poll':
    case 'word_cloud':
    case 'brainstorm':
    case 'open_ended':
    case 'nps_survey':
    case 'content_slide':
    case 'image_reveal':
      return false
    default:
      return false
  }
}

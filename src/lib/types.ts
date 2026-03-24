export type UserRole = 'admin' | 'host'

export type QuestionType =
  | 'quiz'
  | 'true_false'
  | 'type_answer'
  | 'slider'
  | 'puzzle'
  | 'poll'
  | 'word_cloud'
  | 'brainstorm'
  | 'open_ended'
  | 'image_reveal'
  | 'content_slide'
  | 'nps_survey'

export type SessionStatus = 'lobby' | 'active' | 'paused' | 'reviewing' | 'completed'
export type GameMode = 'classic' | 'team'
export type SessionMode = 'live' | 'self_paced'

export interface Profile {
  id: string
  display_name: string
  role: UserRole
  avatar_url: string | null
  created_at: string
}

export interface Folder {
  id: string
  owner_id: string
  name: string
  parent_folder_id: string | null
  created_at: string
}

export interface Quiz {
  id: string
  owner_id: string
  title: string
  description: string | null
  folder_id: string | null
  cover_image_url: string | null
  theme_id: string | null
  settings: Record<string, unknown>
  is_public: boolean
  question_count: number
  play_count: number
  created_at: string
  updated_at: string
}

export interface Question {
  id: string
  quiz_id: string
  sort_order: number
  type: QuestionType
  question_text: string | null
  media_url: string | null
  media_type: 'image' | 'video' | null
  time_limit: number
  points: 0 | 1000 | 2000
  options: QuizOption[] | SliderOptions | ContentSlideOptions | null
  correct_answers: unknown
  created_at: string
}

export interface QuizOption {
  text: string
  image_url?: string
}

export interface SliderOptions {
  min: number
  max: number
  step: number
}

export interface ContentSlideOptions {
  title: string
  body: string
  media_url?: string
  layout: string
}

export interface GameSession {
  id: string
  quiz_id: string
  host_id: string
  pin: string
  status: SessionStatus
  mode: SessionMode
  game_mode: GameMode
  current_question_index: number
  settings: Record<string, unknown>
  started_at: string | null
  ended_at: string | null
  created_at: string
}

export interface Participant {
  id: string
  session_id: string
  nickname: string
  email: string | null
  team_id: string | null
  total_score: number
  total_correct: number
  total_streak: number
  rank: number | null
  joined_at: string
}

export interface Answer {
  id: string
  session_id: string
  participant_id: string
  question_id: string
  answer_data: Record<string, unknown>
  is_correct: boolean | null
  points_awarded: number
  time_taken_ms: number | null
  submitted_at: string
}

// Shape icons for answer options
export const ANSWER_SHAPES = [
  { shape: 'triangle', symbol: '▲', color: '#E21B3C' },
  { shape: 'diamond', symbol: '◆', color: '#1368CE' },
  { shape: 'circle', symbol: '●', color: '#D89E00' },
  { shape: 'square', symbol: '■', color: '#26890C' },
  { shape: 'pentagon', symbol: '⬠', color: '#0AA3CF' },
  { shape: 'hexagon', symbol: '⬡', color: '#B8116E' },
] as const

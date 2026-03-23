'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Quiz, Question, QuestionType } from '@/lib/types'
import { ANSWER_SHAPES } from '@/lib/types'
import { QuestionEditor } from './question-editor'

const QUESTION_TYPES: { type: QuestionType; label: string; icon: string; category: string }[] = [
  { type: 'quiz', label: 'Quiz', icon: '❓', category: 'Test knowledge' },
  { type: 'true_false', label: 'True / False', icon: '✅', category: 'Test knowledge' },
  { type: 'type_answer', label: 'Type Answer', icon: '⌨️', category: 'Test knowledge' },
  { type: 'slider', label: 'Slider', icon: '🎚️', category: 'Test knowledge' },
  { type: 'puzzle', label: 'Puzzle', icon: '🧩', category: 'Test knowledge' },
  { type: 'poll', label: 'Poll', icon: '📊', category: 'Collect opinions' },
  { type: 'word_cloud', label: 'Word Cloud', icon: '☁️', category: 'Collect opinions' },
  { type: 'brainstorm', label: 'Brainstorm', icon: '💡', category: 'Collect opinions' },
  { type: 'open_ended', label: 'Open-ended', icon: '💬', category: 'Collect opinions' },
  { type: 'nps_survey', label: 'NPS / Survey', icon: '📈', category: 'Collect opinions' },
  { type: 'image_reveal', label: 'Image Reveal', icon: '🖼️', category: 'Test knowledge' },
  { type: 'content_slide', label: 'Content Slide', icon: '📄', category: 'Present info' },
]

export function QuizEditor({
  quiz,
  initialQuestions,
}: {
  quiz: Quiz
  initialQuestions: Question[]
}) {
  const [questions, setQuestions] = useState<Question[]>(initialQuestions)
  const [selectedIndex, setSelectedIndex] = useState<number>(questions.length > 0 ? 0 : -1)
  const [showTypeSelector, setShowTypeSelector] = useState(false)
  const [title, setTitle] = useState(quiz.title)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const selectedQuestion = selectedIndex >= 0 ? questions[selectedIndex] : null

  const saveTitle = useCallback(async (newTitle: string) => {
    await supabase.from('quizzes').update({ title: newTitle, updated_at: new Date().toISOString() }).eq('id', quiz.id)
  }, [quiz.id, supabase])

  async function addQuestion(type: QuestionType) {
    setSaving(true)
    const sortOrder = questions.length

    const defaultOptions = type === 'quiz'
      ? [{ text: '' }, { text: '' }, { text: '' }, { text: '' }]
      : type === 'true_false'
      ? [{ text: 'True' }, { text: 'False' }]
      : type === 'poll'
      ? [{ text: '' }, { text: '' }, { text: '' }, { text: '' }]
      : type === 'nps_survey'
      ? { question_label: 'How likely are you to recommend?' }
      : type === 'slider'
      ? { min: 0, max: 100, step: 1 }
      : type === 'puzzle'
      ? [{ text: '' }, { text: '' }, { text: '' }, { text: '' }]
      : null

    const defaultCorrect = type === 'quiz'
      ? [0]
      : type === 'true_false'
      ? [true]
      : type === 'type_answer'
      ? [{ text: '', case_sensitive: false }]
      : type === 'slider'
      ? { value: 50, margin: 5 }
      : type === 'puzzle'
      ? [0, 1, 2, 3]
      : null

    const { data, error } = await supabase
      .from('questions')
      .insert({
        quiz_id: quiz.id,
        sort_order: sortOrder,
        type,
        question_text: '',
        time_limit: 30,
        points: type === 'poll' || type === 'word_cloud' || type === 'brainstorm' || type === 'open_ended' || type === 'nps_survey' || type === 'content_slide' ? 0 : 1000,
        options: defaultOptions,
        correct_answers: defaultCorrect,
      })
      .select()
      .single()

    if (data) {
      setQuestions([...questions, data])
      setSelectedIndex(questions.length)
      // Update question count
      await supabase.from('quizzes').update({ question_count: questions.length + 1, updated_at: new Date().toISOString() }).eq('id', quiz.id)
    }

    if (error) console.error('Failed to add question:', error)
    setShowTypeSelector(false)
    setSaving(false)
  }

  async function updateQuestion(updated: Question) {
    const newQuestions = questions.map((q) => (q.id === updated.id ? updated : q))
    setQuestions(newQuestions)

    await supabase
      .from('questions')
      .update({
        question_text: updated.question_text,
        options: updated.options,
        correct_answers: updated.correct_answers,
        time_limit: updated.time_limit,
        points: updated.points,
        media_url: updated.media_url,
      })
      .eq('id', updated.id)
  }

  async function deleteQuestion(id: string) {
    const newQuestions = questions.filter((q) => q.id !== id)
    setQuestions(newQuestions)
    if (selectedIndex >= newQuestions.length) {
      setSelectedIndex(newQuestions.length - 1)
    }

    await supabase.from('questions').delete().eq('id', id)
    await supabase.from('quizzes').update({ question_count: newQuestions.length, updated_at: new Date().toISOString() }).eq('id', quiz.id)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] -m-6">
      {/* Top bar */}
      <div className="h-12 bg-white border-b border-mid-gray flex items-center px-4 gap-3 flex-shrink-0">
        <button
          onClick={() => router.push('/library')}
          className="text-gray-text hover:text-dark-text text-sm"
        >
          ← Back
        </button>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => saveTitle(title)}
          className="text-sm font-bold text-dark-text bg-transparent border-none focus:outline-none flex-1"
          placeholder="Quiz title..."
        />
        <span className="text-xs text-gray-text">{questions.length} questions</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — question list */}
        <div className="w-48 bg-white border-r border-mid-gray overflow-y-auto flex-shrink-0">
          <div className="p-2 space-y-1">
            {questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => setSelectedIndex(i)}
                className={`w-full text-left p-2 rounded text-xs transition-colors ${
                  selectedIndex === i
                    ? 'bg-purple-primary text-white'
                    : 'hover:bg-light-gray text-dark-text'
                }`}
              >
                <div className="font-bold">{i + 1}. {QUESTION_TYPES.find(t => t.type === q.type)?.label}</div>
                <div className={`truncate mt-0.5 ${selectedIndex === i ? 'text-white/70' : 'text-gray-text'}`}>
                  {q.question_text || 'Untitled question'}
                </div>
              </button>
            ))}

            <button
              onClick={() => setShowTypeSelector(true)}
              disabled={saving}
              className="w-full h-10 border-2 border-dashed border-mid-gray rounded text-sm text-gray-text hover:border-blue-cta hover:text-blue-cta transition-colors"
            >
              + Add question
            </button>
          </div>
        </div>

        {/* Center — question editor */}
        <div className="flex-1 overflow-y-auto bg-light-gray">
          {showTypeSelector ? (
            <TypeSelector onSelect={addQuestion} onClose={() => setShowTypeSelector(false)} />
          ) : selectedQuestion ? (
            <QuestionEditor
              question={selectedQuestion}
              onUpdate={updateQuestion}
              onDelete={deleteQuestion}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-text">
              <div className="text-center">
                <div className="text-4xl mb-3">🎯</div>
                <p className="text-sm">Add your first question to get started</p>
                <button
                  onClick={() => setShowTypeSelector(true)}
                  className="mt-3 h-10 px-6 bg-blue-cta text-white text-sm font-bold rounded hover:bg-blue-accent transition-colors"
                >
                  + Add question
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar — question settings */}
        {selectedQuestion && !showTypeSelector && (
          <div className="w-56 bg-white border-l border-mid-gray p-4 flex-shrink-0 overflow-y-auto">
            <h3 className="text-xs font-bold text-dark-text mb-3 uppercase tracking-wide">Question Settings</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-dark-text mb-1">Time limit</label>
                <select
                  value={selectedQuestion.time_limit}
                  onChange={(e) => updateQuestion({ ...selectedQuestion, time_limit: Number(e.target.value) })}
                  className="w-full h-9 px-2 text-sm border border-border-gray rounded focus:outline-none focus:border-blue-cta"
                >
                  {[5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240].map((s) => (
                    <option key={s} value={s}>{s < 60 ? `${s} sec` : `${s / 60} min`}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-text mb-1">Points</label>
                <select
                  value={selectedQuestion.points}
                  onChange={(e) => updateQuestion({ ...selectedQuestion, points: Number(e.target.value) as 0 | 1000 | 2000 })}
                  className="w-full h-9 px-2 text-sm border border-border-gray rounded focus:outline-none focus:border-blue-cta"
                >
                  <option value={0}>No points</option>
                  <option value={1000}>Standard (1000)</option>
                  <option value={2000}>Double (2000)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-text mb-1">Type</label>
                <p className="text-sm text-gray-text">
                  {QUESTION_TYPES.find(t => t.type === selectedQuestion.type)?.label}
                </p>
              </div>

              <hr className="border-mid-gray" />

              <button
                onClick={() => deleteQuestion(selectedQuestion.id)}
                className="w-full h-9 border border-answer-red text-answer-red text-sm font-bold rounded hover:bg-red-50 transition-colors"
              >
                Delete question
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TypeSelector({ onSelect, onClose }: { onSelect: (type: QuestionType) => void; onClose: () => void }) {
  const categories = ['Test knowledge', 'Collect opinions', 'Present info']

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-dark-text">Choose question type</h2>
        <button onClick={onClose} className="text-gray-text hover:text-dark-text text-sm">✕ Close</button>
      </div>

      {categories.map((category) => (
        <div key={category} className="mb-6">
          <h3 className="text-xs font-bold text-gray-text uppercase tracking-wide mb-2">{category}</h3>
          <div className="grid grid-cols-3 gap-2">
            {QUESTION_TYPES.filter((t) => t.category === category).map((type) => (
              <button
                key={type.type}
                onClick={() => onSelect(type.type)}
                className="bg-white border border-mid-gray rounded-lg p-3 text-left hover:border-blue-cta hover:shadow-sm transition-all"
              >
                <div className="text-2xl mb-1">{type.icon}</div>
                <div className="text-sm font-bold text-dark-text">{type.label}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

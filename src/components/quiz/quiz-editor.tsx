'use client'

import { useState, useCallback, useEffect } from 'react'
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
  const [isDirty, setIsDirty] = useState(false)
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [dragQIdx, setDragQIdx] = useState<number | null>(null)
  const supabase = createClient()
  const router = useRouter()

  const selectedQuestion = selectedIndex >= 0 ? questions[selectedIndex] : null

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  // ── ADD QUESTION (inserts to DB for real ID, marks dirty for save) ──
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
      setQuestions((prev) => [...prev, data])
      setSelectedIndex(questions.length)
      setIsDirty(true)
    }

    if (error) console.error('Failed to add question:', error)
    setShowTypeSelector(false)
    setSaving(false)
  }

  // ── UPDATE QUESTION (local only) ──
  function updateQuestion(updated: Question) {
    setQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)))
    setIsDirty(true)
  }

  // ── DELETE QUESTION (local only, track ID for save) ──
  function deleteQuestion(id: string) {
    setQuestions((prev) => {
      const filtered = prev.filter((q) => q.id !== id)
      if (selectedIndex >= filtered.length) {
        setSelectedIndex(filtered.length - 1)
      }
      return filtered
    })
    setDeletedIds((prev) => [...prev, id])
    setIsDirty(true)
  }

  // ── REORDER (local only) ──
  function reorderQuestions(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return
    setQuestions((prev) => {
      const reordered = [...prev]
      const [moved] = reordered.splice(fromIdx, 1)
      reordered.splice(toIdx, 0, moved)
      return reordered
    })
    if (selectedIndex === fromIdx) setSelectedIndex(toIdx)
    else if (fromIdx < selectedIndex && toIdx >= selectedIndex) setSelectedIndex(selectedIndex - 1)
    else if (fromIdx > selectedIndex && toIdx <= selectedIndex) setSelectedIndex(selectedIndex + 1)
    setIsDirty(true)
  }

  // ── SAVE ALL ──
  async function saveAll() {
    setSaving(true)
    try {
      // 1. Delete removed questions
      if (deletedIds.length > 0) {
        await Promise.all(deletedIds.map((id) =>
          supabase.from('questions').delete().eq('id', id)
        ))
      }

      // 2. Update all remaining questions (content + sort_order)
      await Promise.all(questions.map((q, i) =>
        supabase.from('questions').update({
          question_text: q.question_text,
          options: q.options,
          correct_answers: q.correct_answers,
          time_limit: q.time_limit,
          points: q.points,
          media_url: q.media_url,
          sort_order: i,
        }).eq('id', q.id)
      ))

      // 3. Update quiz title + question count
      await supabase.from('quizzes').update({
        title,
        question_count: questions.length,
        updated_at: new Date().toISOString(),
      }).eq('id', quiz.id)

      setDeletedIds([])
      setIsDirty(false)
      setToast('Saved successfully!')
    } catch (err) {
      console.error('Save failed:', err)
      setToast('Save failed. Please try again.')
    }
    setSaving(false)
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
          onChange={(e) => { setTitle(e.target.value); setIsDirty(true) }}
          className="text-sm font-bold text-dark-text bg-transparent border-none focus:outline-none flex-1"
          placeholder="Quiz title..."
        />
        <span className="text-xs text-gray-text">{questions.length} questions</span>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left sidebar — question list */}
        <div className="w-48 bg-white border-r border-mid-gray overflow-y-auto flex-shrink-0">
          <div className="p-2 space-y-1">
            {questions.map((q, i) => (
              <button
                key={q.id}
                draggable
                onDragStart={() => setDragQIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragQIdx !== null) { reorderQuestions(dragQIdx, i); setDragQIdx(null) } }}
                onDragEnd={() => setDragQIdx(null)}
                onClick={() => setSelectedIndex(i)}
                className={`w-full text-left p-2 rounded text-xs transition-colors cursor-grab active:cursor-grabbing ${
                  dragQIdx === i ? 'opacity-40' : ''
                } ${
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

        {/* Save button — fixed bottom-right */}
        {isDirty && (
          <button
            onClick={saveAll}
            disabled={saving}
            className="absolute bottom-6 right-6 h-12 px-8 bg-correct-green text-white font-bold text-sm rounded-lg shadow-xl hover:bg-green-600 transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100 z-10 animate-save-enter"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}

        {/* Toast notification */}
        {toast && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-dark-text text-white text-sm font-bold px-6 py-3 rounded-lg shadow-xl z-20 animate-toast">
            {toast}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes save-enter {
          0% { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-save-enter { animation: save-enter 0.3s ease-out both; }
        @keyframes toast-anim {
          0% { transform: translate(-50%, 20px); opacity: 0; }
          10% { transform: translate(-50%, 0); opacity: 1; }
          90% { transform: translate(-50%, 0); opacity: 1; }
          100% { transform: translate(-50%, -10px); opacity: 0; }
        }
        .animate-toast { animation: toast-anim 2.5s ease-out both; }
      `}</style>
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

'use client'

import { useState, useCallback, useEffect, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Quiz, Question, QuestionType } from '@/lib/types'
import { ANSWER_SHAPES } from '@/lib/types'
import { QuestionEditor } from './question-editor'
import { BannerEditor } from './banner-editor'
import { ThemePicker } from './theme-picker'
import { SpreadsheetImport } from './spreadsheet-import'
import {
  CircleHelp,
  CheckCircle,
  Keyboard,
  SlidersHorizontal,
  Puzzle,
  BarChart3,
  Cloud,
  MessageCircle,
  TrendingUp,
  Image as ImageIcon,
  Presentation,
  Settings,
  Target,
} from 'lucide-react'

const QUESTION_TYPES: { type: QuestionType; label: string; icon: ReactNode; category: string }[] = [
  { type: 'quiz', label: 'Quiz', icon: <CircleHelp className="w-6 h-6" />, category: 'Test knowledge' },
  { type: 'true_false', label: 'True / False', icon: <CheckCircle className="w-6 h-6" />, category: 'Test knowledge' },
  { type: 'type_answer', label: 'Type Answer', icon: <Keyboard className="w-6 h-6" />, category: 'Test knowledge' },
  { type: 'slider', label: 'Slider', icon: <SlidersHorizontal className="w-6 h-6" />, category: 'Test knowledge' },
  { type: 'puzzle', label: 'Puzzle', icon: <Puzzle className="w-6 h-6" />, category: 'Test knowledge' },
  { type: 'poll', label: 'Poll', icon: <BarChart3 className="w-6 h-6" />, category: 'Collect opinions' },
  { type: 'word_cloud', label: 'Word Cloud', icon: <Cloud className="w-6 h-6" />, category: 'Collect opinions' },
  { type: 'open_ended', label: 'Open-ended', icon: <MessageCircle className="w-6 h-6" />, category: 'Collect opinions' },
  { type: 'nps_survey', label: 'NPS / Survey', icon: <TrendingUp className="w-6 h-6" />, category: 'Collect opinions' },
  { type: 'image_reveal', label: 'Image Reveal', icon: <ImageIcon className="w-6 h-6" />, category: 'Test knowledge' },
  { type: 'content_slide', label: 'Content Slide', icon: <Presentation className="w-6 h-6" />, category: 'Present info' },
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
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(quiz.cover_image_url)
  const [themeId, setThemeId] = useState<string | null>(quiz.theme_id)
  const [showSettings, setShowSettings] = useState(false)
  const [showImport, setShowImport] = useState(false)
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
      : type === 'content_slide'
      ? { title: '', body: '', layout: 'center' }
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
      : type === 'image_reveal'
      ? [{ text: '', case_sensitive: false }]
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

  // ── IMPORT QUESTIONS FROM SPREADSHEET ──
  async function handleImport(parsed: { questionText: string; type: QuestionType; options: string[]; correctAnswer: string; timeLimit: number; points: number }[]) {
    setSaving(true)
    setShowImport(false)

    const startOrder = questions.length
    const inserts = parsed.map((q, i) => {
      let options = null
      let correctAnswers = null

      if (q.type === 'quiz' || q.type === 'poll') {
        options = q.options.map((text) => ({ text }))
        // Pad to 4 options
        while (options.length < 2) options.push({ text: '' })
        if (q.type === 'quiz') {
          // Map A/B/C/D to index, or find matching text
          const letter = q.correctAnswer.toUpperCase()
          const letterIdx = 'ABCD'.indexOf(letter)
          if (letterIdx >= 0 && letterIdx < options.length) {
            correctAnswers = [letterIdx]
          } else {
            const textIdx = options.findIndex((o) => o.text.toLowerCase() === q.correctAnswer.toLowerCase())
            correctAnswers = [textIdx >= 0 ? textIdx : 0]
          }
        }
      } else if (q.type === 'true_false') {
        options = [{ text: 'True' }, { text: 'False' }]
        const val = q.correctAnswer.toLowerCase()
        correctAnswers = [val === 'true' || val === 't' || val === 'yes']
      } else if (q.type === 'type_answer') {
        correctAnswers = [{ text: q.correctAnswer, case_sensitive: false }]
      } else if (q.type === 'slider') {
        options = { min: 0, max: 100, step: 1 }
        const val = Number(q.correctAnswer) || 50
        correctAnswers = { value: val, margin: 5 }
      }

      const isNonScored = ['poll', 'open_ended', 'nps_survey', 'word_cloud', 'brainstorm', 'content_slide'].includes(q.type)

      return {
        quiz_id: quiz.id,
        sort_order: startOrder + i,
        type: q.type,
        question_text: q.questionText,
        time_limit: q.timeLimit,
        points: isNonScored ? 0 : (q.points as 0 | 1000 | 2000),
        options,
        correct_answers: correctAnswers,
      }
    })

    const { data, error } = await supabase
      .from('questions')
      .insert(inserts)
      .select()

    if (data && data.length > 0) {
      setQuestions((prev) => [...prev, ...data])
      setSelectedIndex(questions.length)
      setIsDirty(true)
      setToast(`Imported ${data.length} questions`)
    }
    if (error) {
      console.error('Import failed:', error)
      setToast('Import failed: ' + error.message)
    }
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
        const { error } = await supabase
          .from('questions')
          .delete()
          .in('id', deletedIds)
        if (error) {
          console.error('Delete failed:', error)
          setToast(`Save failed: ${error.message}`)
          setSaving(false)
          return
        }
      }

      // 2. Update all remaining questions (content + sort_order)
      // Use Promise.allSettled so one failure doesn't block the rest
      const updateResults = await Promise.allSettled(
        questions.map((q, i) =>
          supabase.from('questions').update({
            question_text: q.question_text,
            options: q.options,
            correct_answers: q.correct_answers,
            time_limit: q.time_limit,
            points: q.points,
            media_url: q.media_url,
            sort_order: i,
          }).eq('id', q.id)
        )
      )

      const updateErrors = updateResults
        .map((r, i) => r.status === 'fulfilled' && r.value.error ? `Q${i + 1}: ${r.value.error.message}` : null)
        .filter(Boolean)

      if (updateErrors.length > 0) {
        console.error('Update errors:', updateErrors)
        setToast(`Save failed: ${updateErrors[0]}`)
        setSaving(false)
        return
      }

      // 3. Update quiz title + question count + cover image
      const { error: quizError } = await supabase.from('quizzes').update({
        title,
        cover_image_url: coverImageUrl,
        theme_id: themeId,
        question_count: questions.length,
        updated_at: new Date().toISOString(),
      }).eq('id', quiz.id)

      if (quizError) {
        console.error('Quiz update failed:', quizError)
        setToast(`Save failed: ${quizError.message}`)
        setSaving(false)
        return
      }

      setDeletedIds([])
      setIsDirty(false)
      setToast('Saved successfully!')
      router.refresh()
    } catch (err) {
      console.error('Save exception:', err)
      setToast(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
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
        <button
          onClick={() => setShowSettings(true)}
          className="h-8 px-3 text-xs font-bold text-gray-text border border-mid-gray rounded-lg hover:text-dark-text hover:border-dark-text transition-colors flex items-center gap-1.5"
        >
          <Settings className="w-4 h-4" /> Settings
        </button>
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
            <button
              onClick={() => setShowImport(true)}
              disabled={saving}
              className="w-full h-8 text-xs text-gray-text hover:text-blue-cta transition-colors"
            >
              Import from spreadsheet
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
                <Target className="w-10 h-10 mx-auto mb-3 text-gray-text" />
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

        {/* Right sidebar — question settings only */}
        {!showTypeSelector && selectedQuestion && (
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

        {/* Quiz Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSettings(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-mid-gray">
                <h2 className="text-lg font-bold text-dark-text">Quiz Settings</h2>
                <button onClick={() => setShowSettings(false)} className="text-gray-text hover:text-dark-text text-lg">✕</button>
              </div>
              <div className="p-5 space-y-6">
                {/* Banner */}
                <div>
                  <h3 className="text-sm font-bold text-dark-text mb-3">Banner Image</h3>
                  <BannerEditor
                    quizId={quiz.id}
                    coverImageUrl={coverImageUrl}
                    onUpdate={(url) => { setCoverImageUrl(url); setIsDirty(true) }}
                  />
                </div>

                {/* Theme */}
                <div>
                  <h3 className="text-sm font-bold text-dark-text mb-3">Theme</h3>
                  <ThemePicker
                    quizId={quiz.id}
                    selectedThemeId={themeId}
                    onSelect={(id) => { setThemeId(id); setIsDirty(true) }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Spreadsheet Import Modal */}
        {showImport && (
          <SpreadsheetImport
            onImport={handleImport}
            onClose={() => setShowImport(false)}
          />
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
                <div className="mb-1 text-dark-text">{type.icon}</div>
                <div className="text-sm font-bold text-dark-text">{type.label}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

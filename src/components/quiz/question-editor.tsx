'use client'

import { useState } from 'react'
import type { Question, QuizOption, SliderOptions, ContentSlideOptions } from '@/lib/types'
import { ANSWER_SHAPES } from '@/lib/types'

export function QuestionEditor({
  question,
  onUpdate,
  onDelete,
}: {
  question: Question
  onUpdate: (q: Question) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Question text */}
      <div className="bg-white rounded-lg border border-mid-gray p-6 mb-4">
        <textarea
          value={question.question_text || ''}
          onChange={(e) => onUpdate({ ...question, question_text: e.target.value })}
          placeholder="Start typing your question..."
          className="w-full text-center text-xl font-normal text-dark-text bg-transparent border-none focus:outline-none resize-none placeholder:text-border-gray"
          rows={2}
        />
      </div>

      {/* Answer options — varies by type */}
      {question.type === 'quiz' && (
        <MCQEditor question={question} onUpdate={onUpdate} />
      )}
      {question.type === 'true_false' && (
        <TrueFalseEditor question={question} onUpdate={onUpdate} />
      )}
      {question.type === 'poll' && (
        <PollEditor question={question} onUpdate={onUpdate} />
      )}
      {question.type === 'type_answer' && (
        <TypeAnswerEditor question={question} onUpdate={onUpdate} />
      )}
      {question.type === 'open_ended' && (
        <OpenEndedEditor />
      )}
      {question.type === 'nps_survey' && (
        <NPSSurveyEditor question={question} onUpdate={onUpdate} />
      )}
      {question.type === 'slider' && (
        <SliderEditor question={question} onUpdate={onUpdate} />
      )}
      {question.type === 'puzzle' && (
        <PuzzleEditor question={question} onUpdate={onUpdate} />
      )}
      {question.type === 'word_cloud' && (
        <WordCloudEditor />
      )}
      {question.type === 'brainstorm' && (
        <BrainstormEditor />
      )}
      {question.type === 'content_slide' && (
        <ContentSlideEditor question={question} onUpdate={onUpdate} />
      )}
      {question.type === 'image_reveal' && (
        <ImageRevealEditor question={question} onUpdate={onUpdate} />
      )}
    </div>
  )
}

function MCQEditor({ question, onUpdate }: { question: Question; onUpdate: (q: Question) => void }) {
  const options = (question.options as QuizOption[]) || []
  const correctAnswers = (question.correct_answers as number[]) || []

  function updateOption(index: number, text: string) {
    const newOptions = [...options]
    newOptions[index] = { ...newOptions[index], text }
    onUpdate({ ...question, options: newOptions })
  }

  function toggleCorrect(index: number) {
    const newCorrect = correctAnswers.includes(index)
      ? correctAnswers.filter((i) => i !== index)
      : [...correctAnswers, index]
    onUpdate({ ...question, correct_answers: newCorrect })
  }

  function addOption() {
    if (options.length >= 6) return
    onUpdate({ ...question, options: [...options, { text: '' }] })
  }

  function removeOption(index: number) {
    if (options.length <= 2) return
    const newOptions = options.filter((_, i) => i !== index)
    const newCorrect = correctAnswers
      .filter((i) => i !== index)
      .map((i) => (i > index ? i - 1 : i))
    onUpdate({ ...question, options: newOptions, correct_answers: newCorrect })
  }

  return (
    <div className="space-y-2">
      {options.map((option, i) => {
        const shape = ANSWER_SHAPES[i]
        const isCorrect = correctAnswers.includes(i)
        return (
          <div
            key={i}
            className="flex items-center gap-2 bg-white rounded-lg border-2 overflow-hidden transition-colors"
            style={{ borderColor: isCorrect ? shape.color : '#E9E9E9' }}
          >
            {/* Shape indicator */}
            <div
              className="w-10 h-24 flex items-center justify-center text-white text-lg flex-shrink-0"
              style={{ backgroundColor: shape.color }}
            >
              {shape.symbol}
            </div>

            {/* Text input */}
            <input
              type="text"
              value={option.text}
              onChange={(e) => updateOption(i, e.target.value)}
              placeholder={`Add answer ${i + 1}`}
              className="flex-1 h-24 text-sm text-dark-text bg-transparent border-none focus:outline-none px-2"
            />

            {/* Correct toggle */}
            <button
              onClick={() => toggleCorrect(i)}
              className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 transition-colors ${
                isCorrect
                  ? 'bg-correct-green text-white'
                  : 'border-2 border-mid-gray text-mid-gray hover:border-correct-green'
              }`}
            >
              ✓
            </button>

            {/* Remove button */}
            {options.length > 2 && (
              <button
                onClick={() => removeOption(i)}
                className="text-gray-text hover:text-answer-red mr-2 text-sm"
              >
                ✕
              </button>
            )}
          </div>
        )
      })}

      {options.length < 6 && (
        <button
          onClick={addOption}
          className="w-full h-12 border-2 border-dashed border-mid-gray rounded-lg text-sm text-gray-text hover:border-blue-cta hover:text-blue-cta transition-colors"
        >
          + Add option
        </button>
      )}
    </div>
  )
}

function TrueFalseEditor({ question, onUpdate }: { question: Question; onUpdate: (q: Question) => void }) {
  const correctAnswer = (question.correct_answers as boolean[])?.[0] ?? true

  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        onClick={() => onUpdate({ ...question, correct_answers: [true] })}
        className={`h-24 rounded-lg text-white font-bold text-lg flex items-center justify-center gap-2 transition-all ${
          correctAnswer === true ? 'ring-4 ring-correct-green' : 'opacity-70'
        }`}
        style={{ backgroundColor: ANSWER_SHAPES[0].color }}
      >
        {ANSWER_SHAPES[0].symbol} True
        {correctAnswer === true && <span className="text-sm">✓</span>}
      </button>
      <button
        onClick={() => onUpdate({ ...question, correct_answers: [false] })}
        className={`h-24 rounded-lg text-white font-bold text-lg flex items-center justify-center gap-2 transition-all ${
          correctAnswer === false ? 'ring-4 ring-correct-green' : 'opacity-70'
        }`}
        style={{ backgroundColor: ANSWER_SHAPES[1].color }}
      >
        {ANSWER_SHAPES[1].symbol} False
        {correctAnswer === false && <span className="text-sm">✓</span>}
      </button>
    </div>
  )
}

function PollEditor({ question, onUpdate }: { question: Question; onUpdate: (q: Question) => void }) {
  const options = (question.options as QuizOption[]) || []

  function updateOption(index: number, text: string) {
    const newOptions = [...options]
    newOptions[index] = { ...newOptions[index], text }
    onUpdate({ ...question, options: newOptions })
  }

  function addOption() {
    if (options.length >= 6) return
    onUpdate({ ...question, options: [...options, { text: '' }] })
  }

  return (
    <div className="space-y-2">
      {options.map((option, i) => {
        const shape = ANSWER_SHAPES[i]
        return (
          <div
            key={i}
            className="flex items-center gap-2 bg-white rounded-lg border-2 border-mid-gray overflow-hidden"
          >
            <div
              className="w-10 h-16 flex items-center justify-center text-white text-lg flex-shrink-0"
              style={{ backgroundColor: shape.color }}
            >
              {shape.symbol}
            </div>
            <input
              type="text"
              value={option.text}
              onChange={(e) => updateOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              className="flex-1 h-16 text-sm text-dark-text bg-transparent border-none focus:outline-none px-2"
            />
          </div>
        )
      })}
      {options.length < 6 && (
        <button
          onClick={addOption}
          className="w-full h-12 border-2 border-dashed border-mid-gray rounded-lg text-sm text-gray-text hover:border-blue-cta hover:text-blue-cta transition-colors"
        >
          + Add option
        </button>
      )}
    </div>
  )
}

function TypeAnswerEditor({ question, onUpdate }: { question: Question; onUpdate: (q: Question) => void }) {
  const answers = (question.correct_answers as { text: string; case_sensitive?: boolean }[]) || []

  function updateAnswer(index: number, text: string) {
    const newAnswers = [...answers]
    newAnswers[index] = { ...newAnswers[index], text }
    onUpdate({ ...question, correct_answers: newAnswers })
  }

  function toggleCaseSensitive(index: number) {
    const newAnswers = [...answers]
    newAnswers[index] = { ...newAnswers[index], case_sensitive: !newAnswers[index].case_sensitive }
    onUpdate({ ...question, correct_answers: newAnswers })
  }

  function addAnswer() {
    if (answers.length >= 6) return
    onUpdate({ ...question, correct_answers: [...answers, { text: '', case_sensitive: false }] })
  }

  function removeAnswer(index: number) {
    if (answers.length <= 1) return
    onUpdate({ ...question, correct_answers: answers.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-text font-bold uppercase tracking-wide">Accepted answers</p>
      {answers.map((answer, i) => (
        <div key={i} className="flex items-center gap-2 bg-white rounded-lg border-2 border-correct-green overflow-hidden">
          <div className="w-10 h-14 flex items-center justify-center bg-correct-green text-white text-lg flex-shrink-0">
            ✓
          </div>
          <input
            type="text"
            value={answer.text}
            onChange={(e) => updateAnswer(i, e.target.value)}
            placeholder={`Accepted answer ${i + 1}`}
            maxLength={20}
            className="flex-1 h-14 text-sm text-dark-text bg-transparent border-none focus:outline-none px-2"
          />
          <button
            onClick={() => toggleCaseSensitive(i)}
            className={`text-xs px-2 py-1 rounded mr-1 transition-colors ${
              answer.case_sensitive
                ? 'bg-blue-cta text-white'
                : 'bg-light-gray text-gray-text hover:bg-mid-gray'
            }`}
            title="Case sensitive"
          >
            Aa
          </button>
          {answers.length > 1 && (
            <button
              onClick={() => removeAnswer(i)}
              className="text-gray-text hover:text-answer-red mr-2 text-sm"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {answers.length < 6 && (
        <button
          onClick={addAnswer}
          className="w-full h-10 border-2 border-dashed border-mid-gray rounded-lg text-sm text-gray-text hover:border-correct-green hover:text-correct-green transition-colors"
        >
          + Add accepted answer
        </button>
      )}
      <p className="text-xs text-gray-text">Players type a short answer (max 20 chars). Punctuation is ignored when checking.</p>
    </div>
  )
}

function OpenEndedEditor() {
  return (
    <div className="bg-white rounded-lg border border-mid-gray p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-purple-primary/10 flex items-center justify-center text-lg">💬</div>
        <div>
          <p className="text-sm font-bold text-dark-text">Open-ended response</p>
          <p className="text-xs text-gray-text">Players type a free text response (up to 250 characters)</p>
        </div>
      </div>
      <div className="bg-light-gray rounded-lg p-4 border border-border-gray">
        <p className="text-xs text-gray-text italic">Responses will be displayed on a scrollable wall on the host screen. No points are awarded.</p>
      </div>
    </div>
  )
}

function NPSSurveyEditor({ question, onUpdate }: { question: Question; onUpdate: (q: Question) => void }) {
  const options = (question.options as { question_label?: string } | null) || {}
  const label = options.question_label || ''

  return (
    <div className="bg-white rounded-lg border border-mid-gray p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-purple-primary/10 flex items-center justify-center text-lg">📈</div>
        <div>
          <p className="text-sm font-bold text-dark-text">NPS / Survey Scale</p>
          <p className="text-xs text-gray-text">Players select a score from 0 to 10</p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-dark-text mb-1">Scale label (optional)</label>
        <input
          type="text"
          value={label}
          onChange={(e) => onUpdate({ ...question, options: { question_label: e.target.value } as unknown as null })}
          placeholder="How likely are you to recommend?"
          className="w-full h-10 px-3 text-sm border border-border-gray rounded focus:outline-none focus:border-blue-cta"
        />
      </div>

      {/* Preview */}
      <div className="bg-light-gray rounded-lg p-4 border border-border-gray">
        <p className="text-xs text-gray-text font-bold mb-2">Preview</p>
        <div className="flex gap-1 justify-center">
          {Array.from({ length: 11 }, (_, i) => (
            <div
              key={i}
              className="w-7 h-7 rounded text-xs font-bold flex items-center justify-center text-white"
              style={{
                backgroundColor: i <= 6 ? '#E21B3C' : i <= 8 ? '#D89E00' : '#26890C',
              }}
            >
              {i}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-gray-text">
          <span>Detractors (0-6)</span>
          <span>Passives (7-8)</span>
          <span>Promoters (9-10)</span>
        </div>
      </div>

      <p className="text-xs text-gray-text">Results are segmented into Detractors, Passives, and Promoters. NPS score is calculated automatically. No points awarded.</p>
    </div>
  )
}

function SliderEditor({ question, onUpdate }: { question: Question; onUpdate: (q: Question) => void }) {
  const opts = (question.options as SliderOptions) || { min: 0, max: 100, step: 1 }
  const correct = (question.correct_answers as { value: number; margin?: number }) || { value: 50, margin: 5 }

  const MARGINS: { label: string; value: number }[] = [
    { label: 'None (exact)', value: 0 },
    { label: 'Low', value: Math.round((opts.max - opts.min) * 0.05) || 1 },
    { label: 'Medium', value: Math.round((opts.max - opts.min) * 0.1) || 2 },
    { label: 'High', value: Math.round((opts.max - opts.min) * 0.2) || 5 },
    { label: 'Maximum', value: Math.round((opts.max - opts.min) * 0.3) || 10 },
  ]

  function updateOpts(patch: Partial<SliderOptions>) {
    onUpdate({ ...question, options: { ...opts, ...patch } as unknown as null })
  }

  function updateCorrect(patch: Partial<{ value: number; margin: number }>) {
    onUpdate({ ...question, correct_answers: { ...correct, ...patch } })
  }

  return (
    <div className="bg-white rounded-lg border border-mid-gray p-6 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-purple-primary/10 flex items-center justify-center text-lg">🎚️</div>
        <div>
          <p className="text-sm font-bold text-dark-text">Slider</p>
          <p className="text-xs text-gray-text">Players drag a slider to answer</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-bold text-dark-text mb-1">Min</label>
          <input type="number" value={opts.min} onChange={(e) => updateOpts({ min: Number(e.target.value) })}
            className="w-full h-9 px-2 text-sm border border-border-gray rounded focus:outline-none focus:border-blue-cta" />
        </div>
        <div>
          <label className="block text-xs font-bold text-dark-text mb-1">Max</label>
          <input type="number" value={opts.max} onChange={(e) => updateOpts({ max: Number(e.target.value) })}
            className="w-full h-9 px-2 text-sm border border-border-gray rounded focus:outline-none focus:border-blue-cta" />
        </div>
        <div>
          <label className="block text-xs font-bold text-dark-text mb-1">Step</label>
          <input type="number" value={opts.step} onChange={(e) => updateOpts({ step: Number(e.target.value) || 1 })} min={1}
            className="w-full h-9 px-2 text-sm border border-border-gray rounded focus:outline-none focus:border-blue-cta" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-dark-text mb-1">Correct answer</label>
        <input type="number" value={correct.value} min={opts.min} max={opts.max} step={opts.step}
          onChange={(e) => updateCorrect({ value: Number(e.target.value) })}
          className="w-full h-9 px-2 text-sm border border-border-gray rounded focus:outline-none focus:border-blue-cta" />
      </div>

      <div>
        <label className="block text-xs font-bold text-dark-text mb-1">Answer margin</label>
        <select value={correct.margin ?? 0} onChange={(e) => updateCorrect({ margin: Number(e.target.value) })}
          className="w-full h-9 px-2 text-sm border border-border-gray rounded focus:outline-none focus:border-blue-cta">
          {MARGINS.map((m) => (
            <option key={m.label} value={m.value}>{m.label} (±{m.value})</option>
          ))}
        </select>
      </div>

      {/* Preview */}
      <div className="bg-light-gray rounded-lg p-4 border border-border-gray">
        <p className="text-xs text-gray-text font-bold mb-2">Preview</p>
        <input type="range" min={opts.min} max={opts.max} step={opts.step} value={correct.value} readOnly
          className="w-full accent-purple-primary" />
        <div className="flex justify-between text-xs text-gray-text mt-1">
          <span>{opts.min}</span>
          <span className="font-bold text-correct-green">{correct.value} (±{correct.margin ?? 0})</span>
          <span>{opts.max}</span>
        </div>
      </div>
    </div>
  )
}

function PuzzleEditor({ question, onUpdate }: { question: Question; onUpdate: (q: Question) => void }) {
  const items = (question.options as QuizOption[]) || []

  function updateItem(index: number, text: string) {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], text }
    onUpdate({ ...question, options: newItems })
  }

  function addItem() {
    if (items.length >= 6) return
    const newItems = [...items, { text: '' }]
    const newCorrect = Array.from({ length: newItems.length }, (_, i) => i)
    onUpdate({ ...question, options: newItems, correct_answers: newCorrect })
  }

  function removeItem(index: number) {
    if (items.length <= 2) return
    const newItems = items.filter((_, i) => i !== index)
    const newCorrect = Array.from({ length: newItems.length }, (_, i) => i)
    onUpdate({ ...question, options: newItems, correct_answers: newCorrect })
  }

  function moveItem(from: number, to: number) {
    if (to < 0 || to >= items.length) return
    const newItems = [...items]
    const [moved] = newItems.splice(from, 1)
    newItems.splice(to, 0, moved)
    const newCorrect = Array.from({ length: newItems.length }, (_, i) => i)
    onUpdate({ ...question, options: newItems, correct_answers: newCorrect })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-text font-bold uppercase tracking-wide">Items in correct order (top to bottom)</p>
      <p className="text-xs text-gray-text">Arrange items in the correct order here. Players will see them shuffled.</p>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 bg-white rounded-lg border-2 border-purple-primary/30 overflow-hidden">
          <div className="w-10 h-14 flex items-center justify-center bg-purple-primary text-white text-sm font-bold flex-shrink-0">
            {i + 1}
          </div>
          <input
            type="text"
            value={item.text}
            onChange={(e) => updateItem(i, e.target.value)}
            placeholder={`Item ${i + 1}`}
            className="flex-1 h-14 text-sm text-dark-text bg-transparent border-none focus:outline-none px-2"
          />
          <button onClick={() => moveItem(i, i - 1)} disabled={i === 0}
            className="text-gray-text hover:text-dark-text disabled:opacity-20 text-sm px-1">▲</button>
          <button onClick={() => moveItem(i, i + 1)} disabled={i === items.length - 1}
            className="text-gray-text hover:text-dark-text disabled:opacity-20 text-sm px-1">▼</button>
          {items.length > 2 && (
            <button onClick={() => removeItem(i)} className="text-gray-text hover:text-answer-red mr-2 text-sm">✕</button>
          )}
        </div>
      ))}
      {items.length < 6 && (
        <button onClick={addItem}
          className="w-full h-10 border-2 border-dashed border-mid-gray rounded-lg text-sm text-gray-text hover:border-purple-primary hover:text-purple-primary transition-colors">
          + Add item
        </button>
      )}
    </div>
  )
}

function WordCloudEditor() {
  return (
    <div className="bg-white rounded-lg border border-mid-gray p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-purple-primary/10 flex items-center justify-center text-lg">☁️</div>
        <div>
          <p className="text-sm font-bold text-dark-text">Word Cloud</p>
          <p className="text-xs text-gray-text">Players type 1-3 words. Popular responses appear larger.</p>
        </div>
      </div>
      <div className="bg-light-gray rounded-lg p-4 border border-border-gray">
        <p className="text-xs text-gray-text italic">Responses are aggregated into an animated word cloud on the host screen. More popular words appear larger. No points awarded.</p>
      </div>
    </div>
  )
}

function BrainstormEditor() {
  return (
    <div className="bg-white rounded-lg border border-mid-gray p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-purple-primary/10 flex items-center justify-center text-lg">💡</div>
        <div>
          <p className="text-sm font-bold text-dark-text">Brainstorm</p>
          <p className="text-xs text-gray-text">Players submit ideas (up to 100 characters each)</p>
        </div>
      </div>
      <div className="bg-light-gray rounded-lg p-4 border border-border-gray">
        <p className="text-xs text-gray-text italic">Ideas are displayed as cards on the host screen. No points awarded.</p>
      </div>
    </div>
  )
}

function ContentSlideEditor({ question, onUpdate }: { question: Question; onUpdate: (q: Question) => void }) {
  const opts = (question.options as ContentSlideOptions | null) || { title: '', body: '', layout: 'center' }

  function update(patch: Partial<ContentSlideOptions>) {
    onUpdate({ ...question, options: { ...opts, ...patch } as unknown as null })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-purple-primary/10 flex items-center justify-center text-lg">📄</div>
        <div>
          <p className="text-sm font-bold text-dark-text">Content Slide</p>
          <p className="text-xs text-gray-text">Display information to players. No answers collected.</p>
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold text-dark-text mb-1">Slide title</label>
        <input
          type="text"
          value={opts.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Enter slide title..."
          className="w-full h-10 px-3 text-sm border border-border-gray rounded focus:outline-none focus:border-blue-cta"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-dark-text mb-1">Body text</label>
        <textarea
          value={opts.body}
          onChange={(e) => update({ body: e.target.value })}
          placeholder="Enter slide content..."
          rows={4}
          className="w-full px-3 py-2 text-sm border border-border-gray rounded focus:outline-none focus:border-blue-cta resize-none"
        />
      </div>
    </div>
  )
}

function ImageRevealEditor({ question, onUpdate }: { question: Question; onUpdate: (q: Question) => void }) {
  const answers = (question.correct_answers as { text: string; case_sensitive?: boolean }[]) || []

  function updateAnswer(index: number, text: string) {
    const newAnswers = [...answers]
    newAnswers[index] = { ...newAnswers[index], text }
    onUpdate({ ...question, correct_answers: newAnswers })
  }

  function addAnswer() {
    if (answers.length >= 6) return
    onUpdate({ ...question, correct_answers: [...answers, { text: '', case_sensitive: false }] })
  }

  function removeAnswer(index: number) {
    if (answers.length <= 1) return
    onUpdate({ ...question, correct_answers: answers.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-purple-primary/10 flex items-center justify-center text-lg">🖼️</div>
        <div>
          <p className="text-sm font-bold text-dark-text">Image Reveal</p>
          <p className="text-xs text-gray-text">Upload an image via the media field above. It will be progressively revealed during the game.</p>
        </div>
      </div>
      <div className="bg-light-gray rounded-lg p-3 border border-border-gray">
        <p className="text-xs text-gray-text">The image will start hidden behind colored tiles that gradually disappear. Players type their guess.</p>
      </div>
      <p className="text-xs text-gray-text font-bold uppercase tracking-wide">Accepted answers</p>
      {answers.map((answer, i) => (
        <div key={i} className="flex items-center gap-2 bg-white rounded-lg border-2 border-correct-green overflow-hidden">
          <div className="w-10 h-14 flex items-center justify-center bg-correct-green text-white text-lg flex-shrink-0">✓</div>
          <input
            type="text"
            value={answer.text}
            onChange={(e) => updateAnswer(i, e.target.value)}
            placeholder={`Accepted answer ${i + 1}`}
            maxLength={30}
            className="flex-1 h-14 text-sm text-dark-text bg-transparent border-none focus:outline-none px-2"
          />
          {answers.length > 1 && (
            <button onClick={() => removeAnswer(i)} className="text-gray-text hover:text-answer-red mr-2 text-sm">✕</button>
          )}
        </div>
      ))}
      {answers.length < 6 && (
        <button
          onClick={addAnswer}
          className="w-full h-10 border-2 border-dashed border-mid-gray rounded-lg text-sm text-gray-text hover:border-correct-green hover:text-correct-green transition-colors"
        >
          + Add accepted answer
        </button>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import type { Question, QuizOption } from '@/lib/types'
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
      {/* Other types show a placeholder for now */}
      {!['quiz', 'true_false', 'poll'].includes(question.type) && (
        <div className="bg-white rounded-lg border border-mid-gray p-6 text-center text-gray-text text-sm">
          {question.type.replace('_', ' ')} editor — coming in Session 4-6
        </div>
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

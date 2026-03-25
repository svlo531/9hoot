'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import type { QuestionType } from '@/lib/types'

interface ParsedQuestion {
  questionText: string
  type: QuestionType
  options: string[]
  correctAnswer: string
  timeLimit: number
  points: number
}

interface Props {
  onImport: (questions: ParsedQuestion[]) => void
  onClose: () => void
}

const TYPE_MAP: Record<string, QuestionType> = {
  'quiz': 'quiz',
  'mcq': 'quiz',
  'multiple choice': 'quiz',
  'true/false': 'true_false',
  'true false': 'true_false',
  'tf': 'true_false',
  'type answer': 'type_answer',
  'open ended': 'open_ended',
  'poll': 'poll',
  'slider': 'slider',
}

function parseType(raw: string): QuestionType {
  const lower = (raw || '').trim().toLowerCase()
  return TYPE_MAP[lower] || 'quiz'
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  const data = [
    ['Question', 'Type', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Time Limit (sec)', 'Points'],
    ['What is the capital of France?', 'Quiz', 'Paris', 'London', 'Berlin', 'Madrid', 'A', 30, 1000],
    ['The Earth is flat.', 'True/False', '', '', '', '', 'False', 20, 1000],
    ['Name the largest ocean.', 'Type Answer', '', '', '', '', 'Pacific', 30, 1000],
    ['What is your favorite color?', 'Poll', 'Red', 'Blue', 'Green', 'Yellow', '', 20, 0],
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)

  // Set column widths
  ws['!cols'] = [
    { wch: 35 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 8 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Questions')
  XLSX.writeFile(wb, '9hoot-import-template.xlsx')
}

function parseSpreadsheet(file: File): Promise<ParsedQuestion[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

        const questions: ParsedQuestion[] = []
        for (const row of rows) {
          // Flexible header matching
          const questionText = String(
            row['Question'] || row['question'] || row['Question Text'] || row['question_text'] || ''
          ).trim()
          if (!questionText) continue

          const rawType = String(row['Type'] || row['type'] || row['Question Type'] || 'Quiz')
          const type = parseType(rawType)

          const optA = String(row['Option A'] || row['option_a'] || row['A'] || '').trim()
          const optB = String(row['Option B'] || row['option_b'] || row['B'] || '').trim()
          const optC = String(row['Option C'] || row['option_c'] || row['C'] || '').trim()
          const optD = String(row['Option D'] || row['option_d'] || row['D'] || '').trim()
          const options = [optA, optB, optC, optD].filter(Boolean)

          const correctAnswer = String(
            row['Correct Answer'] || row['correct_answer'] || row['Answer'] || row['correct'] || ''
          ).trim()

          const timeLimit = Number(row['Time Limit (sec)'] || row['time_limit'] || row['Time'] || 30) || 30
          const points = Number(row['Points'] || row['points'] || 1000) || 1000

          questions.push({ questionText, type, options, correctAnswer, timeLimit, points })
        }

        resolve(questions)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export function SpreadsheetImport({ onImport, onClose }: Props) {
  const [parsed, setParsed] = useState<ParsedQuestion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setFileName(file.name)

    try {
      const questions = await parseSpreadsheet(file)
      if (questions.length === 0) {
        setError('No valid questions found. Check that column headers match the template.')
        return
      }
      setParsed(questions)
    } catch {
      setError('Failed to parse file. Please use .xlsx or .csv format.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-mid-gray">
          <h2 className="text-lg font-bold text-dark-text">Import Questions</h2>
          <button onClick={onClose} className="text-gray-text hover:text-dark-text text-lg">✕</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {!parsed ? (
            /* Upload step */
            <div className="space-y-4">
              <p className="text-sm text-gray-text">
                Upload an Excel (.xlsx) or CSV file with your questions. Each row becomes one question.
              </p>

              {/* Template download */}
              <button
                onClick={downloadTemplate}
                className="text-sm text-blue-cta hover:underline"
              >
                Download template file
              </button>

              {/* Expected format */}
              <div className="bg-light-gray rounded-lg p-3">
                <p className="text-xs font-bold text-dark-text mb-2">Expected columns:</p>
                <div className="text-xs text-gray-text space-y-0.5">
                  <p><span className="font-bold text-dark-text">Question</span> - The question text (required)</p>
                  <p><span className="font-bold text-dark-text">Type</span> - Quiz, True/False, Type Answer, Poll, or Slider</p>
                  <p><span className="font-bold text-dark-text">Option A-D</span> - Answer options (for Quiz/Poll)</p>
                  <p><span className="font-bold text-dark-text">Correct Answer</span> - A/B/C/D or True/False or text</p>
                  <p><span className="font-bold text-dark-text">Time Limit (sec)</span> - Default: 30</p>
                  <p><span className="font-bold text-dark-text">Points</span> - 0, 1000, or 2000. Default: 1000</p>
                </div>
              </div>

              {/* File upload */}
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFile}
                  className="hidden"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-24 border-2 border-dashed border-mid-gray rounded-lg flex flex-col items-center justify-center gap-1 hover:border-blue-cta hover:bg-blue-cta/5 transition-colors cursor-pointer"
                >
                  <span className="text-2xl">📄</span>
                  <span className="text-sm font-bold text-dark-text">
                    {fileName || 'Click to upload .xlsx or .csv'}
                  </span>
                </button>
              </div>

              {error && (
                <p className="text-sm text-answer-red">{error}</p>
              )}
            </div>
          ) : (
            /* Preview step */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-dark-text font-bold">{parsed.length} questions found</p>
                <button
                  onClick={() => { setParsed(null); setFileName(''); setError(null) }}
                  className="text-xs text-blue-cta hover:underline"
                >
                  Upload different file
                </button>
              </div>

              {/* Preview table */}
              <div className="border border-mid-gray rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-light-gray border-b border-mid-gray">
                      <th className="px-3 py-2 text-left font-bold text-gray-text w-8">#</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-text">Question</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-text w-20">Type</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-text w-20">Answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((q, i) => (
                      <tr key={i} className="border-b border-mid-gray last:border-b-0">
                        <td className="px-3 py-2 text-gray-text">{i + 1}</td>
                        <td className="px-3 py-2 text-dark-text truncate max-w-[250px]">{q.questionText}</td>
                        <td className="px-3 py-2 text-gray-text capitalize">{q.type.replace('_', ' ')}</td>
                        <td className="px-3 py-2 text-gray-text truncate max-w-[80px]">{q.correctAnswer || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {parsed && (
          <div className="p-5 border-t border-mid-gray flex justify-end gap-3">
            <button
              onClick={onClose}
              className="h-9 px-4 text-sm text-gray-text border border-mid-gray rounded-lg hover:bg-light-gray transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onImport(parsed)}
              className="h-9 px-6 text-sm font-bold text-white bg-blue-cta rounded-lg hover:bg-blue-accent transition-colors"
            >
              Import {parsed.length} questions
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

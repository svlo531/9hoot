'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Quiz } from '@/lib/types'

export function QuizList({ quizzes }: { quizzes: Quiz[] }) {
  const router = useRouter()
  const supabase = createClient()

  async function handleDelete(id: string) {
    if (!confirm('Delete this quiz?')) return
    await supabase.from('quizzes').delete().eq('id', id)
    router.refresh()
  }

  if (quizzes.length === 0) {
    return (
      <div className="border-2 border-dashed border-mid-gray rounded-lg p-12 text-center">
        <div className="text-4xl mb-3">🎯</div>
        <h2 className="text-lg font-bold text-dark-text mb-2">No 9Hoots yet</h2>
        <p className="text-gray-text text-sm mb-4">Create your first interactive quiz</p>
        <Link
          href="/library/new"
          className="inline-flex h-10 px-6 bg-blue-cta hover:bg-blue-accent text-white text-sm font-bold rounded items-center transition-colors"
        >
          Create 9Hoot
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {quizzes.map((quiz) => (
        <div
          key={quiz.id}
          className="bg-white rounded-lg border border-mid-gray overflow-hidden hover:shadow-md transition-shadow"
        >
          {/* Cover image */}
          <div className="h-32 bg-gradient-to-br from-purple-primary to-blue-cta flex items-center justify-center">
            {quiz.cover_image_url ? (
              <img src={quiz.cover_image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl">🎮</span>
            )}
          </div>

          <div className="p-4">
            <h3 className="font-bold text-dark-text text-sm truncate">{quiz.title}</h3>
            <p className="text-gray-text text-xs mt-1">
              {quiz.question_count} questions &middot; {quiz.play_count} plays
            </p>

            <div className="flex gap-2 mt-3">
              <Link
                href={`/library/${quiz.id}`}
                className="flex-1 h-8 bg-blue-cta hover:bg-blue-accent text-white text-xs font-bold rounded flex items-center justify-center transition-colors"
              >
                Edit
              </Link>
              <Link
                href={`/library/${quiz.id}/host`}
                className="flex-1 h-8 bg-correct-green hover:bg-green-700 text-white text-xs font-bold rounded flex items-center justify-center transition-colors"
              >
                Host
              </Link>
              <button
                onClick={() => handleDelete(quiz.id)}
                className="h-8 w-8 text-gray-text hover:text-answer-red text-xs rounded border border-mid-gray flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Quiz, Folder } from '@/lib/types'

export function QuizList({ quizzes, folders = [] }: { quizzes: Quiz[]; folders?: Folder[] }) {
  const router = useRouter()
  const supabase = createClient()
  const [moveMenuId, setMoveMenuId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('Delete this quiz and all its data?')) return
    const { error } = await supabase.from('quizzes').delete().eq('id', id)
    if (error) {
      alert('Failed to delete: ' + error.message)
      return
    }
    router.refresh()
  }

  async function handleMove(quizId: string, folderId: string | null) {
    await supabase.from('quizzes').update({ folder_id: folderId }).eq('id', quizId)
    setMoveMenuId(null)
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
      {quizzes.map((quiz) => {
        const showMoveMenu = moveMenuId === quiz.id
        const currentFolder = folders.find((f) => f.id === quiz.folder_id)

        return (
          <div
            key={quiz.id}
            className="bg-white rounded-lg border border-mid-gray overflow-hidden hover:shadow-md transition-shadow"
          >
            {/* Cover image */}
            <div className="h-32 bg-gradient-to-br from-purple-primary to-blue-cta flex items-center justify-center relative">
              {quiz.cover_image_url ? (
                <img src={quiz.cover_image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl">🎮</span>
              )}
              {currentFolder && (
                <span className="absolute top-2 left-2 text-[10px] font-bold bg-black/50 text-white px-1.5 py-0.5 rounded">
                  📁 {currentFolder.name}
                </span>
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
                <div className="relative">
                  <button
                    onClick={() => setMoveMenuId(showMoveMenu ? null : quiz.id)}
                    className="h-8 w-8 text-gray-text hover:text-blue-cta text-xs rounded border border-mid-gray flex items-center justify-center transition-colors"
                    title="Move to folder"
                  >
                    📁
                  </button>
                  {showMoveMenu && (
                    <div
                      className="absolute right-0 top-9 w-44 bg-white border border-mid-gray rounded-lg shadow-lg z-20 py-1"
                      onMouseLeave={() => setMoveMenuId(null)}
                    >
                      <div className="px-3 py-1.5 text-[10px] text-gray-text font-bold uppercase tracking-wide">
                        Move to
                      </div>
                      <button
                        onClick={() => handleMove(quiz.id, null)}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-light-gray transition-colors ${
                          !quiz.folder_id ? 'text-blue-cta font-bold' : 'text-dark-text'
                        }`}
                      >
                        No folder
                      </button>
                      {folders
                        .filter((f) => !f.parent_folder_id)
                        .map((folder) => (
                          <div key={folder.id}>
                            <button
                              onClick={() => handleMove(quiz.id, folder.id)}
                              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-light-gray transition-colors ${
                                quiz.folder_id === folder.id ? 'text-blue-cta font-bold' : 'text-dark-text'
                              }`}
                            >
                              📁 {folder.name}
                            </button>
                            {folders
                              .filter((c) => c.parent_folder_id === folder.id)
                              .map((child) => (
                                <button
                                  key={child.id}
                                  onClick={() => handleMove(quiz.id, child.id)}
                                  className={`w-full text-left pl-7 pr-3 py-1.5 text-sm hover:bg-light-gray transition-colors ${
                                    quiz.folder_id === child.id ? 'text-blue-cta font-bold' : 'text-dark-text'
                                  }`}
                                >
                                  📁 {child.name}
                                </button>
                              ))}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(quiz.id)}
                  className="h-8 w-8 text-gray-text hover:text-answer-red text-xs rounded border border-mid-gray flex items-center justify-center transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

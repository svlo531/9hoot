'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Gamepad2, Folder as FolderIcon, Star, Copy, X, Target } from 'lucide-react'
import type { Quiz, Folder } from '@/lib/types'

interface QuizListProps {
  quizzes: Quiz[]
  folders?: Folder[]
  initialSearch?: string
}

export function QuizList({ quizzes, folders = [], initialSearch = '' }: QuizListProps) {
  const router = useRouter()
  const supabase = createClient()
  const [moveMenuId, setMoveMenuId] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState<string | null>(null)
  const [search, setSearch] = useState(initialSearch)

  async function handleToggleFavorite(quizId: string, current: boolean) {
    await supabase.from('quizzes').update({ is_favorite: !current }).eq('id', quizId)
    router.refresh()
  }

  function handleSearch(value: string) {
    setSearch(value)
    const url = new URL(window.location.href)
    if (value.trim()) {
      url.searchParams.set('q', value.trim())
    } else {
      url.searchParams.delete('q')
    }
    router.push(url.pathname + url.search)
  }

  async function handleDuplicate(quizId: string) {
    setDuplicating(quizId)
    const res = await fetch(`/api/quizzes/${quizId}/duplicate`, { method: 'POST' })
    setDuplicating(null)
    if (res.ok) {
      const { id } = await res.json()
      router.push(`/library/${id}`)
    }
  }

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

  const searchBar = (
    <div className="mb-4">
      <input
        type="text"
        placeholder="Search quizzes..."
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="w-full h-9 px-3 text-sm border border-mid-gray rounded-lg bg-white text-dark-text placeholder:text-gray-text focus:outline-none focus:border-blue-cta transition-colors"
      />
    </div>
  )

  if (quizzes.length === 0) {
    return (
      <>
        {searchBar}
        <div className="border-2 border-dashed border-mid-gray rounded-lg p-12 text-center">
          <div className="text-4xl mb-3"><Target size={36} className="mx-auto text-gray-text" /></div>
          <h2 className="text-lg font-bold text-dark-text mb-2">
            {search ? 'No matches' : 'No 9Hoots yet'}
          </h2>
          <p className="text-gray-text text-sm mb-4">
            {search ? 'Try a different search term' : 'Create your first interactive quiz'}
          </p>
          {!search && (
            <Link
              href="/library/new"
              className="inline-flex h-10 px-6 bg-blue-cta hover:bg-blue-accent text-white text-sm font-bold rounded items-center transition-colors"
            >
              Create 9Hoot
            </Link>
          )}
        </div>
      </>
    )
  }

  return (
    <>
    {searchBar}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {quizzes.map((quiz) => {
        const showMoveMenu = moveMenuId === quiz.id
        const currentFolder = folders.find((f) => f.id === quiz.folder_id)

        return (
          <div
            key={quiz.id}
            className="bg-white rounded-lg border border-mid-gray hover:shadow-md transition-shadow"
          >
            {/* Cover image */}
            <div className="h-32 bg-gradient-to-br from-purple-primary to-blue-cta flex items-center justify-center relative rounded-t-lg overflow-hidden">
              {quiz.cover_image_url ? (
                <img src={quiz.cover_image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <Gamepad2 size={32} className="text-white/80" />
              )}
              {currentFolder && (
                <span className="absolute top-2 left-2 text-[10px] font-bold bg-black/50 text-white px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">
                  <FolderIcon size={10} /> {currentFolder.name}
                </span>
              )}
              <button
                onClick={() => handleToggleFavorite(quiz.id, quiz.is_favorite)}
                className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  quiz.is_favorite
                    ? 'bg-yellow-accent text-white'
                    : 'bg-black/30 text-white/70 hover:text-white hover:bg-black/50'
                }`}
                title={quiz.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                {quiz.is_favorite ? <Star size={14} fill="currentColor" /> : <Star size={14} />}
              </button>
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
                  onClick={() => handleDuplicate(quiz.id)}
                  disabled={duplicating === quiz.id}
                  className="h-8 w-8 text-gray-text hover:text-blue-cta text-xs rounded border border-mid-gray flex items-center justify-center transition-colors disabled:opacity-50"
                  title="Duplicate quiz"
                >
                  {duplicating === quiz.id ? '...' : <Copy size={14} />}
                </button>
                <div className="relative">
                  <button
                    onClick={() => setMoveMenuId(showMoveMenu ? null : quiz.id)}
                    className="h-8 w-8 text-gray-text hover:text-blue-cta text-xs rounded border border-mid-gray flex items-center justify-center transition-colors"
                    title="Move to folder"
                  >
                    <FolderIcon size={14} />
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
                              <span className="inline-flex items-center gap-1"><FolderIcon size={12} /> {folder.name}</span>
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
                                  <span className="inline-flex items-center gap-1"><FolderIcon size={12} /> {child.name}</span>
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
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
    </>
  )
}

'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function NewQuizPage() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('quizzes')
      .insert({
        owner_id: user.id,
        title: title || 'Untitled 9Hoot',
        description: description || null,
      })
      .select()
      .single()

    if (error) {
      alert('Failed to create quiz: ' + error.message)
      setLoading(false)
      return
    }

    router.push(`/library/${data.id}`)
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-dark-text mb-6">Create new 9Hoot</h1>

      <form onSubmit={handleCreate} className="bg-white rounded-lg border border-mid-gray p-6 space-y-4">
        <div>
          <label className="block text-sm font-bold text-dark-text mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a title..."
            maxLength={76}
            className="w-full h-12 px-3 rounded border border-border-gray text-dark-text text-sm focus:outline-none focus:border-blue-cta focus:ring-1 focus:ring-blue-cta"
            autoFocus
          />
          <p className="text-xs text-gray-text mt-1">{title.length}/76</p>
        </div>

        <div>
          <label className="block text-sm font-bold text-dark-text mb-1">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this 9Hoot about?"
            maxLength={500}
            rows={3}
            className="w-full px-3 py-2 rounded border border-border-gray text-dark-text text-sm focus:outline-none focus:border-blue-cta focus:ring-1 focus:ring-blue-cta resize-none"
          />
          <p className="text-xs text-gray-text mt-1">{description.length}/500</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 h-10 border border-mid-gray text-dark-text text-sm font-bold rounded hover:bg-light-gray transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 h-10 bg-blue-cta hover:bg-blue-accent text-white text-sm font-bold rounded transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}

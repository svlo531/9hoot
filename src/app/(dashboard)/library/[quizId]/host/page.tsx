'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function HostLaunchPage() {
  const { quizId } = useParams<{ quizId: string }>()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function createSession() {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create session')
        return
      }

      router.replace(`/host/${data.session.id}`)
    }

    createSession()
  }, [quizId, router])

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-answer-red font-bold">{error}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 h-10 px-6 bg-blue-cta text-white text-sm font-bold rounded hover:bg-blue-accent transition-colors"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="text-4xl mb-3 animate-pulse">🎮</div>
        <p className="text-dark-text font-bold">Creating game session...</p>
      </div>
    </div>
  )
}

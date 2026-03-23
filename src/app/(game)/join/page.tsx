'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function JoinPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const trimmedPin = pin.trim()
    if (trimmedPin.length !== 6 || !/^\d{6}$/.test(trimmedPin)) {
      setError('Enter a 6-digit Game PIN')
      setLoading(false)
      return
    }

    // Check if session exists
    const { data: session } = await supabase
      .from('sessions')
      .select('id, pin, status')
      .eq('pin', trimmedPin)
      .neq('status', 'completed')
      .single()

    if (!session) {
      setError('Game not found. Check your PIN.')
      setLoading(false)
      return
    }

    if (session.status !== 'lobby') {
      setError('This game has already started.')
      setLoading(false)
      return
    }

    router.push(`/play/${trimmedPin}`)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #46178F 0%, #2a0e5a 100%)' }}>
      {/* Logo */}
      <h1 className="text-6xl font-bold text-white tracking-tight mb-8">
        9Hoot<span className="text-yellow-accent">!</span>
      </h1>

      {/* Join card */}
      <form onSubmit={handleJoin} className="w-72">
        <div className="bg-white rounded-lg overflow-hidden">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="Game PIN"
            className="w-full h-12 px-4 text-center text-dark-text font-bold text-base border-b-2 border-border-gray focus:outline-none focus:border-blue-cta placeholder:font-normal placeholder:text-border-gray"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-dark-text text-white font-bold text-base hover:bg-black transition-colors disabled:opacity-50"
          >
            {loading ? 'Finding game...' : 'Enter'}
          </button>
        </div>

        {error && (
          <p className="text-white bg-answer-red/80 text-sm text-center py-2 px-3 rounded mt-3">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}

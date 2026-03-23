'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/library')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #46178F 0%, #1a0a3e 100%)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logos/AI-Agency-Logo-notext.png" alt="9Hoot!" className="w-20 h-20 mx-auto mb-3" />
          <h1 className="text-5xl font-bold text-white tracking-tight">
            9Hoot<span className="text-yellow-accent">!</span>
          </h1>
          <p className="text-white/60 mt-2 text-sm">Host & Creator Login</p>
        </div>

        {/* Login card */}
        <form onSubmit={handleLogin} className="bg-white rounded-lg p-6 shadow-xl">
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-bold text-dark-text mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full h-12 px-3 rounded border border-border-gray text-dark-text text-sm focus:outline-none focus:border-blue-cta focus:ring-1 focus:ring-blue-cta"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-bold text-dark-text mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full h-12 px-3 rounded border border-border-gray text-dark-text text-sm focus:outline-none focus:border-blue-cta focus:ring-1 focus:ring-blue-cta"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-answer-red text-sm p-3 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-blue-cta hover:bg-blue-accent text-white font-bold text-sm rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Log in'}
            </button>
          </div>

          <p className="text-center text-gray-text text-xs mt-4">
            Invite-only. Contact your admin for access.
          </p>
        </form>
      </div>
    </div>
  )
}

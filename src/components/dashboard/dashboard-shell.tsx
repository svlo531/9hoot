'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import type { User } from '@supabase/supabase-js'

const NAV_ITEMS = [
  { href: '/library', label: 'Library', icon: '📚' },
  { href: '/reports', label: 'Reports', icon: '📊' },
  { href: '/groups', label: 'Groups', icon: '👥' },
]

export function DashboardShell({
  user,
  profile,
  children,
}: {
  user: User
  profile: Profile | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-light-gray">
      {/* Top header bar — Kahoot blue */}
      <header className="h-14 bg-blue-header flex items-center px-4 justify-between sticky top-0 z-50">
        <Link href="/library" className="flex items-center gap-2 text-white font-bold text-xl tracking-tight">
          <img src="/logos/AI-Agency-Logo-favicon.png" alt="9Hoot!" className="w-8 h-8 rounded" />
          9Hoot<span className="text-yellow-accent">!</span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/library/new"
            className="h-10 px-5 bg-blue-cta hover:bg-blue-accent text-white text-sm font-bold rounded-full flex items-center transition-colors"
          >
            Create
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-primary flex items-center justify-center text-white text-sm font-bold">
              {(profile?.display_name || user.email || '?')[0].toUpperCase()}
            </div>
            <button
              onClick={handleLogout}
              className="text-white/80 hover:text-white text-sm"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Left sidebar */}
        <nav className="w-40 bg-white min-h-[calc(100vh-56px)] border-r border-mid-gray flex-shrink-0 sticky top-14 self-start">
          <div className="py-2">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 h-10 px-3 mx-1 rounded text-sm transition-colors ${
                    isActive
                      ? 'bg-purple-primary text-white font-bold'
                      : 'text-dark-text hover:bg-light-gray'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { QAPlayerPanel } from './qa-player-panel'

export function QAPlayerWrapper() {
  const [ids, setIds] = useState<{ sessionId: string; participantId: string } | null>(null)

  useEffect(() => {
    // Check sessionStorage for Q&A context (set by player-game on join)
    function check() {
      try {
        const sessionId = sessionStorage.getItem('9hoot_session')
        const participantId = sessionStorage.getItem('9hoot_participant')
        if (sessionId && participantId) {
          setIds({ sessionId, participantId })
        }
      } catch {}
    }

    check()
    // Re-check periodically in case player joins after initial load
    const interval = setInterval(check, 1000)
    return () => clearInterval(interval)
  }, [])

  if (!ids) return null
  return <QAPlayerPanel sessionId={ids.sessionId} participantId={ids.participantId} />
}

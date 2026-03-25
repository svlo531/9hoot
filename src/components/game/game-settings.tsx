'use client'

import { useState } from 'react'
import type { SessionSettings } from '@/lib/types'
import type { ThemeConfig } from '@/lib/theme-utils'
import { lobbyGradient } from '@/lib/theme-utils'

interface Props {
  sessionId: string
  quizTitle: string
  theme: ThemeConfig
  onReady: (settings: SessionSettings) => void
}

export function GameSettings({ sessionId, quizTitle, theme, onReady }: Props) {
  const [nicknameGenerator, setNicknameGenerator] = useState(false)
  const [playerIdentifier, setPlayerIdentifier] = useState(false)
  const [teamMode, setTeamMode] = useState(false)
  const [teamCount, setTeamCount] = useState(4)
  const [saving, setSaving] = useState(false)

  async function handleOpenLobby() {
    setSaving(true)
    const settings: SessionSettings = {
      nicknameGenerator,
      playerIdentifier,
      teamMode,
      teamCount: teamMode ? teamCount : undefined,
    }

    await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    })

    onReady(settings)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: lobbyGradient(theme) }}>
      <h1 className="text-3xl font-bold text-white mb-1">
        9Hoot<span className="text-yellow-accent">!</span>
      </h1>
      <p className="text-white/60 text-sm mb-8">{quizTitle}</p>

      <div className="w-full max-w-md px-6">
        <h2 className="text-white font-bold text-lg mb-4">Game Settings</h2>

        <div className="space-y-3">
          {/* Nickname Generator */}
          <SettingToggle
            label="Nickname Generator"
            description="Auto-assign fun random names to players"
            enabled={nicknameGenerator}
            onToggle={() => setNicknameGenerator(!nicknameGenerator)}
          />

          {/* Player Identifier */}
          <SettingToggle
            label="Player Identifier"
            description="Require email before joining"
            enabled={playerIdentifier}
            onToggle={() => setPlayerIdentifier(!playerIdentifier)}
          />

          {/* Team Mode */}
          <SettingToggle
            label="Team Mode"
            description="Split players into random teams"
            enabled={teamMode}
            onToggle={() => setTeamMode(!teamMode)}
          />

          {/* Team count slider - only when team mode is on */}
          {teamMode && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-5 py-4 ml-4 border-l-2 border-white/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white text-sm font-bold">Number of Teams</span>
                <span className="text-white font-bold text-lg w-8 text-center">{teamCount}</span>
              </div>
              <input
                type="range"
                min={2}
                max={8}
                value={teamCount}
                onChange={(e) => setTeamCount(Number(e.target.value))}
                className="w-full accent-yellow-accent"
              />
              <div className="flex justify-between text-white/40 text-xs mt-1">
                <span>2</span>
                <span>8</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-center mt-8">
          <button
            onClick={handleOpenLobby}
            disabled={saving}
            className="h-12 px-10 bg-correct-green hover:bg-green-600 text-white font-bold text-lg rounded-lg shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            {saving ? 'Opening...' : 'Open Lobby'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingToggle({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string
  description: string
  enabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between bg-white/10 backdrop-blur-sm rounded-xl px-5 py-4 hover:bg-white/15 transition-all text-left"
    >
      <div>
        <p className="text-white font-bold text-sm">{label}</p>
        <p className="text-white/50 text-xs mt-0.5">{description}</p>
      </div>
      <div
        className={`w-11 h-6 rounded-full relative transition-colors ${
          enabled ? 'bg-correct-green' : 'bg-white/20'
        }`}
      >
        <div
          className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-[22px]' : 'translate-x-1'
          }`}
        />
      </div>
    </button>
  )
}

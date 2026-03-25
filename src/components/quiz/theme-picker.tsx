'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ThemeRecord, ThemeConfig } from '@/lib/theme-utils'
import { DEFAULT_THEME, gameGradient } from '@/lib/theme-utils'

interface Props {
  quizId: string
  selectedThemeId: string | null
  onSelect: (themeId: string | null) => void
}

export function ThemePicker({ quizId, selectedThemeId, onSelect }: Props) {
  const supabase = createClient()
  const [themes, setThemes] = useState<ThemeRecord[]>([])
  const [showCustom, setShowCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customConfig, setCustomConfig] = useState<ThemeConfig>({ ...DEFAULT_THEME })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadThemes()
  }, [])

  async function loadThemes() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('themes')
      .select('*')
      .or(`is_preset.eq.true,owner_id.eq.${user?.id}`)
      .order('is_preset', { ascending: false })
      .order('name', { ascending: true })

    if (data) setThemes(data as ThemeRecord[])
  }

  async function saveCustomTheme() {
    if (!customName.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('themes')
      .insert({
        owner_id: user!.id,
        name: customName.trim(),
        is_preset: false,
        config: customConfig,
      })
      .select('id')
      .single()

    setSaving(false)
    if (data && !error) {
      onSelect(data.id)
      setShowCustom(false)
      setCustomName('')
      loadThemes()
    }
  }

  const presets = themes.filter((t) => t.is_preset)
  const custom = themes.filter((t) => !t.is_preset)

  return (
    <div>
      {/* Theme grid */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        {/* No theme option */}
        <button
          onClick={() => onSelect(null)}
          className={`h-10 rounded border-2 transition-all flex items-center justify-center text-[10px] font-bold ${
            !selectedThemeId ? 'border-blue-cta ring-1 ring-blue-cta' : 'border-mid-gray'
          }`}
          title="Default"
        >
          <div
            className="w-full h-full rounded flex items-center justify-center text-white"
            style={{ background: gameGradient(DEFAULT_THEME) }}
          >
            Default
          </div>
        </button>

        {/* Preset themes */}
        {presets.map((theme) => (
          <button
            key={theme.id}
            onClick={() => onSelect(theme.id)}
            className={`h-10 rounded border-2 transition-all overflow-hidden ${
              selectedThemeId === theme.id ? 'border-blue-cta ring-1 ring-blue-cta' : 'border-mid-gray'
            }`}
            title={theme.name}
          >
            <div
              className="w-full h-full flex items-center justify-center text-white text-[9px] font-bold"
              style={{ background: gameGradient(theme.config) }}
            >
              {theme.name.split(' ').pop()}
            </div>
          </button>
        ))}

        {/* Custom themes */}
        {custom.map((theme) => (
          <button
            key={theme.id}
            onClick={() => onSelect(theme.id)}
            className={`h-10 rounded border-2 transition-all overflow-hidden ${
              selectedThemeId === theme.id ? 'border-blue-cta ring-1 ring-blue-cta' : 'border-mid-gray'
            }`}
            title={theme.name}
          >
            <div
              className="w-full h-full flex items-center justify-center text-white text-[9px] font-bold"
              style={{ background: gameGradient(theme.config) }}
            >
              {theme.name}
            </div>
          </button>
        ))}
      </div>

      {/* Create custom button */}
      {!showCustom ? (
        <button
          onClick={() => setShowCustom(true)}
          className="w-full text-xs text-blue-cta hover:underline mt-1"
        >
          + Custom theme
        </button>
      ) : (
        <div className="mt-2 p-3 bg-light-gray rounded-lg space-y-2">
          <input
            type="text"
            placeholder="Theme name"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="w-full h-7 px-2 text-xs border border-mid-gray rounded bg-white text-dark-text focus:outline-none focus:border-blue-cta"
          />

          {/* Preview */}
          <div
            className="h-12 rounded flex items-center justify-center text-white text-xs font-bold"
            style={{ background: gameGradient(customConfig) }}
          >
            Preview
          </div>

          {/* Color pickers */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] text-gray-text font-bold">Primary</span>
              <input
                type="color"
                value={customConfig.gradientFrom}
                onChange={(e) => setCustomConfig({
                  ...customConfig,
                  primaryColor: e.target.value,
                  gradientFrom: e.target.value,
                })}
                className="w-full h-7 rounded border border-mid-gray cursor-pointer"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-gray-text font-bold">Accent</span>
              <input
                type="color"
                value={customConfig.accentColor}
                onChange={(e) => setCustomConfig({ ...customConfig, accentColor: e.target.value })}
                className="w-full h-7 rounded border border-mid-gray cursor-pointer"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-gray-text font-bold">Background</span>
              <input
                type="color"
                value={customConfig.gradientTo}
                onChange={(e) => setCustomConfig({
                  ...customConfig,
                  backgroundColor: e.target.value,
                  gradientTo: e.target.value,
                })}
                className="w-full h-7 rounded border border-mid-gray cursor-pointer"
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={saveCustomTheme}
              disabled={saving || !customName.trim()}
              className="flex-1 h-7 bg-blue-cta text-white text-xs font-bold rounded hover:bg-blue-accent transition-colors disabled:opacity-50"
            >
              {saving ? '...' : 'Save'}
            </button>
            <button
              onClick={() => setShowCustom(false)}
              className="h-7 px-3 text-xs text-gray-text border border-mid-gray rounded hover:bg-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

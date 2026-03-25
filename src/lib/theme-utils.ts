export interface ThemeConfig {
  primaryColor: string
  accentColor: string
  backgroundColor: string
  gradientFrom: string
  gradientTo: string
  logoUrl?: string
  backgroundImageUrl?: string
}

export interface ThemeRecord {
  id: string
  owner_id: string | null
  name: string
  is_preset: boolean
  config: ThemeConfig
  created_at: string
}

export const DEFAULT_THEME: ThemeConfig = {
  primaryColor: '#46178F',
  accentColor: '#1368CE',
  backgroundColor: '#1a0a3e',
  gradientFrom: '#46178F',
  gradientTo: '#1a0a3e',
}

export function gameGradient(theme: ThemeConfig): string {
  return `linear-gradient(135deg, ${theme.gradientFrom} 0%, ${theme.gradientTo} 100%)`
}

export function lobbyGradient(theme: ThemeConfig): string {
  return `linear-gradient(135deg, ${theme.gradientTo} 0%, ${theme.backgroundColor} 50%, ${theme.gradientTo} 100%)`
}

export function themeStyle(theme: ThemeConfig): React.CSSProperties {
  return {
    background: gameGradient(theme),
    '--theme-primary': theme.primaryColor,
    '--theme-accent': theme.accentColor,
    '--theme-bg': theme.backgroundColor,
  } as React.CSSProperties
}

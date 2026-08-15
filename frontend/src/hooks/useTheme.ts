import { useState, useEffect } from 'react'
import { LS_KEYS } from '@/constants'

type Theme = 'light' | 'dark'

const getInitialTheme = (): Theme => {
  const stored = localStorage.getItem(LS_KEYS.THEME) as Theme | null
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const applyTheme = (theme: Theme) => {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(LS_KEYS.THEME, theme)
  }, [theme])

  const setTheme = (t: Theme) => {
    applyTheme(t)
    setThemeState(t)
  }

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' }
}

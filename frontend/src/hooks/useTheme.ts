import { useState, useEffect } from 'react'
import { LS_KEYS } from '@/constants'

type Theme = 'light' | 'dark'

const getInitialTheme = (): Theme => {
  const stored = localStorage.getItem(LS_KEYS.THEME) as Theme | null
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const applyTheme = (theme: Theme, animate: boolean) => {
  const root = document.documentElement
  if (animate) root.classList.add('theme-transition')
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  if (animate) {
    window.setTimeout(() => root.classList.remove('theme-transition'), 400)
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme, false)
    localStorage.setItem(LS_KEYS.THEME, theme)
  }, [theme])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    applyTheme(t, true)
  }

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' }
}

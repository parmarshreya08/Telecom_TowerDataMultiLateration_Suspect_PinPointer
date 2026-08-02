import { createContext, useContext, type ReactNode } from 'react'
import { useTheme } from '@/hooks/useTheme'

interface ThemeContextValue {
  theme: 'light' | 'dark'
  isDark: boolean
  setTheme: (t: 'light' | 'dark') => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemeContext must be used inside <ThemeProvider>')
  return ctx
}

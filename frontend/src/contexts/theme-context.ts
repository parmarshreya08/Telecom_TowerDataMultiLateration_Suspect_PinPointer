import { createContext } from 'react'

export interface ThemeContextValue {
  theme: 'light' | 'dark'
  isDark: boolean
  setTheme: (t: 'light' | 'dark') => void
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

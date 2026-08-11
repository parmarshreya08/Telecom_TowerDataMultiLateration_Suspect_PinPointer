import { useContext } from 'react'
import { ThemeContext, type ThemeContextValue } from '@/contexts/theme-context'

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemeContext must be used inside <ThemeProvider>')
  return ctx
}

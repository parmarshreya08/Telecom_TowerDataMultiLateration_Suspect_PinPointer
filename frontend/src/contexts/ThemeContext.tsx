import { type ReactNode } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { ThemeContext } from '@/contexts/theme-context'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

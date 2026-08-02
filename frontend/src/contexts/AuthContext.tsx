import { createContext, useContext, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { Officer, LoginCredentials, RegisterData } from '@/types'

interface AuthContextValue {
  officer: Officer | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (credentials: LoginCredentials) => Promise<Officer>
  register: (data: RegisterData) => Promise<void>
  logout: () => void
  loginWithGoogle: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside <AuthProvider>')
  return ctx
}

// ============================================================
// E-Rakshak — Auth Hook
// TODO: Replace mock with actual API calls once backend auth
//       endpoints are implemented.
// ============================================================

import { useState, useCallback } from 'react'
import { LS_KEYS } from '@/constants'
import type { Officer, LoginCredentials, RegisterData } from '@/types'
import { MOCK_OFFICER } from '@/mock/auth'

interface AuthState {
  officer: Officer | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(() => {
    const token   = localStorage.getItem(LS_KEYS.AUTH_TOKEN)
    const raw     = localStorage.getItem(LS_KEYS.OFFICER)
    const officer = raw ? (JSON.parse(raw) as Officer) : null
    return {
      officer,
      token,
      isAuthenticated: !!token && !!officer,
      isLoading: false,
      error: null,
    }
  })

  const login = useCallback(async (credentials: LoginCredentials) => {
    setState((s) => ({ ...s, isLoading: true, error: null }))
    try {
      // TODO: Replace with authApi.login(credentials.email, credentials.password)
      await new Promise((r) => setTimeout(r, 1000)) // simulated network delay
      const officer = MOCK_OFFICER
      const token   = 'mock-jwt-token-erakshak'

      localStorage.setItem(LS_KEYS.AUTH_TOKEN, token)
      localStorage.setItem(LS_KEYS.OFFICER, JSON.stringify(officer))

      setState({ officer, token, isAuthenticated: true, isLoading: false, error: null })
      void credentials
      return officer
    } catch {
      setState((s) => ({ ...s, isLoading: false, error: 'Invalid credentials' }))
      throw new Error('Invalid credentials')
    }
  }, [])

  const register = useCallback(async (data: RegisterData) => {
    setState((s) => ({ ...s, isLoading: true, error: null }))
    try {
      // TODO: Replace with authApi.register(data)
      await new Promise((r) => setTimeout(r, 1200))
      void data
      setState((s) => ({ ...s, isLoading: false }))
    } catch {
      setState((s) => ({ ...s, isLoading: false, error: 'Registration failed' }))
      throw new Error('Registration failed')
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(LS_KEYS.AUTH_TOKEN)
    localStorage.removeItem(LS_KEYS.OFFICER)
    setState({ officer: null, token: null, isAuthenticated: false, isLoading: false, error: null })
  }, [])

  const loginWithGoogle = useCallback(() => {
    // TODO: authApi.googleOAuth()
    console.warn('[Auth] Google OAuth not yet implemented')
  }, [])

  return {
    ...state,
    login,
    register,
    logout,
    loginWithGoogle,
  }
}

// ============================================================
// E-Rakshak — Authentication Service
// Token persistence + auth API client
// ============================================================

import { apiClient } from './api'
import type { AuthResponse, Officer } from '@/types'

const TOKEN_KEY = 'erakshak_access_token'
const OFFICER_KEY = 'erakshak_officer'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getStoredOfficer(): Officer | null {
  const raw = localStorage.getItem(OFFICER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Officer
  } catch {
    return null
  }
}

export function setStoredOfficer(officer: Officer): void {
  localStorage.setItem(OFFICER_KEY, JSON.stringify(officer))
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(OFFICER_KEY)
}

/**
 * Decode a JWT payload without verifying the signature (client-side only).
 * Used purely to detect expiry for UX — the backend remains the source of truth.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

/** True when the stored token is missing or its `exp` is in the past. */
export function isTokenExpired(token: string | null = getToken()): boolean {
  if (!token) return true
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp
  // If we can't read an expiry, assume valid and let the API decide.
  if (typeof exp !== 'number') return false
  return Date.now() >= exp * 1000
}

/**
 * Whether a usable session exists. Expired tokens are cleared so a stale
 * session never makes the UI look logged-in (or logged-out) incorrectly.
 */
export function hasValidSession(): boolean {
  if (isTokenExpired()) {
    clearAuth()
    return false
  }
  return true
}

export const authApi = {
  register: (data: { officer_name: string; email: string; password: string }) =>
    apiClient.post<AuthResponse>('/api/auth/register', data).then((r) => r.data),

  login: (data: { email: string; password: string }) =>
    apiClient.post<AuthResponse>('/api/auth/login', data).then((r) => r.data),

  logout: () =>
    apiClient.post<{ message: string }>('/api/auth/logout').then((r) => r.data),

  logoutAll: () =>
    apiClient.post<{ message: string }>('/api/auth/logout-all').then((r) => r.data),

  me: () => apiClient.get<Officer>('/api/auth/me').then((r) => r.data),

  updatePreferences: (data: { map_theme?: string; preferences?: Record<string, unknown> }) =>
    apiClient.patch<Officer>('/api/auth/preferences', data).then((r) => {
      const cur = getStoredOfficer()
      if (cur) setStoredOfficer({ ...cur, ...r.data })
      return r.data
    }),
}
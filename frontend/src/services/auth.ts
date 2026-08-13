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
}
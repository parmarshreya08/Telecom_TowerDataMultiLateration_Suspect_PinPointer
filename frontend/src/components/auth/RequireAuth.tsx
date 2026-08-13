import { Navigate, useLocation } from 'react-router-dom'
import { getToken } from '@/services/auth'
import type { ReactNode } from 'react'

interface RequireAuthProps {
  children: ReactNode
}

export function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation()
  const token = getToken()

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
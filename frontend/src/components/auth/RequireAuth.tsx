import { Navigate, useLocation, Link } from 'react-router-dom'
import { getToken, getStoredOfficer, isTokenExpired, clearAuth } from '@/services/auth'
import { ShieldAlert, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ReactNode } from 'react'

interface RequireAuthProps {
  children: ReactNode
  requiredRole?: 'ADMIN' | 'INSPECTOR'
}

export function RequireAuth({ children, requiredRole }: RequireAuthProps) {
  const location = useLocation()
  const token = getToken()
  const officer = getStoredOfficer()

  // Fail closed: no token or expired/unreadable token never renders protected UI.
  if (!token || isTokenExpired(token)) {
    clearAuth()
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // Check role authorization (deny when officer missing or role mismatches).
  if (requiredRole && officer?.role !== requiredRole) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger-500/10 text-danger-500 mb-4 ring-8 ring-danger-500/5">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-surface-900 dark:text-white">
          Access Restricted
        </h2>
        <p className="mt-2 max-w-md text-sm text-surface-500 dark:text-surface-400">
          This portal section requires <span className="font-semibold text-primary-500">{requiredRole}</span> privileges.
          Your current account is authenticated as <span className="font-semibold">{officer.role}</span>.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Link to="/dashboard">
            <Button variant="primary" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
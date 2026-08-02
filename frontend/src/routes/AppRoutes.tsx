import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthContext } from '@/contexts/AuthContext'
import { AppLayout } from '@/layouts/AppLayout'
import { PageLoader } from '@/components/ui/PageLoader'

// Lazy-loaded pages
const LandingPage      = lazy(() => import('@/pages/LandingPage'))
const LoginPage        = lazy(() => import('@/pages/LoginPage'))
const RegisterPage     = lazy(() => import('@/pages/RegisterPage'))
const DashboardPage    = lazy(() => import('@/pages/DashboardPage'))
const InvestigationsPage = lazy(() => import('@/pages/InvestigationsPage'))
const NewInvestigationPage = lazy(() => import('@/pages/NewInvestigationPage'))
const InvestigationDetailPage = lazy(() => import('@/pages/InvestigationDetailPage'))
const UploadCDRPage    = lazy(() => import('@/pages/UploadCDRPage'))
const ProcessingPage   = lazy(() => import('@/pages/ProcessingPage'))
const LiveInvestigationPage = lazy(() => import('@/pages/LiveInvestigationPage'))
const ReportsPage      = lazy(() => import('@/pages/ReportsPage'))
const ProfilePage      = lazy(() => import('@/pages/ProfilePage'))
const SettingsPage     = lazy(() => import('@/pages/SettingsPage'))
const NotFoundPage     = lazy(() => import('@/pages/NotFoundPage'))
const LiveRedirectPage = lazy(() => import('@/pages/LiveRedirectPage'))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthContext()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthContext()
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

        {/* Protected app routes */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard"       element={<DashboardPage />} />
          <Route path="/investigations"  element={<InvestigationsPage />} />
          <Route path="/investigations/new" element={<NewInvestigationPage />} />
          <Route path="/investigations/:id" element={<InvestigationDetailPage />} />
          <Route path="/investigations/:id/upload" element={<UploadCDRPage />} />
          <Route path="/investigations/:id/processing" element={<ProcessingPage />} />
          <Route path="/investigations/:id/live" element={<LiveInvestigationPage />} />
          <Route path="/reports"   element={<ReportsPage />} />
          <Route path="/live"      element={<LiveRedirectPage />} />
          <Route path="/profile"   element={<ProfilePage />} />
          <Route path="/settings"  element={<SettingsPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

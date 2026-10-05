import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { PageLoader } from '@/components/ui/PageLoader'
import { RequireAuth } from '@/components/auth/RequireAuth'

// Lazy-loaded pages
const LandingPage             = lazy(() => import('@/pages/LandingPage'))
const LoginPage               = lazy(() => import('@/pages/LoginPage'))
const RegisterPage            = lazy(() => import('@/pages/RegisterPage'))
const DashboardPage           = lazy(() => import('@/pages/DashboardPage'))
const InvestigationsPage      = lazy(() => import('@/pages/InvestigationsPage'))
const NewInvestigationPage    = lazy(() => import('@/pages/NewInvestigationPage'))
const InvestigationDetailPage = lazy(() => import('@/pages/InvestigationDetailPage'))
const UploadCDRPage           = lazy(() => import('@/pages/UploadCDRPage'))
const ProcessingPage          = lazy(() => import('@/pages/ProcessingPage'))
const LiveInvestigationPage   = lazy(() => import('@/pages/LiveInvestigationPage'))
const ReportsPage             = lazy(() => import('@/pages/ReportsPage'))
const SettingsPage            = lazy(() => import('@/pages/SettingsPage'))
const NotFoundPage            = lazy(() => import('@/pages/NotFoundPage'))
const LiveRedirectPage        = lazy(() => import('@/pages/LiveRedirectPage'))
const UserManagementPage      = lazy(() => import('@/pages/UserManagementPage'))
const AuditLogsPage           = lazy(() => import('@/pages/AuditLogsPage'))
const FieldTrackerPage        = lazy(() => import('@/pages/FieldTrackerPage'))

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        
        {/* Ground Officer Distraction-Free Tracking Link */}
        <Route path="/t/:token" element={<FieldTrackerPage />} />

        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/investigations" element={<InvestigationsPage />} />
          <Route path="/investigations/new" element={<NewInvestigationPage />} />
          <Route path="/investigations/:id" element={<InvestigationDetailPage />} />
          <Route path="/upload" element={<UploadCDRPage />} />
          <Route path="/investigations/:id/upload" element={<UploadCDRPage />} />
          <Route path="/investigations/:id/processing" element={<ProcessingPage />} />
          <Route path="/investigations/:id/live" element={<LiveInvestigationPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/live" element={<LiveRedirectPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* Admin-only Routes */}
          <Route
            path="/users"
            element={
              <RequireAuth requiredRole="ADMIN">
                <UserManagementPage />
              </RequireAuth>
            }
          />
          <Route
            path="/audit-logs"
            element={
              <RequireAuth requiredRole="ADMIN">
                <AuditLogsPage />
              </RequireAuth>
            }
          />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

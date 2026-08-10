import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { PageLoader } from '@/components/ui/PageLoader'

// Lazy-loaded pages
const LandingPage      = lazy(() => import('@/pages/LandingPage'))
const DashboardPage    = lazy(() => import('@/pages/DashboardPage'))
const InvestigationsPage = lazy(() => import('@/pages/InvestigationsPage'))
const NewInvestigationPage = lazy(() => import('@/pages/NewInvestigationPage'))
const InvestigationDetailPage = lazy(() => import('@/pages/InvestigationDetailPage'))
const UploadCDRPage    = lazy(() => import('@/pages/UploadCDRPage'))
const ProcessingPage   = lazy(() => import('@/pages/ProcessingPage'))
const LiveInvestigationPage = lazy(() => import('@/pages/LiveInvestigationPage'))
const ReportsPage      = lazy(() => import('@/pages/ReportsPage'))
const SettingsPage     = lazy(() => import('@/pages/SettingsPage'))
const NotFoundPage     = lazy(() => import('@/pages/NotFoundPage'))
const LiveRedirectPage = lazy(() => import('@/pages/LiveRedirectPage'))

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route element={<AppLayout />}>
          <Route path="/dashboard"       element={<DashboardPage />} />
          <Route path="/investigations"  element={<InvestigationsPage />} />
          <Route path="/investigations/new" element={<NewInvestigationPage />} />
          <Route path="/investigations/:id" element={<InvestigationDetailPage />} />
          <Route path="/upload" element={<UploadCDRPage />} />
          <Route path="/investigations/:id/upload" element={<UploadCDRPage />} />
          <Route path="/investigations/:id/processing" element={<ProcessingPage />} />
          <Route path="/investigations/:id/live" element={<LiveInvestigationPage />} />
          <Route path="/reports"   element={<ReportsPage />} />
          <Route path="/live"      element={<LiveRedirectPage />} />
          <Route path="/settings"  element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

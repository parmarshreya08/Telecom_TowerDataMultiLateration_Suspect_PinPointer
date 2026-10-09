import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { NotificationDrawer } from '@/components/notifications/NotificationDrawer'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { WorkspaceTour } from '@/components/onboarding/WorkspaceTour'
import { useNotifications } from '@/hooks/useNotifications'
import { useWorkspaceTour } from '@/hooks/useWorkspaceTour'

import { OfflineBanner } from '@/components/ui/OfflineBanner'

export function AppLayout() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen]   = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true)
  const [notifOpen, setNotifOpen]       = useState(false)
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const tour = useWorkspaceTour()

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50 dark:bg-surface-950">
      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0 relative z-0">
        <OfflineBanner />
        <Topbar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          unreadNotifications={unreadCount}
          onOpenNotifications={() => setNotifOpen(true)}
          onStartTour={tour.restart}
        />

        <main className="flex-1 overflow-y-auto p-6">
          <ErrorBoundary key={location.pathname} label="This page failed to load">
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Notification Drawer */}
      <NotificationDrawer
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
      />

      {/* One-time workspace onboarding tour */}
      <WorkspaceTour open={tour.open} onFinish={tour.finish} />
    </div>
  )
}

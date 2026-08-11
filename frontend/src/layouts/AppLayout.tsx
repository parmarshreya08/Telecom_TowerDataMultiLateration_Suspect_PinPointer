import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { NotificationDrawer } from '@/components/notifications/NotificationDrawer'
import { useNotifications } from '@/hooks/useNotifications'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen]   = useState(true)
  const [notifOpen, setNotifOpen]       = useState(false)
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50 dark:bg-surface-950">
      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          unreadNotifications={unreadCount}
          onOpenNotifications={() => setNotifOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
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
    </div>
  )
}

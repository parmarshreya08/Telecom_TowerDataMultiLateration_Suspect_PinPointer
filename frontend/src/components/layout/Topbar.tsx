import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Bell, Sun, Moon, Menu, ChevronRight, Home, LogOut } from 'lucide-react'
import { useThemeContext } from '@/hooks/useThemeContext'
import { authApi, clearAuth, getStoredOfficer } from '@/services/auth'
import { cn } from '@/utils'

interface TopbarProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
  unreadNotifications: number
  onOpenNotifications: () => void
}

// Build breadcrumb from pathname
function useBreadcrumb() {
  const location = useLocation()
  const parts = location.pathname.split('/').filter(Boolean)
  return parts.map((p, i) => ({
    label: p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' '),
    path:  '/' + parts.slice(0, i + 1).join('/'),
    isLast: i === parts.length - 1,
  }))
}

export function Topbar({ onToggleSidebar, unreadNotifications, onOpenNotifications }: TopbarProps) {
  const { isDark, toggleTheme } = useThemeContext()
  const navigate                = useNavigate()
  const breadcrumb              = useBreadcrumb()
  const officer                 = getStoredOfficer()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef                 = useRef<HTMLDivElement>(null)

  // Close the user menu when clicking outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function handleLogout() {
    try {
      await authApi.logout()
    } catch {
      // best-effort — always clear locally
    }
    clearAuth()
    navigate('/', { replace: true })
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-surface-200 bg-white px-4 dark:border-surface-700 dark:bg-surface-900">
      {/* Left — toggle + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-surface-500 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-700 dark:hover:text-surface-300 transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Home link */}
        <button
          onClick={() => navigate('/')}
          className="hidden sm:flex rounded-lg p-2 text-surface-400 hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-700 dark:hover:text-surface-300 transition-colors"
          aria-label="Go to homepage"
          title="Homepage"
        >
          <Home className="h-4 w-4" />
        </button>

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
          {breadcrumb.map((crumb, idx) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-surface-400" />}
              <span
                className={cn(
                  crumb.isLast
                    ? 'font-semibold text-surface-900 dark:text-surface-100'
                    : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 cursor-pointer'
                )}
                onClick={() => !crumb.isLast && navigate(crumb.path)}
              >
                {crumb.label}
              </span>
            </span>
          ))}
        </nav>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-surface-500 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-700 dark:hover:text-surface-300 transition-colors"
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Notifications */}
        <button
          onClick={onOpenNotifications}
          className="relative rounded-lg p-2 text-surface-500 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-700 dark:hover:text-surface-300 transition-colors"
          aria-label={`Notifications — ${unreadNotifications} unread`}
        >
          <Bell className="h-4 w-4" />
          {unreadNotifications > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-2xs font-bold text-white">
              {unreadNotifications > 9 ? '9+' : unreadNotifications}
            </span>
          )}
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="ml-1 flex items-center gap-2 rounded-lg p-1.5 text-surface-500 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-700 dark:hover:text-surface-300 transition-colors"
            aria-label="Account menu"
            aria-expanded={menuOpen}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
              {(officer?.officer_name ?? '?').charAt(0).toUpperCase()}
            </span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-surface-200 bg-white p-2 shadow-lg dark:border-surface-700 dark:bg-surface-900">
              <div className="flex items-center gap-3 border-b border-surface-100 px-2 pb-2 dark:border-surface-700">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
                  {(officer?.officer_name ?? '?').charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-surface-900 dark:text-surface-100">
                    {officer?.officer_name ?? 'Officer'}
                  </p>
                  <p className="truncate text-xs text-surface-400">{officer?.email ?? ''}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-danger hover:bg-danger/10"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  )
}

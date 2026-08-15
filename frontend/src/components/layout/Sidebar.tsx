import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import {
  LayoutDashboard, FolderSearch, MapPin, FileBarChart,
  Settings, ChevronLeft, ChevronRight, Radio, Users, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/utils'
import { Logo } from '@/components/ui/Logo'
import { getStoredOfficer } from '@/services/auth'

interface SidebarProps {
  open: boolean
  onToggle: () => void
}

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/investigations', label: 'Investigations', icon: FolderSearch },
  { path: '/live', label: 'Live Tracking', icon: MapPin, badge: 'LIVE' },
  { path: '/reports', label: 'Reports', icon: FileBarChart },
  { path: '/settings', label: 'Settings', icon: Settings },
]

const ADMIN_ITEMS = [
  { path: '/users', label: 'User Management', icon: Users },
  { path: '/audit-logs', label: 'Audit Logs', icon: ShieldCheck },
]

export function Sidebar({ open, onToggle }: SidebarProps) {
  const location = useLocation()
  const officer = getStoredOfficer()
  const isAdmin = officer?.role === 'ADMIN'

  return (
    <motion.aside
      className="relative z-30 flex h-full flex-col border-r border-surface-200 bg-white text-surface-900 transition-colors duration-200 dark:border-surface-700 dark:bg-surface-900 dark:text-white"
      animate={{ width: open ? 240 : 64 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
    >
      {/* Logo */}
      <div className={cn('flex h-16 items-center border-b border-surface-200 px-4 dark:border-surface-700', open ? 'gap-3' : 'justify-center')}>
        <Logo size={32} />
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <p className="text-sm font-bold tracking-wide text-surface-900 dark:text-white">E-RAKSHAK</p>
              <p className="text-2xs text-surface-500 dark:text-surface-400">Investigation Platform</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {NAV_ITEMS.map(({ path, label, icon: Icon, badge }) => {
            const isActive = location.pathname.startsWith(path)
            return (
              <li key={path}>
                <NavLink
                  to={path}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                    isActive
                      ? 'bg-primary-600 text-white shadow-xs'
                      : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-white'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className={cn(
                    'h-4 w-4 shrink-0 transition-colors',
                    isActive
                      ? 'text-white'
                      : 'text-surface-500 group-hover:text-surface-900 dark:text-surface-400 dark:group-hover:text-white'
                  )} />
                  <AnimatePresence>
                    {open && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-1 items-center justify-between overflow-hidden"
                      >
                        <span className="whitespace-nowrap">{label}</span>
                        {badge && (
                          <span className="ml-auto rounded bg-emerald-500 px-1.5 py-0.5 text-2xs font-bold text-white animate-pulse-slow">
                            {badge}
                          </span>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </NavLink>
              </li>
            )
          })}
        </ul>

        {/* Administration Section (Admin only) */}
        {isAdmin && (
          <div className="mt-4 pt-4 border-t border-surface-200 dark:border-surface-700/60 px-2">
            {open && (
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-surface-400 dark:text-surface-500">
                Administration
              </p>
            )}
            <ul className="space-y-1">
              {ADMIN_ITEMS.map(({ path, label, icon: Icon }) => {
                const isActive = location.pathname.startsWith(path)
                return (
                  <li key={path}>
                    <NavLink
                      to={path}
                      className={cn(
                        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                        isActive
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-white'
                      )}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <Icon className={cn(
                        'h-4 w-4 shrink-0 transition-colors',
                        isActive
                          ? 'text-white'
                          : 'text-surface-500 group-hover:text-surface-900 dark:text-surface-400 dark:group-hover:text-white'
                      )} />
                      <AnimatePresence>
                        {open && (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="whitespace-nowrap"
                          >
                            {label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* System status */}
        {open && (
          <div className="mt-6 mx-2 rounded-lg border border-surface-200 bg-surface-50/80 p-3 dark:border-surface-700/60 dark:bg-surface-800 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Radio className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
              <span className="text-2xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">System Status</span>
            </div>
            <div className="space-y-1.5">
              <StatusRow label="Backend API" status="online" />
              <StatusRow label="Database" status="online" />
              <StatusRow label="Live Tracking" status="idle" />
            </div>
          </div>
        )}
      </nav>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-surface-200 bg-white text-surface-500 shadow-xs hover:border-primary-600 hover:bg-primary-600 hover:text-white dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300 dark:hover:border-primary-600 dark:hover:bg-primary-600 dark:hover:text-white transition-colors"
        aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {open ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
    </motion.aside>
  )
}

function StatusRow({ label, status }: { label: string; status: 'online' | 'offline' | 'idle' }) {
  const dotColor = { online: 'bg-emerald-500', offline: 'bg-danger', idle: 'bg-amber-500' }[status]
  const text = { online: 'Online', offline: 'Offline', idle: 'Idle' }[status]
  return (
    <div className="flex items-center justify-between">
      <span className="text-2xs text-surface-500 dark:text-surface-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full', dotColor)} />
        <span className="text-2xs font-medium text-surface-700 dark:text-surface-300">{text}</span>
      </div>
    </div>
  )
}

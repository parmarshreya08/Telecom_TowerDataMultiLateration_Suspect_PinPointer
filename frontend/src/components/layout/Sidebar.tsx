import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import {
  LayoutDashboard, FolderSearch, MapPin, FileBarChart,
  Settings, ChevronLeft, ChevronRight, Radio,
} from 'lucide-react'
import { cn } from '@/utils'
import { Logo } from '@/components/ui/Logo'

interface SidebarProps {
  open: boolean
  onToggle: () => void
}

const NAV_ITEMS = [
  { path: '/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { path: '/investigations', label: 'Investigations',  icon: FolderSearch    },
  { path: '/live',           label: 'Live Tracking',   icon: MapPin, badge: 'LIVE' },
  { path: '/reports',        label: 'Reports',         icon: FileBarChart    },
  { path: '/settings',       label: 'Settings',        icon: Settings        },
]

export function Sidebar({ open, onToggle }: SidebarProps) {
  const location = useLocation()

  return (
    <motion.aside
      className="relative z-30 flex h-full flex-col bg-surface-900 text-white"
      animate={{ width: open ? 240 : 64 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
    >
      {/* Logo */}
      <div className={cn('flex h-16 items-center border-b border-surface-700 px-4', open ? 'gap-3' : 'justify-center')}>
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
              <p className="text-sm font-bold tracking-wide">E-RAKSHAK</p>
              <p className="text-2xs text-surface-400">Investigation Platform</p>
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
                      ? 'bg-primary-600 text-white'
                      : 'text-surface-300 hover:bg-surface-700 hover:text-white'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
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
                          <span className="ml-auto rounded bg-green-500 px-1.5 py-0.5 text-2xs font-bold text-white animate-pulse-slow">
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

        {/* System status */}
        {open && (
          <div className="mt-6 mx-2 rounded-lg bg-surface-800 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Radio className="h-3.5 w-3.5 text-green-400" />
              <span className="text-2xs font-semibold uppercase tracking-wider text-surface-400">System Status</span>
            </div>
            <div className="space-y-1.5">
              <StatusRow label="Backend API"    status="online" />
              <StatusRow label="Database"       status="online" />
              <StatusRow label="Live Tracking"  status="idle"   />
            </div>
          </div>
        )}
      </nav>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full bg-surface-700 border border-surface-600 text-surface-300 hover:bg-primary-600 hover:text-white transition-colors"
        aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {open ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
    </motion.aside>
  )
}

function StatusRow({ label, status }: { label: string; status: 'online' | 'offline' | 'idle' }) {
  const dotColor = { online: 'bg-green-400', offline: 'bg-danger', idle: 'bg-yellow-400' }[status]
  const text     = { online: 'Online', offline: 'Offline', idle: 'Idle' }[status]
  return (
    <div className="flex items-center justify-between">
      <span className="text-2xs text-surface-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full', dotColor)} />
        <span className="text-2xs text-surface-300">{text}</span>
      </div>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Bell, CheckCheck, MapPin, Radio, WifiOff, AlertCircle, FileText, Upload } from 'lucide-react'
import type { Notification } from '@/types'
import { formatTimeAgo } from '@/utils'
import { cn } from '@/utils'

interface NotificationDrawerProps {
  open:           boolean
  onClose:        () => void
  notifications:  Notification[]
  onMarkRead:     (id: string) => void
  onMarkAllRead:  () => void
}

// Maps type string → icon. Falls back to <Bell> for unknown types.
function getIcon(type?: string) {
  const map: Record<string, React.ReactNode> = {
    location_updated:        <MapPin    className="h-4 w-4" />,
    tower_changed:           <Radio     className="h-4 w-4" />,
    signal_lost:             <WifiOff   className="h-4 w-4" />,
    tracking_resumed:        <Radio     className="h-4 w-4" />,
    email_sent:              <Bell      className="h-4 w-4" />,
    investigation_completed: <CheckCheck className="h-4 w-4" />,
    report_generated:        <FileText  className="h-4 w-4" />,
    upload_completed:        <Upload    className="h-4 w-4" />,
    error:                   <AlertCircle className="h-4 w-4" />,
  }
  return map[type ?? ''] ?? <Bell className="h-4 w-4" />
}

function getColor(type?: string): string {
  const map: Record<string, string> = {
    location_updated:        'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    tower_changed:           'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    signal_lost:             'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    tracking_resumed:        'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    email_sent:              'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
    investigation_completed: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    report_generated:        'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    upload_completed:        'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
    error:                   'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  }
  return map[type ?? ''] ?? 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300'
}

export function NotificationDrawer({
  open, onClose, notifications, onMarkRead, onMarkAllRead,
}: NotificationDrawerProps) {
  const unread   = notifications.filter((n) => !n.read).length
  const closeRef = useRef<HTMLButtonElement>(null)

  // Escape key + focus management
  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Body scroll lock
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer */}
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col
                       bg-white shadow-2xl dark:bg-surface-900"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-surface-200 px-5 py-4 dark:border-surface-700">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary-600" />
                <h2 className="font-semibold text-surface-900 dark:text-surface-100">Notifications</h2>
                {unread > 0 && (
                  <span className="rounded-full bg-danger px-2 py-0.5 text-2xs font-bold text-white">
                    {unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button
                    onClick={onMarkAllRead}
                    className="text-xs text-primary-600 hover:text-primary-700 hover:underline dark:text-primary-400 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  ref={closeRef}
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-surface-500 hover:bg-surface-100
                             dark:hover:bg-surface-700 transition-colors focus-visible:outline
                             focus-visible:outline-2 focus-visible:outline-primary-500"
                  aria-label="Close notifications"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-surface-400">
                  <Bell className="h-8 w-8 opacity-30" aria-hidden="true" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                <ul role="list">
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        className={cn(
                          'flex w-full gap-3 px-5 py-3.5 border-b border-surface-100',
                          'dark:border-surface-800 text-left transition-colors',
                          'hover:bg-surface-50 dark:hover:bg-surface-800',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500',
                          !n.read && 'bg-primary-50/60 dark:bg-primary-950/20'
                        )}
                        onClick={() => onMarkRead(n.id)}
                        aria-label={`${n.read ? '' : 'Unread: '}${n.title}`}
                      >
                        {/* Icon */}
                        <div className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          getColor(n.type)
                        )}>
                          {getIcon(n.type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn(
                              'text-sm font-medium leading-tight',
                              !n.read
                                ? 'text-surface-900 dark:text-surface-100'
                                : 'text-surface-600 dark:text-surface-400'
                            )}>
                              {n.title}
                            </p>
                            {!n.read && (
                              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" aria-hidden="true" />
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-surface-500 dark:text-surface-500 line-clamp-2">
                            {n.message}
                          </p>
                          <p className="mt-1 text-2xs text-surface-400">
                            {formatTimeAgo(n.timestamp ?? n.createdAt?.toString() ?? '')}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

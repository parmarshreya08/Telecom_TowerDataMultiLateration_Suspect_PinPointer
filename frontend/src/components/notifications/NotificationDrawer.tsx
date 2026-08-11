import { motion, AnimatePresence } from 'motion/react'
import { X, Bell, CheckCheck, MapPin, Radio, WifiOff, AlertCircle, FileText, Upload } from 'lucide-react'
import type { Notification, NotificationType } from '@/types'
import { formatTimeAgo } from '@/utils'
import { cn } from '@/utils'

interface NotificationDrawerProps {
  open: boolean
  onClose: () => void
  notifications: Notification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
}

const typeIcon: Record<NotificationType, React.ReactNode> = {
  location_updated:       <MapPin className="h-4 w-4" />,
  tower_changed:          <Radio className="h-4 w-4" />,
  signal_lost:            <WifiOff className="h-4 w-4" />,
  tracking_resumed:       <Radio className="h-4 w-4" />,
  email_sent:             <Bell className="h-4 w-4" />,
  investigation_completed:<CheckCheck className="h-4 w-4" />,
  report_generated:       <FileText className="h-4 w-4" />,
  upload_completed:       <Upload className="h-4 w-4" />,
  error:                  <AlertCircle className="h-4 w-4" />,
}

const typeColor: Record<NotificationType, string> = {
  location_updated:       'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  tower_changed:          'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  signal_lost:            'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  tracking_resumed:       'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  email_sent:             'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
  investigation_completed:'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  report_generated:       'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  upload_completed:       'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
  error:                  'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
}

export function NotificationDrawer({
  open, onClose, notifications, onMarkRead, onMarkAllRead,
}: NotificationDrawerProps) {
  const unread = notifications.filter((n) => !n.read).length

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl dark:bg-surface-900"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-surface-200 px-5 py-4 dark:border-surface-700">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary-600" />
                <h2 className="font-semibold text-surface-900 dark:text-surface-100">Notifications</h2>
                {unread > 0 && (
                  <span className="rounded-full bg-danger px-2 py-0.5 text-2xs font-bold text-white">{unread}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button
                    onClick={onMarkAllRead}
                    className="text-xs text-primary-600 hover:underline"
                  >
                    Mark all read
                  </button>
                )}
                <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors">
                  <X className="h-4 w-4 text-surface-500 dark:text-surface-400" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-surface-400">
                  <Bell className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No notifications</p>
                </div>
              ) : (
                <ul>
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      className={cn(
                        'flex gap-3 px-5 py-3.5 border-b border-surface-100 dark:border-surface-800 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors',
                        !n.read && 'bg-primary-50/50 dark:bg-primary-950/20'
                      )}
                      onClick={() => onMarkRead(n.id)}
                    >
                      <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', typeColor[n.type])}>
                        {typeIcon[n.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn('text-sm font-medium leading-tight', !n.read ? 'text-surface-900 dark:text-surface-100' : 'text-surface-600 dark:text-surface-400')}>
                            {n.title}
                          </p>
                          {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary-500" />}
                        </div>
                        <p className="mt-0.5 text-xs text-surface-500 dark:text-surface-500 line-clamp-2">
                          {n.message}
                        </p>
                        <p className="mt-1 text-2xs text-surface-400">{formatTimeAgo(n.timestamp)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

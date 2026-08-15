import { useState, useCallback } from 'react'
import type { Notification, NotificationType } from '@/types'

// TEMPORARY FRONTEND MOCK — replace with backend notification stream later
const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: 'notif-rogue-bts-01',
    type: 'rogue_tower',
    title: 'CRITICAL: Unregistered BTS detected in the investigation area.',
    message: 'Possible IMSI Catcher.',
    timestamp: new Date().toISOString(),
    read: false,
  },
]

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS)

  const unreadCount = notifications.filter((n) => !n.read).length

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
    // TODO: notificationApi.markRead(id)
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    // TODO: notificationApi.markAllRead()
  }, [])

  const addNotification = useCallback(
    (type: NotificationType, title: string, message: string, investigationId?: string) => {
      const notification: Notification = {
        id:               crypto.randomUUID(),
        type,
        title,
        message,
        timestamp:        new Date().toISOString(),
        read:             false,
        investigation_id: investigationId,
      }
      setNotifications((prev) => [notification, ...prev])
    },
    []
  )

  return { notifications, unreadCount, markRead, markAllRead, addNotification }
}

import {
  MapPin, Radio, Zap, WifiOff, Play, FileText, Upload, FolderPlus, CheckCircle, Mail,
  Smartphone,
} from 'lucide-react'
import type { TimelineEvent } from '@/types'
import { formatDateTime, formatTimeAgo, cn } from '@/utils'

const typeIcon: Record<string, React.ReactNode> = {
  tower_change:            <Radio className="h-3.5 w-3.5" />,
  location_update:         <MapPin className="h-3.5 w-3.5" />,
  kalman_update:           <Zap className="h-3.5 w-3.5" />,
  signal_lost:             <WifiOff className="h-3.5 w-3.5" />,
  tracking_resumed:        <Play className="h-3.5 w-3.5" />,
  export_generated:        <FileText className="h-3.5 w-3.5" />,
  upload_completed:        <Upload className="h-3.5 w-3.5" />,
  investigation_created:   <FolderPlus className="h-3.5 w-3.5" />,
  investigation_completed: <CheckCircle className="h-3.5 w-3.5" />,
  email_sent:              <Mail className="h-3.5 w-3.5" />,
  device_swap:             <Smartphone className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />,
  sim_swap:                <Radio className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />,
}

const typeColor: Record<string, string> = {
  tower_change:            'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  location_update:         'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  kalman_update:           'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
  signal_lost:             'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  tracking_resumed:        'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  export_generated:        'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
  upload_completed:        'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
  investigation_created:   'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  investigation_completed: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  email_sent:              'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400',
  device_swap:             'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 ring-1 ring-amber-400/50 dark:ring-amber-500/30',
  sim_swap:                'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300 ring-1 ring-orange-400/50 dark:ring-orange-500/30',
}

function getEventTitle(event: TimelineEvent): string {
  const t = event.type || event.event_type || ''
  if (t === 'device_swap') {
    if (event.old_imei && event.new_imei) {
      return `IMEI Swap Detected: ${event.old_imei} → ${event.new_imei}`
    }
    return event.title || 'IMEI Swap Detected'
  }
  if (t === 'sim_swap') {
    if (event.old_imsi && event.new_imsi) {
      return `SIM Swap Detected: ${event.old_imsi} → ${event.new_imsi}`
    }
    return event.title || 'SIM Swap Detected'
  }
  return event.title || t || 'Investigation Event'
}

interface TimelineProps {
  events: TimelineEvent[]
  compact?: boolean
}

export function InvestigationTimeline({ events, compact }: TimelineProps) {
  if (events.length === 0) {
    return <p className="text-xs text-surface-400 text-center py-4">No timeline events yet</p>
  }

  const sorted = [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return (
    <ol className={cn('space-y-3', compact ? '' : 'space-y-4')}>
      {sorted.map((event, i) => {
        const eventType = event.type || event.event_type || 'location_update'
        const icon = typeIcon[eventType] ?? <MapPin className="h-3.5 w-3.5" />
        const colorClass = typeColor[eventType] ?? 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400'
        const title = getEventTitle(event)

        return (
          <li key={event.id || i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', colorClass)}>
                {icon}
              </div>
              {i < sorted.length - 1 && (
                <div className="mt-1 w-px flex-1 bg-surface-200 dark:bg-surface-700" style={{ minHeight: 16 }} />
              )}
            </div>
            <div className={cn('min-w-0', i < sorted.length - 1 && 'pb-3')}>
              <p className={cn('font-medium leading-tight', compact ? 'text-xs' : 'text-sm', 'text-surface-800 dark:text-surface-200')}>
                {title}
              </p>
              {event.description && (
                <p className={cn('text-surface-500 dark:text-surface-400 mt-0.5 line-clamp-2', compact ? 'text-2xs' : 'text-xs')}>
                  {event.description}
                </p>
              )}
              <p className="text-2xs text-surface-400 mt-0.5">
                {compact ? formatTimeAgo(event.timestamp) : formatDateTime(event.timestamp)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

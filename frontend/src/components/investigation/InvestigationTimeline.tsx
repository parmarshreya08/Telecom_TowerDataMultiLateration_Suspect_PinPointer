import {
  MapPin, Radio, Zap, WifiOff, Play, FileText, Upload, FolderPlus, CheckCircle, Mail,
} from 'lucide-react'
import type { TimelineEvent, TimelineEventType } from '@/types'
import { formatDateTime, formatTimeAgo, cn } from '@/utils'

const typeIcon: Record<TimelineEventType, React.ReactNode> = {
  tower_change:           <Radio className="h-3.5 w-3.5" />,
  location_update:        <MapPin className="h-3.5 w-3.5" />,
  kalman_update:          <Zap className="h-3.5 w-3.5" />,
  signal_lost:            <WifiOff className="h-3.5 w-3.5" />,
  tracking_resumed:       <Play className="h-3.5 w-3.5" />,
  export_generated:       <FileText className="h-3.5 w-3.5" />,
  upload_completed:       <Upload className="h-3.5 w-3.5" />,
  investigation_created:  <FolderPlus className="h-3.5 w-3.5" />,
  investigation_completed:<CheckCircle className="h-3.5 w-3.5" />,
  email_sent:             <Mail className="h-3.5 w-3.5" />,
}

const typeColor: Record<TimelineEventType, string> = {
  tower_change:           'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  location_update:        'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  kalman_update:          'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
  signal_lost:            'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  tracking_resumed:       'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  export_generated:       'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
  upload_completed:       'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
  investigation_created:  'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  investigation_completed:'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  email_sent:             'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400',
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
      {sorted.map((event, i) => (
        <li key={event.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', typeColor[event.type])}>
              {typeIcon[event.type]}
            </div>
            {i < sorted.length - 1 && (
              <div className="mt-1 w-px flex-1 bg-surface-200 dark:bg-surface-700" style={{ minHeight: 16 }} />
            )}
          </div>
          <div className={cn('min-w-0', i < sorted.length - 1 && 'pb-3')}>
            <p className={cn('font-medium leading-tight', compact ? 'text-xs' : 'text-sm', 'text-surface-800 dark:text-surface-200')}>
              {event.title}
            </p>
            <p className={cn('text-surface-500 dark:text-surface-400 mt-0.5 line-clamp-2', compact ? 'text-2xs' : 'text-xs')}>
              {event.description}
            </p>
            <p className="text-2xs text-surface-400 mt-0.5">
              {compact ? formatTimeAgo(event.timestamp) : formatDateTime(event.timestamp)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

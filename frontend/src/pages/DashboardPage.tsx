import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  FolderOpen, Clock, CheckCircle, Upload, Radio, FileText,
  Plus, ArrowRight, TrendingUp, Activity, MapPin,
} from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { MOCK_DASHBOARD_STATS, MOCK_INVESTIGATIONS } from '@/mock/investigations'
import { formatDateTime, formatTimeAgo, cn } from '@/utils'
import { TRACKING_STATUS_COLORS } from '@/constants'

const StatCard = ({
  icon: Icon, label, value, sub, color,
}: { icon: React.ElementType; label: string; value: number | string; sub?: string; color: string }) => (
  <motion.div
    className="card p-5"
    whileHover={{ y: -1 }}
    transition={{ duration: 0.15 }}
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs text-surface-500 dark:text-surface-400 mb-1">{label}</p>
        <p className="stat-value">{value}</p>
        {sub && <p className="text-xs text-surface-400 mt-0.5">{sub}</p>}
      </div>
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </motion.div>
)

export default function DashboardPage() {
  const { officer } = useAuthContext()
  const navigate    = useNavigate()
  const stats       = MOCK_DASHBOARD_STATS
  const cases       = MOCK_INVESTIGATIONS.slice(0, 5)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-6 max-w-7xl">
      {/* ── Header ── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">
            {greeting}, {officer?.name?.split(' ')[0] ?? 'Officer'}
          </h1>
          <p className="text-sm text-surface-500">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="md"
            icon={<FolderOpen className="h-4 w-4" />}
            onClick={() => navigate('/investigations')}
          >
            All Cases
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => navigate('/investigations/new')}
          >
            New Investigation
          </Button>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Activity}   label="Active Cases"          value={stats.active_cases}              color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <StatCard icon={Clock}      label="Pending Cases"         value={stats.pending_cases}             color="bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400" />
        <StatCard icon={CheckCircle}label="Completed Cases"       value={stats.completed_cases}           color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
        <StatCard icon={Upload}     label="Today's Uploads"       value={stats.todays_uploads}            color="bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400" />
        <StatCard icon={Radio}      label="Active Tracking"       value={stats.active_tracking_sessions}  color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" sub="live now" />
        <StatCard icon={FileText}   label="Reports Generated"     value={stats.reports_generated}         color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* ── Recent Cases ── */}
        <div className="xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Investigations</CardTitle>
              <button onClick={() => navigate('/investigations')} className="flex items-center gap-1 text-xs text-primary-600 hover:underline dark:text-primary-400">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-100 dark:border-surface-700">
                    {['Case', 'Suspect', 'Operator', 'Status', 'Tracking', 'Updated'].map((h) => (
                      <th key={h} className="pb-3 text-left text-xs font-semibold text-surface-500 dark:text-surface-400 pr-4 last:pr-0">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
                  {cases.map((inv) => (
                    <tr
                      key={inv.id}
                      className="group cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
                      onClick={() => navigate(`/investigations/${inv.id}`)}
                    >
                      <td className="py-3 pr-4">
                        <p className="font-medium text-surface-900 dark:text-surface-100 group-hover:text-primary-600 transition-colors text-xs leading-tight">
                          {inv.case_name}
                        </p>
                        <p className="text-2xs text-surface-400">{inv.case_number}</p>
                      </td>
                      <td className="py-3 pr-4 text-xs text-surface-600 dark:text-surface-400">
                        {inv.suspect_name}
                      </td>
                      <td className="py-3 pr-4">
                        {inv.uploads[0] ? (
                          <span className="text-xs font-medium text-surface-600 dark:text-surface-400">
                            {inv.uploads[0].operator}
                          </span>
                        ) : (
                          <span className="text-xs text-surface-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={
                          inv.status === 'Active' ? 'success' :
                          inv.status === 'Pending' ? 'warning' :
                          inv.status === 'Completed' ? 'primary' : 'neutral'
                        }>
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={cn('text-xs font-medium', TRACKING_STATUS_COLORS[inv.tracking_status])}>
                          {inv.tracking_status === 'Live' && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-ping-slow" />}
                          {inv.tracking_status}
                        </span>
                      </td>
                      <td className="py-3 text-xs text-surface-400">
                        {formatTimeAgo(inv.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* ── Quick Actions + Activity ── */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <div className="space-y-2">
              {[
                { label: 'New Investigation',    icon: Plus,        path: '/investigations/new',  variant: 'primary' as const },
                { label: 'Continue Investigation', icon: ArrowRight, path: '/investigations',     variant: 'secondary' as const },
                { label: 'View Reports',          icon: FileText,   path: '/reports',             variant: 'secondary' as const },
                { label: 'Live Tracking',         icon: MapPin,     path: '/investigations/inv-001/live', variant: 'secondary' as const },
              ].map(({ label, icon: Icon, path, variant }) => (
                <Button
                  key={label}
                  variant={variant}
                  size="md"
                  className="w-full justify-start"
                  icon={<Icon className="h-4 w-4" />}
                  onClick={() => navigate(path)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <ol className="space-y-3">
              {MOCK_INVESTIGATIONS[0].timeline.slice(0, 4).map((event, i) => (
                <li key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                      <TrendingUp className="h-3 w-3" />
                    </div>
                    {i < 3 && <div className="mt-1 w-px flex-1 bg-surface-200 dark:bg-surface-700" />}
                  </div>
                  <div className="pb-3 min-w-0">
                    <p className="text-xs font-medium text-surface-800 dark:text-surface-200 leading-tight">{event.title}</p>
                    <p className="text-2xs text-surface-400 mt-0.5">{formatDateTime(event.timestamp)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  )
}

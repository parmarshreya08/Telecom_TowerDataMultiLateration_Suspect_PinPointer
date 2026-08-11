import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  FolderOpen, CheckCircle, Upload, Radio, FileText,
  Plus, ArrowRight, Activity, AlertCircle, RefreshCw,
} from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { investigationApi } from '@/services/api'
import type { DashboardStats, Investigation } from '@/types'
import { formatTimeAgo, cn } from '@/utils'
import { TRACKING_STATUS_COLORS } from '@/constants'

const StatCard = ({
  icon: Icon, label, value, sub, color,
}: { icon: React.ElementType; label: string; value: number | string; sub?: string; color: string }) => (
  <motion.div
    className="card p-4"
    whileHover={{ y: -2 }}
    transition={{ duration: 0.15 }}
  >
    <div className="flex items-center gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-surface-500 dark:text-surface-400 truncate">{label}</p>
        <p className="text-xl font-bold text-surface-900 dark:text-surface-100">{value}</p>
        {sub && <p className="text-xs text-surface-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  </motion.div>
)

const DEFAULT_STATS: DashboardStats = {
  total_cases: 0,
  total_uploads: 0,
  total_measurements: 0,
  total_towers: 0,
  active_cases: 0,
  completed_cases: 0,
}

export default function DashboardPage() {
  const navigate = useNavigate()

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [cases, setCases] = useState<Investigation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [statsRes, casesRes] = await Promise.allSettled([
      investigationApi.getDashboardStats(),
      investigationApi.list(),
    ])

    return {
      stats: statsRes.status === 'fulfilled' ? statsRes.value : DEFAULT_STATS,
      cases: casesRes.status === 'fulfilled'
        ? (Array.isArray(casesRes.value) ? casesRes.value : casesRes.value?.items ?? [])
        : [],
    }
  }, [])

  const refresh = useCallback(() => {
    setError(null)
    setIsLoading(true)
    load()
      .then(({ stats, cases }) => {
        setStats(stats)
        setCases(cases)
      })
      .catch((err: unknown) => {
        setError((err as Error)?.message || 'Failed to connect to backend server.')
      })
      .finally(() => setIsLoading(false))
  }, [load])

  useEffect(() => {
    let ignore = false
    load()
      .then(({ stats, cases }) => {
        if (ignore) return
        setStats(stats)
        setCases(cases)
      })
      .catch((err: unknown) => {
        if (!ignore) setError((err as Error)?.message || 'Failed to connect to backend server.')
      })
      .finally(() => {
        if (!ignore) setIsLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [load])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-6 max-w-7xl">
      {/* ── Header ── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">
            {greeting}, Officer
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400">
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

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="font-semibold text-sm">Unable to connect to backend</p>
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={refresh}>
            Retry
          </Button>
        </div>
      )}

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Activity} label="Active Cases" value={stats?.active_cases ?? (isLoading ? '...' : 0)} color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <StatCard icon={CheckCircle} label="Completed Cases" value={stats?.completed_cases ?? (isLoading ? '...' : 0)} color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
        <StatCard icon={Upload} label="Total Uploads" value={stats?.total_uploads ?? (isLoading ? '...' : 0)} color="bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400" />
        <StatCard icon={Radio} label="Total Measurements" value={stats?.total_measurements ?? (isLoading ? '...' : 0)} color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" />
        <StatCard icon={FileText} label="Total Cases" value={stats?.total_cases ?? (isLoading ? '...' : 0)} color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" />
        <StatCard icon={Radio} label="Total Towers" value={stats?.total_towers ?? (isLoading ? '...' : 0)} color="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" />
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
            {isLoading ? (
              <div className="p-8 text-center text-sm text-surface-400">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary-500" />
                Loading backend investigations...
              </div>
            ) : cases.length === 0 ? (
              <div className="p-8 text-center text-sm text-surface-400">
                <FolderOpen className="h-8 w-8 mx-auto mb-2 text-surface-300 dark:text-surface-600" />
                <p className="font-medium text-surface-600 dark:text-surface-300">No investigations found in database</p>
                <p className="text-xs text-surface-400 mt-1 mb-4">Upload CDR/tower data to create your first investigation case.</p>
                <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/upload')}>
                  Upload Data
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100 dark:border-surface-700">
                      {['Case ID', 'Target / Suspect', 'Status', 'Tracking', 'Updated'].map((h) => (
                        <th key={h} className="pb-3 text-left text-xs font-semibold text-surface-500 dark:text-surface-400 pr-4 last:pr-0">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
                    {cases.slice(0, 5).map((inv) => (
                      <tr
                        key={inv.id}
                        className="group cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
                        onClick={() => navigate(`/investigations/${inv.id}`)}
                      >
                        <td className="py-3 pr-4">
                          <p className="font-medium text-surface-900 dark:text-surface-100 group-hover:text-primary-600 transition-colors text-xs leading-tight">
                            {inv.case_name || inv.id}
                          </p>
                          <p className="text-2xs text-surface-400">{inv.case_number || inv.id}</p>
                        </td>
                        <td className="py-3 pr-4 text-xs text-surface-600 dark:text-surface-400">
                          {inv.suspect_name || inv.mobile_number || 'Target'}
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
                          <span className={cn('text-xs font-medium', TRACKING_STATUS_COLORS[inv.tracking_status] || 'text-surface-500 dark:text-surface-400')}>
                            {inv.tracking_status === 'Live' && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-ping-slow" />}
                            {inv.tracking_status}
                          </span>
                        </td>
                        <td className="py-3 text-xs text-surface-400">
                          {inv.updated_at ? formatTimeAgo(inv.updated_at) : 'Recent'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* ── Quick Actions ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <div className="space-y-2">
              {[
                { label: 'Upload CDR Data', icon: Upload, path: '/upload', variant: 'primary' as const },
                { label: 'New Investigation', icon: Plus, path: '/investigations/new', variant: 'secondary' as const },
                { label: 'View All Cases', icon: FolderOpen, path: '/investigations', variant: 'secondary' as const },
                { label: 'View Reports', icon: FileText, path: '/reports', variant: 'secondary' as const },
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
        </div>
      </div>
    </div>
  )
}


import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  Users, ShieldCheck, FolderOpen, Activity,
  UserPlus, ArrowRight, RefreshCw, AlertCircle,
  CheckCircle, XCircle
} from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { adminApi, investigationApi } from '@/services/api'
import { formatTimeAgo, cn } from '@/utils'
import type { SystemStatusData, AuditLogEntry, AdminUser, Investigation } from '@/types'

export default function AdminDashboardPage() {
  const [statusData, setStatusData] = useState<SystemStatusData | null>(null)
  const [recentLogs, setRecentLogs] = useState<AuditLogEntry[]>([])
  const [recentUsers, setRecentUsers] = useState<AdminUser[]>([])
  const [cases, setCases] = useState<Investigation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [statusRes, logsRes, usersRes, casesRes] = await Promise.allSettled([
      adminApi.getSystemStatus(),
      adminApi.getAuditLogs({ page: 1, page_size: 6 }),
      adminApi.listUsers(),
      investigationApi.list(),
    ])

    return {
      statusData: statusRes.status === 'fulfilled' ? statusRes.value : null,
      recentLogs: logsRes.status === 'fulfilled' ? logsRes.value.items : [],
      recentUsers: usersRes.status === 'fulfilled' ? usersRes.value.users.slice(0, 5) : [],
      cases: casesRes.status === 'fulfilled' ? (Array.isArray(casesRes.value) ? casesRes.value : casesRes.value?.items ?? []) : [],
    }
  }, [])

  const refresh = useCallback(() => {
    setError(null)
    setIsLoading(true)
    load()
      .then((data) => {
        setStatusData(data.statusData)
        setRecentLogs(data.recentLogs)
        setRecentUsers(data.recentUsers)
        setCases(data.cases)
      })
      .catch((err: unknown) => {
        setError((err as Error)?.message || 'Failed to load administrative telemetry.')
      })
      .finally(() => setIsLoading(false))
  }, [load])

  useEffect(() => {
    let ignore = false
    load()
      .then((data) => {
        if (ignore) return
        setStatusData(data.statusData)
        setRecentLogs(data.recentLogs)
        setRecentUsers(data.recentUsers)
        setCases(data.cases)
      })
      .catch((err: unknown) => {
        if (!ignore) setError((err as Error)?.message || 'Failed to connect to administrative server.')
      })
      .finally(() => {
        if (!ignore) setIsLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [load])

  const metrics = statusData?.metrics

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
              Administrative Control Center
            </h1>
            <span className="rounded bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
              ADMIN
            </span>
          </div>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            Global security management, officer authorization, system health, and forensic audit trail.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Link to="/users">
            <Button variant="primary" size="sm" className="gap-2">
              <UserPlus className="h-4 w-4" />
              Manage Officers
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div className="card p-4" whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0 bg-blue-500/10 text-blue-500">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-surface-500 dark:text-surface-400 truncate">Total Officers</p>
              <p className="text-xl font-bold text-surface-900 dark:text-surface-100">{metrics?.total_users ?? 0}</p>
              <p className="text-xs text-surface-400 mt-0.5">{metrics?.active_users ?? 0} active</p>
            </div>
          </div>
        </motion.div>

        <motion.div className="card p-4" whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0 bg-emerald-500/10 text-emerald-500">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-surface-500 dark:text-surface-400 truncate">All Investigations</p>
              <p className="text-xl font-bold text-surface-900 dark:text-surface-100">{metrics?.total_cases ?? 0}</p>
              <p className="text-xs text-surface-400 mt-0.5">{metrics?.active_cases ?? 0} active cases</p>
            </div>
          </div>
        </motion.div>

        <motion.div className="card p-4" whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0 bg-purple-500/10 text-purple-500">
              <Activity className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-surface-500 dark:text-surface-400 truncate">Localization Fixes</p>
              <p className="text-xl font-bold text-surface-900 dark:text-surface-100">{metrics?.total_fixes ?? 0}</p>
              <p className="text-xs text-surface-400 mt-0.5">{metrics?.total_uploads ?? 0} files ingested</p>
            </div>
          </div>
        </motion.div>

        <motion.div className="card p-4" whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0 bg-amber-500/10 text-amber-500">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-surface-500 dark:text-surface-400 truncate">Forensic Audit Logs</p>
              <p className="text-xl font-bold text-surface-900 dark:text-surface-100">{metrics?.total_audit_logs ?? 0}</p>
              <p className="text-xs text-surface-400 mt-0.5">Immutable records</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Main Split: Recent Audit Trail + Officer Roster */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Audit Trail (2 Cols) */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-500" />
              Recent Security & Forensic Audit Events
            </CardTitle>
            <Link to="/audit-logs">
              <Button variant="ghost" size="sm" className="gap-1 text-xs text-primary-600 dark:text-primary-400">
                View All <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {recentLogs.length === 0 ? (
              <p className="p-4 text-xs text-surface-500 text-center">No audit events recorded yet.</p>
            ) : (
              recentLogs.map((log) => (
                <div key={log.log_id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-lg shrink-0 text-2xs font-bold',
                        log.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-danger/10 text-danger'
                      )}
                    >
                      {log.status === 'SUCCESS' ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-surface-900 dark:text-surface-100 truncate">
                        {log.action.replace(/_/g, ' ')}
                      </p>
                      <p className="text-surface-400 text-2xs truncate">
                        By <span className="text-surface-600 dark:text-surface-300 font-medium">{log.actor_name}</span> ({log.actor_role})
                        {log.case_id && <span> • Case #{log.case_id}</span>}
                      </p>
                    </div>
                  </div>
                  <span className="text-surface-400 shrink-0 text-2xs">{formatTimeAgo(log.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Registered Officers Overview (1 Col) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary-500" />
              Officer Roster
            </CardTitle>
            <Link to="/users">
              <Button variant="ghost" size="sm" className="gap-1 text-xs text-primary-600 dark:text-primary-400">
                Manage <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {recentUsers.length === 0 ? (
              <p className="p-4 text-xs text-surface-500 text-center">No officers found.</p>
            ) : (
              recentUsers.map((user) => (
                <div key={user.officer_id} className="p-3 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-surface-900 dark:text-surface-100 truncate">{user.officer_name}</p>
                    <p className="text-surface-400 text-2xs truncate">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        'text-[10px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider',
                        user.role === 'ADMIN'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-primary-500/10 text-primary-600 dark:text-primary-400'
                      )}
                    >
                      {user.role}
                    </span>
                    <span className={cn('h-2 w-2 rounded-full', user.is_active ? 'bg-emerald-500' : 'bg-surface-400')} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Global Investigations Quick Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary-500" />
            Global Investigation Overview
          </CardTitle>
          <Link to="/investigations">
            <Button variant="ghost" size="sm" className="gap-1 text-xs text-primary-600 dark:text-primary-400">
              View All Investigations <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-50 dark:bg-surface-800 text-surface-500 uppercase tracking-wider font-semibold border-y border-surface-200 dark:border-surface-700">
              <tr>
                <th className="px-4 py-2.5">Case Identifier</th>
                <th className="px-4 py-2.5">Investigation Name</th>
                <th className="px-4 py-2.5">Created By</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
              {cases.slice(0, 5).map((c) => (
                <tr key={c.id} className="hover:bg-surface-50/50 dark:hover:bg-surface-800/50 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-primary-600 dark:text-primary-400">
                    {c.case_number || c.id}
                  </td>
                  <td className="px-4 py-3 font-medium text-surface-900 dark:text-surface-100">{c.case_name}</td>
                  <td className="px-4 py-3 text-surface-500">{c.created_by || 'Officer'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-surface-100 dark:bg-surface-800 px-2 py-0.5 text-2xs font-semibold">
                      {c.status || 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/investigations/${c.id}`}>
                      <Button variant="outline" size="xs" className="gap-1">
                        Open Case <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

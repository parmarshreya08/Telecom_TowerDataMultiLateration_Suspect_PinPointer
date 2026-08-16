import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ShieldCheck, Search, RefreshCw, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, AlertCircle, FileCode, X, Eye
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { adminApi } from '@/services/api'
import { cn } from '@/utils'
import type { AuditLogEntry } from '@/types'

const COMMON_ACTIONS = [
  'ALL',
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'USER_CREATED',
  'USER_ACTIVATED',
  'USER_DEACTIVATED',
  'ROLE_CHANGED',
  'CASE_CREATED',
  'CASE_DELETED',
  'CASE_ASSIGNED',
  'FILE_UPLOADED',
  'LOCALIZATION_STARTED',
  'LOCALIZATION_COMPLETED',
  'REPORT_GENERATED',
]

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'FAILURE' | 'DENIED'>('ALL')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // JSON Details Modal
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)

  const loadLogs = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await adminApi.getAuditLogs({
        action: actionFilter !== 'ALL' ? actionFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: search.trim() || undefined,
        page,
        page_size: pageSize,
      })
      setLogs(res.items)
      setTotalPages(res.total_pages || 1)
      setTotalRecords(res.total || 0)
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to load forensic audit logs.')
    } finally {
      setIsLoading(false)
    }
  }, [actionFilter, statusFilter, search, page, pageSize])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-amber-500" />
            Forensic & Security Audit Trail
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            Immutable, timestamped records of all forensic operations, data ingestion, and officer authorization events.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadLogs}
          disabled={isLoading}
          className="gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3.5 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
          <Input
            placeholder="Search action, actor, or case ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Action Filter */}
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value)
              setPage(1)
            }}
            className="rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs text-surface-700 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300"
          >
            {COMMON_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a === 'ALL' ? 'All Event Types' : a.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'ALL' | 'SUCCESS' | 'FAILURE' | 'DENIED')
              setPage(1)
            }}
            className="rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs text-surface-700 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300"
          >
            <option value="ALL">All Outcomes</option>
            <option value="SUCCESS">Success Only</option>
            <option value="FAILURE">Failures</option>
            <option value="DENIED">Access Denied</option>
          </select>
        </div>
      </div>

      {/* Audit Logs Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-50 dark:bg-surface-800 text-surface-500 uppercase tracking-wider font-semibold border-b border-surface-200 dark:border-surface-700">
              <tr>
                <th className="px-4 py-3">Timestamp (IST)</th>
                <th className="px-4 py-3">Event Action</th>
                <th className="px-4 py-3">Actor / Role</th>
                <th className="px-4 py-3">Associated Case</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-surface-400">
                    No audit records match the selected filter.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.log_id} className="hover:bg-surface-50/50 dark:hover:bg-surface-800/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-surface-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        dateStyle: 'short',
                        timeStyle: 'medium',
                      })}
                    </td>
                    <td className="px-4 py-3 font-semibold text-surface-900 dark:text-surface-100">
                      <span className="rounded bg-surface-100 dark:bg-surface-800 px-2 py-0.5 font-mono text-2xs">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-surface-800 dark:text-surface-200 truncate">
                          {log.actor_name}
                        </p>
                        <p className="text-2xs text-surface-400 truncate">
                          {log.actor_role} {log.actor_email && `• ${log.actor_email}`}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {log.case_id ? (
                        <span className="font-mono font-semibold text-primary-600 dark:text-primary-400">
                          {log.case_id}
                        </span>
                      ) : (
                        <span className="text-surface-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-bold uppercase tracking-wider',
                          log.status === 'SUCCESS'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-danger/10 text-danger'
                        )}
                      >
                        {log.status === 'SUCCESS' ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setSelectedLog(log)}
                        className="gap-1 text-surface-600 hover:text-primary-600"
                      >
                        <Eye className="h-3 w-3" />
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-surface-200 dark:border-surface-700 text-xs text-surface-500">
          <div>
            Showing {logs.length} of {totalRecords} events (Page {page} of {totalPages})
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className="gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className="gap-1"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Modal: JSON Details Inspector */}
      <AnimatePresence>
        {selectedLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-700 shadow-2xl p-6 overflow-hidden"
            >
              <div className="flex items-center justify-between pb-4 border-b border-surface-100 dark:border-surface-800">
                <div className="flex items-center gap-2">
                  <FileCode className="h-5 w-5 text-amber-500" />
                  <h3 className="text-base font-bold text-surface-900 dark:text-surface-100">
                    Audit Event Payload
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="p-1 rounded-lg text-surface-400 hover:text-surface-600 dark:hover:text-surface-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 bg-surface-50 dark:bg-surface-800 p-3 rounded-xl">
                  <div>
                    <span className="text-surface-400 font-semibold uppercase text-2xs">Action</span>
                    <p className="font-mono font-bold text-surface-900 dark:text-surface-100 mt-0.5">{selectedLog.action}</p>
                  </div>
                  <div>
                    <span className="text-surface-400 font-semibold uppercase text-2xs">Status</span>
                    <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{selectedLog.status}</p>
                  </div>
                  <div>
                    <span className="text-surface-400 font-semibold uppercase text-2xs">Actor</span>
                    <p className="text-surface-900 dark:text-surface-100 mt-0.5">{selectedLog.actor_name} ({selectedLog.actor_role})</p>
                  </div>
                  <div>
                    <span className="text-surface-400 font-semibold uppercase text-2xs">IP Address</span>
                    <p className="font-mono text-surface-600 dark:text-surface-300 mt-0.5">{selectedLog.ip_address || 'Internal'}</p>
                  </div>
                </div>

                <div>
                  <span className="text-surface-400 font-semibold uppercase text-2xs">Metadata JSON</span>
                  <pre className="mt-1 max-h-60 overflow-y-auto rounded-xl bg-surface-950 p-3 text-2xs text-emerald-400 font-mono">
                    {JSON.stringify(selectedLog.details || {}, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setSelectedLog(null)}>
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

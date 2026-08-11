import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Plus, Search, FolderOpen, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { investigationApi } from '@/services/api'
import { formatTimeAgo, cn } from '@/utils'
import { TRACKING_STATUS_COLORS } from '@/constants'
import type { CaseStatus, Investigation } from '@/types'

const STATUS_TABS: { label: string; value: CaseStatus | 'All' }[] = [
  { label: 'All',       value: 'All'       },
  { label: 'Active',    value: 'Active'    },
  { label: 'Pending',   value: 'Pending'   },
  { label: 'Completed', value: 'Completed' },
  { label: 'Archived',  value: 'Archived'  },
]

export default function InvestigationsPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<CaseStatus | 'All'>('All')
  const [search, setSearch] = useState('')
  const [cases, setCases] = useState<Investigation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCases = useCallback(async () => {
    const res = await investigationApi.list()
    return Array.isArray(res) ? res : res?.items ?? []
  }, [])

  const refresh = useCallback(() => {
    setError(null)
    setIsLoading(true)
    fetchCases()
      .then((items) => setCases(items))
      .catch((err: unknown) => {
        setError((err as Error)?.message || 'Failed to fetch cases from backend')
        setCases([])
      })
      .finally(() => setIsLoading(false))
  }, [fetchCases])

  useEffect(() => {
    let ignore = false
    fetchCases()
      .then((items) => { if (!ignore) setCases(items) })
      .catch((err: unknown) => {
        if (!ignore) {
          setError((err as Error)?.message || 'Failed to fetch cases from backend')
          setCases([])
        }
      })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => {
      ignore = true
    }
  }, [fetchCases])

  const filtered = cases.filter((inv) => {
    const matchesTab = activeTab === 'All' || inv.status === activeTab
    const matchesSearch = !search ||
      (inv.case_name && inv.case_name.toLowerCase().includes(search.toLowerCase())) ||
      (inv.case_number && inv.case_number.toLowerCase().includes(search.toLowerCase())) ||
      (inv.suspect_name && inv.suspect_name.toLowerCase().includes(search.toLowerCase())) ||
      (inv.mobile_number && inv.mobile_number.includes(search))
    return matchesTab && matchesSearch
  })

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">Investigations</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400">{cases.length} total cases</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="md" icon={<RefreshCw className="h-4 w-4" />} onClick={refresh}>
            Refresh
          </Button>
          <Button variant="primary" size="md" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/investigations/new')}>
            New Investigation
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="font-semibold text-sm">Failed to load investigations</p>
              <p className="text-xs">{error}</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={refresh}>
            Retry
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1 max-w-sm">
          <Input
            placeholder="Search case, suspect, mobile..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-surface-200 bg-surface-50 p-1 dark:border-surface-700 dark:bg-surface-800">
          {STATUS_TABS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                activeTab === value
                  ? 'bg-white text-surface-900 shadow-sm dark:bg-surface-700 dark:text-surface-100'
                  : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Cases */}
      {isLoading ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <RefreshCw className="mb-3 h-8 w-8 text-primary-500 animate-spin" />
          <p className="text-sm font-medium text-surface-600 dark:text-surface-300">Loading cases from backend...</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="mb-3 h-10 w-10 text-surface-300 dark:text-surface-600" />
          <p className="text-sm font-medium text-surface-600 dark:text-surface-300">No investigations found</p>
          <p className="mt-1 text-xs text-surface-400 mb-4">Try adjusting your search or upload data to register a new case.</p>
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/upload')}>
            Upload Telecom Data
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((inv, i) => (
            <motion.div
              key={inv.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card hover className="cursor-pointer group" onClick={() => navigate(`/investigations/${inv.id}`)}>
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors',
                    inv.status === 'Active'    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                    inv.status === 'Pending'   ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    inv.status === 'Completed' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                    'bg-surface-100 text-surface-500 dark:bg-surface-700'
                  )}>
                    <FolderOpen className="h-5 w-5" />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-semibold text-sm text-surface-900 dark:text-surface-100 truncate group-hover:text-primary-600 transition-colors">
                        {inv.case_name || inv.id}
                      </p>
                      <Badge variant={
                        inv.status === 'Active' ? 'success' :
                        inv.status === 'Pending' ? 'warning' :
                        inv.status === 'Completed' ? 'primary' : 'neutral'
                      }>
                        {inv.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-500 dark:text-surface-400">
                      <span>Case Ref: {inv.case_number || inv.id}</span>
                      <span>Target: {inv.suspect_name || 'N/A'}</span>
                      <span>By: {inv.created_by || 'Officer'}</span>
                    </div>
                  </div>

                  {/* Tracking status + timestamp */}
                  <div className="hidden sm:flex flex-col items-end gap-1.5 shrink-0">
                    <span className={cn('text-xs font-medium', TRACKING_STATUS_COLORS[inv.tracking_status] || 'text-surface-500 dark:text-surface-400')}>
                      {inv.tracking_status === 'Live' && (
                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-ping-slow" />
                      )}
                      {inv.tracking_status}
                    </span>
                    <span className="text-2xs text-surface-400">
                      {inv.updated_at ? formatTimeAgo(inv.updated_at) : 'Recent'}
                    </span>
                  </div>

                  <ChevronRight className="h-4 w-4 text-surface-400 group-hover:text-primary-500 transition-colors shrink-0" />
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}


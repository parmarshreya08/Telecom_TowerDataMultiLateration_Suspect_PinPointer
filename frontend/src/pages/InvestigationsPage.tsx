import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import { Plus, Search, FolderOpen, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { investigationApi } from '@/services/api'
import { formatTimeAgo, cn, getCaseLifecycleStatus, getCaseStatusBadgeVariant, getCaseStatusIconClasses } from '@/utils'
import { TRACKING_STATUS_COLORS } from '@/constants'
import type { CaseStatus, Investigation } from '@/types'

const ITEMS_PER_PAGE = 10

const STATUS_TABS: { label: string; value: CaseStatus | 'All' }[] = [
  { label: 'All',       value: 'All'       },
  { label: 'Active',    value: 'Active'    },
  { label: 'Pending',   value: 'Pending'   },
  { label: 'Completed', value: 'Completed' },
  { label: 'Archived',  value: 'Archived'  },
]

export default function InvestigationsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState<CaseStatus | 'All'>('All')
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [cases, setCases] = useState<Investigation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(
    (location.state as { message?: string } | null)?.message ?? null
  )

  useEffect(() => {
    if ((location.state as { message?: string } | null)?.message) {
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.pathname, location.state, navigate])

  // Auto-dismiss success banner after 4 seconds
  useEffect(() => {
    if (!successMessage) return
    const t = setTimeout(() => setSuccessMessage(null), 4000)
    return () => clearTimeout(t)
  }, [successMessage])

  // Reset pagination to page 1 on filter or search query change
  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, search])

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

  // Dynamic lifecycle status counts computed from the loaded dataset
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      All: cases.length,
      Active: 0,
      Pending: 0,
      Completed: 0,
      Archived: 0,
      Unknown: 0,
    }
    for (const inv of cases) {
      const status = getCaseLifecycleStatus(inv)
      if (status in counts) {
        counts[status]++
      } else {
        counts.Unknown++
      }
    }
    return counts
  }, [cases])

  const filtered = cases.filter((inv) => {
    const lifecycleStatus = getCaseLifecycleStatus(inv)
    const matchesTab = activeTab === 'All' || lifecycleStatus === activeTab
    const matchesSearch = !search ||
      (inv.case_name && inv.case_name.toLowerCase().includes(search.toLowerCase())) ||
      (inv.case_number && inv.case_number.toLowerCase().includes(search.toLowerCase())) ||
      (inv.suspect_name && inv.suspect_name.toLowerCase().includes(search.toLowerCase())) ||
      (inv.mobile_number && inv.mobile_number.includes(search))
    return matchesTab && matchesSearch
  })

  // Pagination calculations: applied strictly after filtering
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const safePage = Math.min(Math.max(1, currentPage), totalPages)
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  // Clamp current page if items were deleted and previous page index is now out of bounds
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">
            {activeTab === 'All' ? 'All Investigations' : `${activeTab} Investigations`}
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400">
            {cases.length} total {cases.length === 1 ? 'case' : 'cases'}
            {activeTab !== 'All' && ` · ${statusCounts[activeTab] ?? 0} ${activeTab.toLowerCase()}`}
            {search && ` · ${filtered.length} matching search`}
          </p>
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

      {successMessage && (
        <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 text-green-700 dark:text-green-300 text-sm">
          {successMessage}
        </div>
      )}

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
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-surface-200 bg-surface-50 p-1 dark:border-surface-700 dark:bg-surface-800 flex-wrap">
          {STATUS_TABS.map(({ label, value }) => {
            const isSelected = activeTab === value
            const count = statusCounts[value] ?? 0
            return (
              <button
                key={value}
                onClick={() => {
                  setActiveTab(value)
                  setCurrentPage(1)
                }}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer flex items-center gap-1.5',
                  isSelected
                    ? 'bg-white text-surface-900 shadow-sm dark:bg-surface-700 dark:text-surface-100 font-semibold ring-1 ring-black/5 dark:ring-white/10'
                    : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
                )}
              >
                <span>{label}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 text-2xs font-semibold tabular-nums',
                    isSelected
                      ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300'
                      : 'bg-surface-200/80 text-surface-600 dark:bg-surface-700 dark:text-surface-400'
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
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
          <p className="text-sm font-medium text-surface-600 dark:text-surface-300">
            {activeTab !== 'All' ? `No ${activeTab.toLowerCase()} investigations found` : 'No investigations found'}
          </p>
          <p className="mt-1 text-xs text-surface-400 mb-4">Try adjusting your search or upload data to register a new case.</p>
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/upload')}>
            Upload Telecom Data
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {paginated.map((inv, i) => {
            const lifecycleStatus = getCaseLifecycleStatus(inv)
            return (
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
                      getCaseStatusIconClasses(lifecycleStatus)
                    )}>
                      <FolderOpen className="h-5 w-5" />
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="font-semibold text-sm text-surface-900 dark:text-surface-100 truncate group-hover:text-primary-600 transition-colors">
                          {inv.case_name || inv.id}
                        </p>
                        <Badge
                          variant={getCaseStatusBadgeVariant(lifecycleStatus)}
                          className="font-bold text-2xs uppercase tracking-wider px-2 py-0.5"
                        >
                          {lifecycleStatus}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-500 dark:text-surface-400">
                        <span>Case Ref: {inv.case_number || inv.id}</span>
                        <span>Target: {inv.suspect_name || 'N/A'}</span>
                        <span>By: {inv.created_by || 'Officer'}</span>
                      </div>
                    </div>

                    {/* Tracking status + timestamp */}
                    <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0 text-right">
                      <span className="text-2xs font-semibold uppercase tracking-wider text-surface-400">
                        Tracking
                      </span>
                      <span className={cn('text-xs font-medium', TRACKING_STATUS_COLORS[inv.tracking_status || 'Idle'] || 'text-surface-500 dark:text-surface-400')}>
                        {inv.tracking_status === 'Live' && (
                          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-ping-slow" />
                        )}
                        {inv.tracking_status || 'Idle'}
                      </span>
                      <span className="text-2xs text-surface-400">
                        {inv.updated_at ? formatTimeAgo(inv.updated_at) : 'Recent'}
                      </span>
                    </div>

                    <ChevronRight className="h-4 w-4 text-surface-400 group-hover:text-primary-500 transition-colors shrink-0" />
                  </div>
                </Card>
              </motion.div>
            )
          })}

          {/* Pagination Controls */}
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={filtered.length}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </div>
  )
}


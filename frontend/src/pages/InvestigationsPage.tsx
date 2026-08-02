import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Search, FolderOpen, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { MOCK_INVESTIGATIONS } from '@/mock/investigations'
import { formatTimeAgo, cn } from '@/utils'
import { TRACKING_STATUS_COLORS } from '@/constants'
import type { CaseStatus } from '@/types'

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

  const filtered = MOCK_INVESTIGATIONS.filter((inv) => {
    const matchesTab    = activeTab === 'All' || inv.status === activeTab
    const matchesSearch = !search ||
      inv.case_name.toLowerCase().includes(search.toLowerCase()) ||
      inv.case_number.toLowerCase().includes(search.toLowerCase()) ||
      inv.suspect_name.toLowerCase().includes(search.toLowerCase()) ||
      inv.mobile_number.includes(search)
    return matchesTab && matchesSearch
  })

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">Investigations</h1>
          <p className="text-sm text-surface-500">{MOCK_INVESTIGATIONS.length} total cases</p>
        </div>
        <Button variant="primary" size="md" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/investigations/new')}>
          New Investigation
        </Button>
      </div>

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
      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="mb-3 h-10 w-10 text-surface-300" />
          <p className="text-sm font-medium text-surface-500">No investigations found</p>
          <p className="mt-1 text-xs text-surface-400">Try adjusting your search or filter</p>
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
              <Card hover className="cursor-pointer" onClick={() => navigate(`/investigations/${inv.id}`)}>
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
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
                      <p className="font-semibold text-sm text-surface-900 dark:text-surface-100 truncate">
                        {inv.case_name}
                      </p>
                      <Badge variant={
                        inv.status === 'Active' ? 'success' :
                        inv.status === 'Pending' ? 'warning' :
                        inv.status === 'Completed' ? 'primary' : 'neutral'
                      }>
                        {inv.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-surface-500">
                      <span>{inv.case_number}</span>
                      <span>Suspect: {inv.suspect_name}</span>
                      <span>By: {inv.created_by}</span>
                      {inv.uploads[0] && <span>Operator: {inv.uploads[0].operator}</span>}
                    </div>
                  </div>

                  {/* Tracking status + timestamp */}
                  <div className="hidden sm:flex flex-col items-end gap-1.5 shrink-0">
                    <span className={cn('text-xs font-medium', TRACKING_STATUS_COLORS[inv.tracking_status])}>
                      {inv.tracking_status === 'Live' && (
                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-ping-slow" />
                      )}
                      {inv.tracking_status}
                    </span>
                    <span className="text-2xs text-surface-400">{formatTimeAgo(inv.updated_at)}</span>
                  </div>

                  <ChevronRight className="h-4 w-4 text-surface-400 shrink-0" />
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

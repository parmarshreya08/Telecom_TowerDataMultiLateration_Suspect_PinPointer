import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronRight, ChevronDown, FileText, Database, Radio, CheckCircle, Clock, XCircle, Navigation, Map, MapPin, Download, FileJson, Layers, Search, Loader2, Plus
} from 'lucide-react'
import { cn } from '@/utils'
import type { CaseFile, Investigation } from '@/types'
import { investigationApi } from '@/services/api'

export type ExplorerItemType = 'overview' | 'cdr' | 'tower' | 'frame' | 'localization'
export type SelectedItem = { type: ExplorerItemType; id: string | null }

interface InvestigationExplorerProps {
  width?: number
  currentCaseId: string
  currentCaseName: string
  files: CaseFile[]
  towersCount: number
  framesCount: number
  usableFramesCount: number
  fixesCount: number
  selectedItem: SelectedItem
  onSelectItem: (type: ExplorerItemType, id: string | null) => void
  onRunMultilateration: () => void
  isLocalizationRunning: boolean
  onExportClick: (type: 'pdf' | 'csv' | 'kml') => void
  onUploadClick?: () => void
}

function Section({ 
  title, 
  defaultOpen = true, 
  children,
  action 
}: { 
  title: string; 
  defaultOpen?: boolean; 
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="flex flex-col mt-1">
      <div 
        onClick={() => setOpen(!open)}
        className="group flex cursor-pointer items-center justify-between px-2 py-1 text-xs font-semibold uppercase tracking-wider text-surface-500 hover:bg-surface-200/50 dark:hover:bg-surface-800 transition-colors select-none"
      >
        <div className="flex items-center min-w-0">
          {open ? <ChevronDown className="mr-1 h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="mr-1 h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{title}</span>
        </div>
        {action && (
          <div 
            onClick={(e) => e.stopPropagation()}
            className="flex items-center"
          >
            {action}
          </div>
        )}
      </div>
      {open && <div className="flex flex-col pb-1">{children}</div>}
    </div>
  )
}

function Item({ 
  icon, label, subLabel, statusIcon, isActive, onClick, indent = true 
}: { 
  icon: React.ReactNode; label: string; subLabel?: string; statusIcon?: React.ReactNode; isActive?: boolean; onClick?: () => void; indent?: boolean 
}) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "group flex cursor-pointer items-center justify-between py-1 pr-3 text-xs transition-colors border-l-2",
        indent ? "pl-6" : "pl-3",
        isActive 
          ? "border-primary-500 bg-primary-50 text-primary-800 dark:border-primary-500 dark:bg-primary-900/20 dark:text-primary-300" 
          : "border-transparent text-surface-700 hover:bg-surface-200/50 dark:text-surface-300 dark:hover:bg-surface-800"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("shrink-0", isActive ? "text-primary-600 dark:text-primary-400" : "text-surface-500")}>
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      {(subLabel || statusIcon) && (
        <div className="ml-2 flex shrink-0 items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
          {subLabel && <span className="text-2xs text-surface-500 dark:text-surface-400">{subLabel}</span>}
          {statusIcon}
        </div>
      )}
    </div>
  )
}

export function InvestigationExplorer({
  width, currentCaseId, currentCaseName, files, towersCount, framesCount, usableFramesCount, fixesCount, selectedItem, onSelectItem, onRunMultilateration, isLocalizationRunning, onExportClick, onUploadClick
}: InvestigationExplorerProps) {

  const navigate = useNavigate()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [cases, setCases] = useState<Investigation[]>([])
  const [loadingCases, setLoadingCases] = useState(false)
  const [search, setSearch] = useState('')
  const switcherRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (switcherOpen) {
      setLoadingCases(true)
      investigationApi.list({ page_size: 50 })
        .then(res => setCases(res.items || []))
        .catch(() => setCases([]))
        .finally(() => setLoadingCases(false))
    }
  }, [switcherOpen])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredCases = cases.filter(c => {
    const term = search.toLowerCase()
    return (c.id.toLowerCase().includes(term) ||
            (c.case_name || '').toLowerCase().includes(term) ||
            (c.case_number || '').toLowerCase().includes(term) ||
            (c.suspect_name || '').toLowerCase().includes(term))
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <span title="Ingested"><CheckCircle className="h-3 w-3 text-green-500" /></span>
      case 'processing': return <span title="Processing"><Clock className="h-3 w-3 text-yellow-500" /></span>
      case 'failed': return <span title="Failed"><XCircle className="h-3 w-3 text-danger" /></span>
      default: return <span title="Pending"><Clock className="h-3 w-3 text-surface-400" /></span>
    }
  }

  return (
    <div 
      className="flex h-full shrink-0 flex-col overflow-hidden border-r border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-900"
      style={{ width: width ? `${width}px` : undefined }}
    >
      
      {/* Explorer Header */}
      <div className="flex shrink-0 items-center justify-between px-4 py-2 uppercase tracking-wider text-surface-500 text-xs font-semibold">
        Explorer
      </div>

      {/* Case Switcher */}
      <div className="px-2 mb-2 relative" ref={switcherRef}>
        <button
          onClick={() => setSwitcherOpen(!switcherOpen)}
          className="flex w-full items-center justify-between rounded bg-surface-200/50 px-2 py-1.5 text-xs font-medium text-surface-900 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-100 dark:hover:bg-surface-700 transition-colors border border-transparent hover:border-surface-300 dark:hover:border-surface-600"
          title={currentCaseId}
        >
          <span className="truncate pr-2">{currentCaseId}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-surface-500" />
        </button>

        {switcherOpen && (
          <div className="absolute left-2 right-2 top-full mt-1 z-[9999] rounded-md border border-surface-200 bg-white shadow-xl dark:border-surface-600 dark:bg-surface-800 w-[280px]">
            <div className="p-2 border-b border-surface-100 dark:border-surface-700">
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-surface-400" />
                <input
                  type="text"
                  placeholder="Search cases..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded bg-surface-50 py-1.5 pl-7 pr-2 text-xs border border-surface-300 focus:border-primary-500 focus:outline-none dark:border-surface-600 dark:bg-surface-900 dark:text-surface-100"
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto p-1">
              {loadingCases ? (
                <div className="flex justify-center py-4 text-surface-500"><Loader2 className="h-4 w-4 animate-spin" /></div>
              ) : filteredCases.length > 0 ? (
                filteredCases.map(c => {
                  const isActive = c.id === currentCaseId
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSwitcherOpen(false)
                        if (!isActive) navigate(`/investigations/${c.id}/live`)
                      }}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 transition-colors",
                        isActive ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-surface-100 dark:hover:bg-surface-700"
                      )}
                    >
                      <div className="mt-0.5 flex shrink-0 items-center justify-center w-3 h-3">
                        {isActive ? <CheckCircle className="h-3 w-3 text-primary-600 dark:text-primary-400" /> : <div className="h-1.5 w-1.5 rounded-full border border-surface-400 dark:border-surface-500" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={cn("truncate text-xs font-medium", isActive ? "text-primary-700 dark:text-primary-300" : "text-surface-900 dark:text-surface-100")}>
                          {c.id}
                        </div>
                        <div className="truncate text-2xs text-surface-500 dark:text-surface-400">
                          {c.case_name || 'Unnamed Case'}
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="py-3 text-center text-xs text-surface-500">No cases found</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        
        {/* OVERVIEW */}
        <Section title="Overview">
          <Item 
            icon={<Radio className="h-3.5 w-3.5" />} 
            label="Investigation Details" 
            isActive={selectedItem.type === 'overview'} 
            onClick={() => onSelectItem('overview', null)} 
          />
        </Section>

        {/* CDR DATA */}
        <Section 
          title="CDR Data"
          action={
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (onUploadClick) {
                  onUploadClick()
                } else if (currentCaseId) {
                  navigate(`/investigations/${currentCaseId}/upload`)
                }
              }}
              title="Upload CDR file"
              aria-label="Upload CDR file"
              className="flex h-5 w-5 items-center justify-center rounded text-surface-500 hover:bg-surface-300/50 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-700 dark:hover:text-surface-100 transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          }
        >
          {files.length === 0 ? (
            <div className="pl-8 py-1 text-xs text-surface-400 italic">No files uploaded.</div>
          ) : (
            files.map(file => (
              <Item 
                key={file.upload_id}
                icon={<FileText className="h-3.5 w-3.5" />} 
                label={file.original_filename} 
                statusIcon={getStatusIcon(file.upload_status)}
                isActive={selectedItem.type === 'cdr' && selectedItem.id === file.upload_id} 
                onClick={() => onSelectItem('cdr', file.upload_id)} 
              />
            ))
          )}
        </Section>

        {/* TOWER DATA */}
        <Section title="Tower Data">
          <Item 
            icon={<Database className="h-3.5 w-3.5" />} 
            label="Global Tower DB" 
            subLabel={`${towersCount} towers`}
            isActive={selectedItem.type === 'tower'} 
            onClick={() => onSelectItem('tower', null)} 
          />
        </Section>

        {/* MEASUREMENT FRAMES */}
        <Section title="Measurement Frames">
          <Item 
            icon={<Layers className="h-3.5 w-3.5" />} 
            label={`${framesCount.toLocaleString()} Total Frames`} 
            isActive={selectedItem.type === 'frame'} 
            onClick={() => onSelectItem('frame', null)} 
          />
          {usableFramesCount > 0 && (
            <div className="pl-10 pr-3 py-1 text-2xs text-surface-500 dark:text-surface-400">
              <span className="text-green-600 dark:text-green-400 font-medium">{usableFramesCount.toLocaleString()}</span> usable (≥ 3 towers)
            </div>
          )}
        </Section>

        {/* LOCALIZATION */}
        <Section title="Localization">
          <Item 
            icon={<Navigation className="h-3.5 w-3.5" />} 
            label="Fixes Generated" 
            subLabel={fixesCount.toString()}
            isActive={selectedItem.type === 'localization'} 
            onClick={() => onSelectItem('localization', null)} 
          />
          <Item 
            icon={<Map className="h-3.5 w-3.5" />} 
            label="Heatmap / KDE" 
          />
          <Item 
            icon={<MapPin className="h-3.5 w-3.5" />} 
            label="Movement Trace" 
          />
          <div className="px-6 py-2">
            <button 
              onClick={onRunMultilateration}
              disabled={isLocalizationRunning || usableFramesCount === 0}
              className="w-full rounded border border-surface-300 bg-white px-2 py-1 text-xs font-medium text-surface-700 shadow-sm hover:bg-surface-100 disabled:opacity-50 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200 dark:hover:bg-surface-700 transition-colors"
            >
              {isLocalizationRunning ? 'Running...' : 'Run Engine'}
            </button>
          </div>
        </Section>

        {/* REPORTS */}
        <Section title="Reports" defaultOpen={false}>
          <Item 
            icon={<Download className="h-3.5 w-3.5" />} 
            label="Export PDF Report" 
            onClick={() => onExportClick('pdf')}
          />
          <Item 
            icon={<FileJson className="h-3.5 w-3.5" />} 
            label="Export CSV Data" 
            onClick={() => onExportClick('csv')}
          />
          <Item 
            icon={<Map className="h-3.5 w-3.5" />} 
            label="Export KML Trace" 
            onClick={() => onExportClick('kml')}
          />
        </Section>

      </div>

      {/* New Investigation Action */}
      <div className="shrink-0 border-t border-surface-200 p-2 dark:border-surface-700 bg-surface-50 dark:bg-surface-900">
        <button
          type="button"
          onClick={() => navigate('/investigations/new')}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-surface-300 py-1.5 px-3 text-xs font-medium text-surface-600 hover:border-primary-500 hover:bg-primary-50/50 hover:text-primary-700 dark:border-surface-700 dark:text-surface-400 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-300 transition-colors cursor-pointer"
          title="Create New Investigation"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Investigation</span>
        </button>
      </div>
    </div>
  )
}

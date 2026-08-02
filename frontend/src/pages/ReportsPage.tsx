import { useState } from 'react'
import { motion } from 'framer-motion'
import { FileText, Download, FileSpreadsheet, File, Braces, Map } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { MOCK_INVESTIGATIONS } from '@/mock/investigations'
import { formatDateTime, formatFileSize } from '@/utils'

const EXPORT_FORMATS = [
  { value: 'pdf',     label: 'PDF Report',        icon: FileText,       desc: 'Full investigation summary with map snapshot' },
  { value: 'excel',   label: 'Excel Spreadsheet',  icon: FileSpreadsheet,desc: 'CDR records and location data in Excel format' },
  { value: 'csv',     label: 'CSV Data',           icon: File,           desc: 'Raw CDR and location data as CSV' },
  { value: 'json',    label: 'JSON Data',          icon: Braces,         desc: 'Machine-readable structured JSON export' },
  { value: 'geojson', label: 'GeoJSON Map Data',   icon: Map,            desc: 'Heatmap and path data for GIS applications' },
]

const MOCK_REPORTS = [
  { id: 'r1', inv_name: 'Operation Phantom Signal', case_num: 'CASE-2026-SRT-1042', format: 'pdf',   size: 2_450_000, generated_at: '2026-08-02T09:30:00Z', by: 'Inspector Rajesh Kumar' },
  { id: 'r2', inv_name: 'Cyber Extortion Ring',     case_num: 'CASE-2026-SRT-1028', format: 'excel', size:   820_000, generated_at: '2026-07-22T17:05:00Z', by: 'Inspector Rajesh Kumar' },
  { id: 'r3', inv_name: 'Cyber Extortion Ring',     case_num: 'CASE-2026-SRT-1028', format: 'geojson',size: 124_000,  generated_at: '2026-07-22T17:00:00Z', by: 'Inspector Rajesh Kumar' },
]

const formatIcon: Record<string, React.ElementType> = {
  pdf: FileText, excel: FileSpreadsheet, csv: File, json: Braces, geojson: Map,
}

export default function ReportsPage() {
  const [selectedInv, setSelectedInv] = useState('inv-001')
  const [generating, setGenerating]   = useState<string | null>(null)

  const handleGenerate = async (format: string) => {
    setGenerating(format)
    // TODO: reportApi.generate(selectedInv, format)
    await new Promise((r) => setTimeout(r, 1500))
    setGenerating(null)
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">Reports & Exports</h1>
        <p className="text-sm text-surface-500">Generate and download investigation reports in multiple formats</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Generate Report */}
        <div className="space-y-5 lg:col-span-2">
          {/* Select Investigation */}
          <Card>
            <CardHeader><CardTitle>Generate New Report</CardTitle></CardHeader>
            <div className="mb-4">
              <label className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-2 block">Select Investigation</label>
              <div className="space-y-2">
                {MOCK_INVESTIGATIONS.map((inv) => (
                  <label
                    key={inv.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedInv === inv.id
                        ? 'border-primary-400 bg-primary-50 dark:border-primary-600 dark:bg-primary-950/20'
                        : 'border-surface-200 dark:border-surface-700 hover:border-surface-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="inv"
                      value={inv.id}
                      checked={selectedInv === inv.id}
                      onChange={() => setSelectedInv(inv.id)}
                      className="accent-primary-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-800 dark:text-surface-200">{inv.case_name}</p>
                      <p className="text-xs text-surface-400">{inv.case_number}</p>
                    </div>
                    <Badge variant={inv.status === 'Active' ? 'success' : inv.status === 'Completed' ? 'primary' : 'warning'}>
                      {inv.status}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-3 block">Export Format</label>
              <div className="grid gap-3 sm:grid-cols-2">
                {EXPORT_FORMATS.map(({ value, label, icon: Icon, desc }) => (
                  <motion.button
                    key={value}
                    className="flex items-start gap-3 rounded-lg border border-surface-200 p-3 text-left hover:border-primary-400 hover:bg-primary-50/50 dark:border-surface-700 dark:hover:border-primary-600 dark:hover:bg-primary-950/10 transition-colors"
                    onClick={() => handleGenerate(value)}
                    whileTap={{ scale: 0.98 }}
                    disabled={generating === value}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                      {generating === value
                        ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
                        : <Icon className="h-4 w-4" />
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium text-surface-800 dark:text-surface-200">{label}</p>
                      <p className="text-xs text-surface-400">{desc}</p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Recent Reports */}
        <div>
          <Card>
            <CardHeader><CardTitle>Recent Exports</CardTitle></CardHeader>
            <div className="space-y-3">
              {MOCK_REPORTS.map((r) => {
                const Icon = formatIcon[r.format] ?? FileText
                return (
                  <div key={r.id} className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-surface-800 dark:text-surface-200 truncate">{r.inv_name}</p>
                      <p className="text-2xs text-surface-400">{r.format.toUpperCase()} · {formatFileSize(r.size)}</p>
                      <p className="text-2xs text-surface-400">{formatDateTime(r.generated_at)}</p>
                    </div>
                    <button
                      className="text-primary-600 hover:text-primary-700 transition-colors"
                      title="Download"
                      onClick={() => {
                        // TODO: reportApi.download(r.id)
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

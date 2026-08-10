import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  FileText, Download, Braces, Map, Shield, RefreshCw,
  AlertCircle, Printer, Clock, Globe, Copy, Check,
} from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { investigationApi, reportApi, trackingApi, exportApi } from '@/services/api'
import { downloadBlob } from '@/utils'
import type { ForensicReport, Investigation } from '@/types'
import { formatDateTime } from '@/utils'

const EXPORT_FORMATS = [
  { value: 'pdf',     label: 'PDF Forensic Report', icon: FileText, desc: 'Court-admissible report with fixes, methodology, and confidence analysis' },
  { value: 'csv',     label: 'CSV Data Export',     icon: Download, desc: 'Tabular fix data for Excel and cross-referencing' },
  { value: 'kml',     label: 'KML Map Layer',       icon: Map,      desc: 'Open in Google Earth with path and fix points' },
  { value: 'json',    label: 'Forensic JSON',       icon: Braces,   desc: 'Structured forensic report for system integration' },
  { value: 'geojson', label: 'GeoJSON Map Layer',   icon: Globe,    desc: 'Fix points and confidence ellipses for GIS tools' },
]

export default function ReportsPage() {
  const [cases, setCases] = useState<Investigation[]>([])
  const [selectedInv, setSelectedInv] = useState('')
  const [loadingCases, setLoadingCases] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [report, setReport] = useState<ForensicReport | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Time range filter
  const [timeStart, setTimeStart] = useState('')
  const [timeEnd, setTimeEnd] = useState('')

  const fetchCases = async () => {
    setLoadingCases(true)
    try {
      const res = await investigationApi.list()
      const raw = Array.isArray(res) ? res : res?.items ?? []
      setCases(raw)
      if (raw.length > 0 && !selectedInv) {
        setSelectedInv(raw[0].id)
      }
    } catch {
      setCases([])
    } finally {
      setLoadingCases(false)
    }
  }

  useEffect(() => {
    fetchCases()
  }, [])

  const getExportParams = () => {
    const params: Record<string, string> = {}
    if (timeStart) params.start = timeStart
    if (timeEnd) params.end = timeEnd
    return params
  }

  const handleGenerate = async (format: string) => {
    if (!selectedInv) return
    setGenerating(format)
    setReportError(null)

    try {
      if (format === 'json') {
        const data = await reportApi.getForensicReport(selectedInv)
        setReport(data)
      } else if (format === 'geojson') {
        const geoData = await trackingApi.getGeoJSON(selectedInv, timeStart || undefined, timeEnd || undefined)
        const blob = new Blob([JSON.stringify(geoData, null, 2)], { type: 'application/geo+json' })
        downloadBlob(blob, `e-rakshak_${selectedInv}_fixes.geojson`)
      } else if (format === 'pdf') {
        const blob = await exportApi.downloadPDF(selectedInv, getExportParams())
        downloadBlob(blob, `e-rakshak_${selectedInv}_forensic_report.pdf`)
      } else if (format === 'csv') {
        const blob = await exportApi.downloadCSV(selectedInv, getExportParams())
        downloadBlob(blob, `e-rakshak_${selectedInv}_fixes.csv`)
      } else if (format === 'kml') {
        const blob = await exportApi.downloadKML(selectedInv, getExportParams())
        downloadBlob(blob, `e-rakshak_${selectedInv}_fixes.kml`)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? (err as Error)?.message ?? 'Export failed. Run localization on this case first.'
      setReportError(msg)
    } finally {
      setGenerating(null)
    }
  }

  const handleDownloadJSON = () => {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `forensic_report_${report.case_id}.json`)
  }

  const handleGoogleMapsLink = () => {
    if (!report) return
    const sub = report.subscribers?.[0]
    if (!sub?.centroid) return
    const url = `https://www.google.com/maps?q=${sub.centroid.latitude},${sub.centroid.longitude}&z=15`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">Forensic Reports & Exports</h1>
        <p className="text-sm text-surface-500">Generate court-admissible forensic localization reports from real database telemetry</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Generate Report */}
        <div className="space-y-5 lg:col-span-2">
          {/* Select Investigation */}
          <Card>
            <CardHeader>
              <CardTitle>Select Investigation Case</CardTitle>
              <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={fetchCases}>
                Refresh
              </Button>
            </CardHeader>

            {loadingCases ? (
              <div className="py-8 text-center text-sm text-surface-400">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary-500" />
                Loading cases from database...
              </div>
            ) : cases.length === 0 ? (
              <div className="py-8 text-center text-sm text-surface-400">
                No cases found in database. Ingest CDR/tower logs first.
              </div>
            ) : (
              <div className="mb-4 space-y-2">
                {cases.map((inv) => (
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
                      <p className="text-sm font-medium text-surface-800 dark:text-surface-200">{inv.case_name || inv.id}</p>
                      <p className="text-xs text-surface-400">{inv.case_number || inv.id}</p>
                    </div>
                    <Badge variant={inv.status === 'Active' ? 'success' : inv.status === 'Completed' ? 'primary' : 'warning'}>
                      {inv.status}
                    </Badge>
                  </label>
                ))}
              </div>
            )}

            {/* Time Range Filter */}
            <div className="border-t border-surface-100 dark:border-surface-700 pt-4 mt-2">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-3.5 w-3.5 text-surface-400" />
                <label className="text-xs font-medium text-surface-500 uppercase tracking-wider">Time Range (Optional)</label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-2xs text-surface-400 block mb-1">Start</label>
                  <input
                    type="datetime-local"
                    value={timeStart}
                    onChange={(e) => setTimeStart(e.target.value)}
                    className="w-full rounded-lg border border-surface-300 bg-white px-2.5 py-1.5 text-xs
                               dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200"
                  />
                </div>
                <div>
                  <label className="text-2xs text-surface-400 block mb-1">End</label>
                  <input
                    type="datetime-local"
                    value={timeEnd}
                    onChange={(e) => setTimeEnd(e.target.value)}
                    className="w-full rounded-lg border border-surface-300 bg-white px-2.5 py-1.5 text-xs
                               dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200"
                  />
                </div>
              </div>
              {(timeStart || timeEnd) && (
                <p className="text-2xs text-primary-600 dark:text-primary-400 mt-2">
                  Exports will include only fixes within the selected time range.
                </p>
              )}
            </div>

            {/* Export Formats */}
            <div className="mt-4">
              <label className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-3 block">Export Format</label>
              <div className="grid gap-3 sm:grid-cols-2">
                {EXPORT_FORMATS.map(({ value, label, icon: Icon, desc }) => (
                  <motion.button
                    key={value}
                    className="flex items-start gap-3 rounded-lg border border-surface-200 p-3 text-left hover:border-primary-400 hover:bg-primary-50/50 dark:border-surface-700 dark:hover:border-primary-600 dark:hover:bg-primary-950/10 transition-colors"
                    onClick={() => handleGenerate(value)}
                    whileTap={{ scale: 0.98 }}
                    disabled={generating === value || !selectedInv}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                      {generating === value
                        ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
                        : <Icon className="h-4 w-4" />
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium text-surface-800 dark:text-surface-200">{label}</p>
                      <p className="text-2xs text-surface-400 mt-0.5">{desc}</p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </Card>

          {reportError && (
            <div className="flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 p-4 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
              <div>
                <p className="font-semibold">Unable to Generate Report</p>
                <p className="mt-0.5">{reportError}</p>
              </div>
            </div>
          )}

          {/* Forensic Report Preview (JSON inline) */}
          {report && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Court-Admissible Forensic Report</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>
                      Print
                    </Button>
                    <Button size="sm" variant="primary" icon={<Download className="h-3.5 w-3.5" />} onClick={handleDownloadJSON}>
                      Download JSON
                    </Button>
                    <Button
                      size="sm" variant="secondary"
                      icon={copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                      onClick={handleGoogleMapsLink}
                    >
                      {copied ? 'Copied!' : 'Copy Maps Link'}
                    </Button>
                  </div>
                </CardHeader>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-lg bg-surface-50 p-4 dark:bg-surface-800">
                    <Shield className="h-8 w-8 text-primary-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">Report Reference: {report.report_id}</p>
                      <p className="text-xs text-surface-400">Generated {formatDateTime(report.generated_at)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-800">
                      <p className="text-2xs text-surface-400">Algorithm</p>
                      <p className="text-xs font-semibold text-surface-800 dark:text-surface-200 mt-0.5">{report.methodology?.algorithm || 'Trilateration'}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-800">
                      <p className="text-2xs text-surface-400">Confidence Level</p>
                      <p className="text-xs font-semibold text-surface-800 dark:text-surface-200 mt-0.5">{((report.methodology?.confidence_level || 0.95) * 100).toFixed(0)}%</p>
                    </div>
                    <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-800">
                      <p className="text-2xs text-surface-400">Fix Count</p>
                      <p className="text-xs font-semibold text-surface-800 dark:text-surface-200 mt-0.5">{report.summary?.fix_count || 0}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-800">
                      <p className="text-2xs text-surface-400">Subscribers</p>
                      <p className="text-xs font-semibold text-surface-800 dark:text-surface-200 mt-0.5">{report.summary?.subscriber_count || 0}</p>
                    </div>
                  </div>

                  {report.subscribers && report.subscribers.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-surface-500 mb-2">Subscriber Analysis</p>
                      {report.subscribers.map((sub) => (
                        <div key={sub.subscriber_identifier} className="rounded-lg border border-surface-200 p-3 dark:border-surface-700">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">{sub.subscriber_identifier}</p>
                            <span className="text-xs font-medium text-primary-600 dark:text-primary-400">{sub.fix_count} fixes computed</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-surface-500">
                            <span>Centroid Lat/Lon: {sub.centroid?.latitude?.toFixed(4)}, {sub.centroid?.longitude?.toFixed(4)}</span>
                            <span>Mean Confidence Radius: ±{sub.confidence?.mean_meters?.toFixed(0)}m</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          )}
        </div>

        {/* Info Sidebar */}
        <div>
          <Card>
            <CardHeader><CardTitle>Report Standards</CardTitle></CardHeader>
            <div className="space-y-3 text-xs text-surface-500">
              <p>
                E-Rakshak reports adhere to digital evidence preservation standards under the Indian Evidence Act / Bharatiya Sakshya Adhiniyam.
              </p>
              <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-800 space-y-1">
                <p className="font-semibold text-surface-700 dark:text-surface-300">Included In Forensic Exports:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>JPL Multilateration Residuals</li>
                  <li>Kalman Filter Innovation Covariance</li>
                  <li>Timing Advance (TA) Band Geometry</li>
                  <li>Sector Wedge Intersections</li>
                  <li>95% Confidence Radius</li>
                  <li>Timestamped Audit Trail</li>
                </ul>
              </div>
              <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-800 space-y-1">
                <p className="font-semibold text-surface-700 dark:text-surface-300">Export Formats:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li><b>PDF</b> — Court-admissible forensic report</li>
                  <li><b>CSV</b> — Tabular data for Excel</li>
                  <li><b>KML</b> — Google Earth map layer</li>
                  <li><b>JSON</b> — Structured forensic data</li>
                  <li><b>GeoJSON</b> — GIS-compatible map layer</li>
                </ul>
              </div>
              <div className="p-3 rounded-lg bg-primary-50 dark:bg-primary-950/20 border border-primary-200 dark:border-primary-800">
                <p className="font-semibold text-primary-700 dark:text-primary-300 text-2xs uppercase tracking-wider mb-1">Time Range Filter</p>
                <p className="text-primary-600 dark:text-primary-400">
                  Set a start and end time to export only the fixes within that window. All formats respect the filter.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

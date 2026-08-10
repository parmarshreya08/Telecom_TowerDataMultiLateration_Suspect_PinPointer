import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  ArrowLeft, Upload, MapPin, FileText, Plus, RefreshCw, AlertCircle, Clock, CheckCircle2, FolderOpen,
} from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { investigationApi, trackingApi } from '@/services/api'
import type { Investigation, UploadMetadata } from '@/types'
import { formatDateTime, formatFileSize, cn } from '@/utils'
import { TRACKING_STATUS_COLORS, OPERATOR_COLORS } from '@/constants'

export default function InvestigationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [inv, setInv] = useState<Investigation | null>(null)
  const [uploads, setUploads] = useState<UploadMetadata[]>([])
  const [events, setEvents] = useState<unknown[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDetails = async () => {
    if (!id) return
    setIsLoading(true)
    setError(null)
    try {
      const [caseData, uploadsData, eventsData] = await Promise.allSettled([
        investigationApi.getById(id),
        trackingApi.getCaseUploads(id),
        investigationApi.getCaseEvents(id, 100),
      ])

      if (caseData.status === 'fulfilled') {
        setInv(caseData.value)
      } else {
        setError('Investigation not found')
      }

      if (uploadsData.status === 'fulfilled') {
        const raw = uploadsData.value?.uploads ?? []
        setUploads(raw as UploadMetadata[])
      }

      if (eventsData.status === 'fulfilled') {
        const evs = eventsData.value?.events ?? []
        setEvents(evs)
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to load investigation details')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDetails()
  }, [id])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <RefreshCw className="h-8 w-8 text-primary-500 animate-spin mb-3" />
        <p className="text-sm font-medium text-surface-600 dark:text-surface-300">Loading case details...</p>
      </div>
    )
  }

  if (error && !inv) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100">Error Loading Case</h2>
        <p className="text-sm text-surface-500 mt-1 mb-4">{error}</p>
        <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/investigations')}>
          Back to Investigations
        </Button>
      </div>
    )
  }

  const currentInv = inv!

  return (
    <div className="max-w-5xl space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate('/investigations')}
        className="flex items-center gap-2 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Investigations
      </button>

      {/* Header */}
      <motion.div
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
            <FolderOpen className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">
                {currentInv.case_name || currentInv.id}
              </h1>
              <Badge variant={
                currentInv.status === 'Active' ? 'success' :
                currentInv.status === 'Pending' ? 'warning' :
                currentInv.status === 'Completed' ? 'primary' : 'neutral'
              }>{currentInv.status}</Badge>
            </div>
            <p className="text-sm text-surface-500">Case ID: {currentInv.case_number || currentInv.id} · Created by {currentInv.created_by || 'Officer'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={fetchDetails}>
            Refresh
          </Button>
          <Button size="sm" variant="primary" icon={<MapPin className="h-4 w-4" />} onClick={() => navigate(`/investigations/${currentInv.id}/live`)}>
            Live Map & Multilateration
          </Button>
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Case Info */}
          <Card>
            <CardHeader><CardTitle>Case Overview</CardTitle></CardHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: 'Case Number', value: currentInv.case_number || currentInv.id },
                { label: 'Suspect / Target', value: currentInv.suspect_name || 'Target' },
                { label: 'Mobile Number', value: currentInv.mobile_number || 'N/A' },
                { label: 'Ingested Uploads', value: uploads.length.toString() },
                { label: 'Subscriber Records', value: events.length.toString() },
                { label: 'Tracking Status', value: currentInv.tracking_status || 'Idle', highlight: true },
              ].map(({ label, value, highlight }) => (
                <div key={label}>
                  <p className="text-2xs text-surface-400 mb-0.5">{label}</p>
                  <p className={cn('text-sm font-medium', highlight ? (TRACKING_STATUS_COLORS[currentInv.tracking_status] || 'text-surface-700') : 'text-surface-800 dark:text-surface-200')}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
            {currentInv.description && (
              <div className="mt-4 pt-4 border-t border-surface-100 dark:border-surface-700">
                <p className="text-2xs text-surface-400 mb-1">Description</p>
                <p className="text-sm text-surface-600 dark:text-surface-400">{currentInv.description}</p>
              </div>
            )}
            {currentInv.officer_notes && (
              <div className="mt-3">
                <p className="text-2xs text-surface-400 mb-1">Officer Notes</p>
                <p className="text-sm text-surface-600 dark:text-surface-400 italic">{currentInv.officer_notes}</p>
              </div>
            )}
          </Card>

          {/* Uploads */}
          <Card>
            <CardHeader>
              <CardTitle>CDR Uploads ({uploads.length})</CardTitle>
              <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate(`/investigations/${currentInv.id}/upload`)}>
                Upload File
              </Button>
            </CardHeader>
            {uploads.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Upload className="h-8 w-8 text-surface-300 dark:text-surface-600" />
                <div>
                  <p className="text-sm font-medium text-surface-600 dark:text-surface-300">No CDR files uploaded for this case</p>
                  <p className="text-xs text-surface-400">Upload a CDR file to start localization and analysis.</p>
                </div>
                <Button size="sm" variant="primary" onClick={() => navigate(`/investigations/${currentInv.id}/upload`)}>
                  Upload File
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {uploads.map((up) => (
                  <div key={up.upload_id} className="flex items-center gap-3 rounded-lg border border-surface-100 p-3 dark:border-surface-700">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">{up.original_filename}</p>
                      <p className="text-xs text-surface-400">
                        {formatFileSize(up.file_size_bytes)} · {up.uploaded_at ? formatDateTime(up.uploaded_at) : 'Uploaded'}
                      </p>
                    </div>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', OPERATOR_COLORS[up.operator] || 'bg-surface-100 text-surface-600')}>
                      {up.operator || 'Telecom'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Quick Actions */}
          <Card>
            <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
            <div className="space-y-2">
              <Button size="md" variant="primary" className="w-full justify-start" icon={<MapPin className="h-4 w-4" />} onClick={() => navigate(`/investigations/${currentInv.id}/live`)}>
                Open Multilateration Map
              </Button>
              <Button size="md" variant="secondary" className="w-full justify-start" icon={<Upload className="h-4 w-4" />} onClick={() => navigate(`/investigations/${currentInv.id}/upload`)}>
                Upload CDR File
              </Button>
              <Button size="md" variant="secondary" className="w-full justify-start" icon={<FileText className="h-4 w-4" />} onClick={() => navigate('/reports')}>
                View Forensic Report
              </Button>
            </div>
          </Card>

          {/* Real Ingested Activity Summary */}
          <Card>
            <CardHeader><CardTitle>Ingestion Summary</CardTitle></CardHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-50 dark:bg-surface-800">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-surface-800 dark:text-surface-200">{uploads.length} Files Ingested</p>
                  <p className="text-surface-400">Validated against PostGIS DB</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-50 dark:bg-surface-800">
                <Clock className="h-5 w-5 text-blue-500 shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-surface-800 dark:text-surface-200">{events.length} Telemetry Records</p>
                  <p className="text-surface-400">Ready for multilateration engine</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}


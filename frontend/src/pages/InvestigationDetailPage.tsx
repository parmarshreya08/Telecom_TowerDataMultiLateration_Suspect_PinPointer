import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Upload, MapPin, FileText, Edit, Plus,
} from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { InvestigationTimeline } from '@/components/investigation/InvestigationTimeline'
import { MOCK_INVESTIGATIONS } from '@/mock/investigations'
import { formatDateTime, formatFileSize, cn } from '@/utils'
import { TRACKING_STATUS_COLORS, OPERATOR_COLORS } from '@/constants'

export default function InvestigationDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const inv = MOCK_INVESTIGATIONS.find((i) => i.id === id) ?? MOCK_INVESTIGATIONS[0]

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
        className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">{inv.case_name}</h1>
            <Badge variant={
              inv.status === 'Active' ? 'success' :
              inv.status === 'Pending' ? 'warning' :
              inv.status === 'Completed' ? 'primary' : 'neutral'
            }>{inv.status}</Badge>
          </div>
          <p className="text-sm text-surface-500">{inv.case_number} · Created by {inv.created_by}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="secondary" icon={<Edit className="h-4 w-4" />}>Edit</Button>
          <Button size="sm" variant="primary" icon={<MapPin className="h-4 w-4" />} onClick={() => navigate(`/investigations/${inv.id}/live`)}>
            Live Tracking
          </Button>
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Case Info */}
          <Card>
            <CardHeader><CardTitle>Case Details</CardTitle></CardHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: 'Case Number',    value: inv.case_number },
                { label: 'Suspect Name',  value: inv.suspect_name },
                { label: 'Mobile Number', value: inv.mobile_number },
                { label: 'Created',       value: formatDateTime(inv.created_at) },
                { label: 'Last Updated',  value: formatDateTime(inv.updated_at) },
                { label: 'Tracking',      value: inv.tracking_status, highlight: true },
              ].map(({ label, value, highlight }) => (
                <div key={label}>
                  <p className="text-2xs text-surface-400 mb-0.5">{label}</p>
                  <p className={cn('text-sm font-medium', highlight ? TRACKING_STATUS_COLORS[inv.tracking_status] : 'text-surface-800 dark:text-surface-200')}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
            {inv.description && (
              <div className="mt-4 pt-4 border-t border-surface-100 dark:border-surface-700">
                <p className="text-2xs text-surface-400 mb-1">Description</p>
                <p className="text-sm text-surface-600 dark:text-surface-400">{inv.description}</p>
              </div>
            )}
            {inv.officer_notes && (
              <div className="mt-3">
                <p className="text-2xs text-surface-400 mb-1">Officer Notes</p>
                <p className="text-sm text-surface-600 dark:text-surface-400 italic">{inv.officer_notes}</p>
              </div>
            )}
          </Card>

          {/* Uploads */}
          <Card>
            <CardHeader>
              <CardTitle>CDR Uploads ({inv.uploads.length})</CardTitle>
              <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate(`/investigations/${inv.id}/upload`)}>
                Upload CDR
              </Button>
            </CardHeader>
            {inv.uploads.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Upload className="h-8 w-8 text-surface-300" />
                <div>
                  <p className="text-sm text-surface-500">No CDR files uploaded yet</p>
                  <p className="text-xs text-surface-400">Upload a CDR file to start tracking</p>
                </div>
                <Button size="sm" variant="primary" onClick={() => navigate(`/investigations/${inv.id}/upload`)}>
                  Upload CDR File
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {inv.uploads.map((up) => (
                  <div key={up.upload_id} className="flex items-center gap-3 rounded-lg border border-surface-100 p-3 dark:border-surface-700">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">{up.original_filename}</p>
                      <p className="text-xs text-surface-400">{formatFileSize(up.file_size_bytes)} · {formatDateTime(up.uploaded_at)}</p>
                    </div>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', OPERATOR_COLORS[up.operator])}>
                      {up.operator}
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
              <Button size="md" variant="primary" className="w-full justify-start" icon={<MapPin className="h-4 w-4" />} onClick={() => navigate(`/investigations/${inv.id}/live`)}>
                Open Live Tracking
              </Button>
              <Button size="md" variant="secondary" className="w-full justify-start" icon={<Upload className="h-4 w-4" />} onClick={() => navigate(`/investigations/${inv.id}/upload`)}>
                Upload Additional CDR
              </Button>
              <Button size="md" variant="secondary" className="w-full justify-start" icon={<FileText className="h-4 w-4" />} onClick={() => navigate('/reports')}>
                View Reports
              </Button>
            </div>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <InvestigationTimeline events={inv.timeline} />
          </Card>
        </div>
      </div>
    </div>
  )
}

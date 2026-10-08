import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { AxiosError } from 'axios'
import { motion } from 'motion/react'
import {
  ArrowLeft, Upload, MapPin, FileText, Plus, RefreshCw, AlertCircle, Clock, CheckCircle2, FolderOpen, Trash2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Dropdown } from '@/components/ui/Dropdown'
import { Tooltip } from '@/components/ui/Tooltip'
import { fileApi, investigationApi, trackingApi, adminApi, formatDeleteError } from '@/services/api'
import { getStoredOfficer } from '@/services/auth'
import { CaseStatusSelector } from '@/components/investigation/CaseStatusSelector'
import { CdrUploadModal } from '@/components/investigation/CdrUploadModal'
import { formatDateTime, formatFileSize, cn } from '@/utils'
import { TRACKING_STATUS_COLORS, OPERATOR_COLORS } from '@/constants'
import type { Investigation, UploadMetadata, CaseAssignment, AdminUser, QualityReport } from '@/types'
import { UserCheck, UserPlus, UserMinus } from 'lucide-react'

export default function InvestigationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [inv, setInv] = useState<Investigation | null>(null)
  const [uploads, setUploads] = useState<UploadMetadata[]>([])
  const [events, setEvents] = useState<unknown[]>([])
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteCdrTarget, setDeleteCdrTarget] = useState<{ id: string; name: string } | null>(null)
  const [showDeleteCaseConfirm, setShowDeleteCaseConfirm] = useState(false)
  const [deletingCdrId, setDeletingCdrId] = useState<string | null>(null)
  const [isDeletingCase, setIsDeletingCase] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const officer = getStoredOfficer()
  const isAdmin = officer?.role === 'ADMIN'

  const [assignments, setAssignments] = useState<CaseAssignment[]>([])
  const [availableInspectors, setAvailableInspectors] = useState<AdminUser[]>([])
  const [selectedAssignId, setSelectedAssignId] = useState<string>('')
  const [assignLoading, setAssignLoading] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)

  // Auto-dismiss action success message after 4s
  useEffect(() => {
    if (!actionMessage) return
    const t = setTimeout(() => setActionMessage(null), 4000)
    return () => clearTimeout(t)
  }, [actionMessage])

  const fetchAssignments = useCallback(async () => {
    if (!id || !isAdmin) return
    try {
      const [assignRes, usersRes] = await Promise.allSettled([
        adminApi.getCaseAssignments(id),
        adminApi.listUsers(),
      ])
      if (assignRes.status === 'fulfilled') {
        setAssignments(assignRes.value.assignments)
      }
      if (usersRes.status === 'fulfilled') {
        setAvailableInspectors(usersRes.value.users)
      }
    } catch {
      // best-effort
    }
  }, [id, isAdmin])

  useEffect(() => {
    fetchAssignments()
  }, [fetchAssignments])

  async function handleAssignOfficer() {
    if (!id || !selectedAssignId || assignLoading) return
    setAssignLoading(true)
    try {
      await adminApi.assignCase(id, selectedAssignId)
      setActionMessage('Officer assigned to case successfully.')
      setSelectedAssignId('')
      await fetchAssignments()
    } catch (err: unknown) {
      const e = err as AxiosError<{ detail?: string }>
      setActionError(e.response?.data?.detail || 'Failed to assign officer.')
    } finally {
      setAssignLoading(false)
    }
  }

  async function handleUnassignOfficer(officerId: string) {
    if (!id || assignLoading) return
    setAssignLoading(true)
    try {
      await adminApi.unassignCase(id, officerId)
      setActionMessage('Officer unassigned from case.')
      await fetchAssignments()
    } catch (err: unknown) {
      const e = err as AxiosError<{ detail?: string }>
      setActionError(e.response?.data?.detail || 'Failed to unassign officer.')
    } finally {
      setAssignLoading(false)
    }
  }

  const fetchDetails = useCallback(async () => {
    if (!id) return null
    const [caseData, uploadsData, eventsData, qualityData] = await Promise.allSettled([
      investigationApi.getById(id),
      trackingApi.getCaseUploads(id),
      investigationApi.getCaseEvents(id, 100),
      investigationApi.getQualityReport(id),
    ])
    return { caseData, uploadsData, eventsData, qualityData }
  }, [id])

  const refresh = useCallback(() => {
    setError(null)
    setIsLoading(true)
    fetchDetails()
      .then((result) => {
        if (!result) return
        if (result.caseData.status === 'fulfilled') {
          setInv(result.caseData.value)
        } else {
          setError('Investigation not found')
        }
        if (result.uploadsData.status === 'fulfilled') {
          setUploads((result.uploadsData.value?.uploads ?? []) as UploadMetadata[])
        }
        if (result.eventsData.status === 'fulfilled') {
          setEvents(result.eventsData.value?.events ?? [])
        }
        if (result.qualityData.status === 'fulfilled') {
          setQualityReport(result.qualityData.value)
        }
      })
      .catch((err: unknown) => {
        setError((err as Error)?.message || 'Failed to load investigation details')
      })
      .finally(() => setIsLoading(false))
  }, [fetchDetails])

  const handleDeleteCdr = useCallback(async () => {
    if (!deleteCdrTarget || deletingCdrId) return
    setDeletingCdrId(deleteCdrTarget.id)
    setActionError(null)
    setActionMessage(null)
    try {
      await fileApi.deleteFile(deleteCdrTarget.id)
      setUploads((prev) => prev.filter((u) => u.upload_id !== deleteCdrTarget.id))
      setDeleteCdrTarget(null)
      setActionMessage('CDR deleted successfully.')
      // Refresh quality report as well
      investigationApi.getQualityReport(id).then(setQualityReport).catch(() => {})
    } catch (err: unknown) {
      setActionError(formatDeleteError(err, 'file'))
    } finally {
      setDeletingCdrId(null)
    }
  }, [id, deleteCdrTarget, deletingCdrId])

  const handleDeleteCase = useCallback(async () => {
    if (!id || isDeletingCase) return
    setIsDeletingCase(true)
    setActionError(null)
    setActionMessage(null)
    try {
      await investigationApi.delete(id)
      navigate('/investigations', { replace: true, state: { message: 'Investigation deleted successfully.' } })
    } catch (err: unknown) {
      setActionError(formatDeleteError(err, 'investigation'))
      setShowDeleteCaseConfirm(false)
    } finally {
      setIsDeletingCase(false)
    }
  }, [id, isDeletingCase, navigate])

  useEffect(() => {
    let ignore = false
    fetchDetails()
      .then((result) => {
        if (!result || ignore) return
        if (result.caseData.status === 'fulfilled') {
          setInv(result.caseData.value)
        } else {
          setError('Investigation not found')
        }
        if (result.uploadsData.status === 'fulfilled') {
          setUploads((result.uploadsData.value?.uploads ?? []) as UploadMetadata[])
        }
        if (result.eventsData.status === 'fulfilled') {
          setEvents(result.eventsData.value?.events ?? [])
        }
        if (result.qualityData.status === 'fulfilled') {
          setQualityReport(result.qualityData.value)
        }
      })
      .catch((err: unknown) => {
        if (!ignore) setError((err as Error)?.message || 'Failed to load investigation details')
      })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => {
      ignore = true
    }
  }, [id, fetchDetails])

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
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1 mb-4">{error}</p>
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
        <div className="flex items-start gap-3 flex-1">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
            <FolderOpen className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">
                {currentInv.case_name || currentInv.id}
              </h1>
              <div className="flex items-center gap-1.5">
                <span className="text-2xs font-bold uppercase tracking-wider text-surface-400">
                  Case Status
                </span>
                <CaseStatusSelector
                  caseId={currentInv.id}
                  currentStatus={currentInv.status}
                  variant="header"
                  onStatusChange={(newStatus) => {
                    setInv((prev) => (prev ? { ...prev, status: newStatus } : prev))
                  }}
                  onMessage={(msg) => {
                    if (msg.type === 'success') {
                      setActionMessage(msg.text)
                      setActionError(null)
                    } else {
                      setActionError(msg.text)
                      setActionMessage(null)
                    }
                  }}
                />
              </div>
            </div>
            <p className="text-sm text-surface-500 dark:text-surface-400">
              Case ID: <span className="font-mono text-surface-700 dark:text-surface-300">{currentInv.case_number || currentInv.id}</span> · Created by {currentInv.created_by || 'Officer'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={refresh}>
            Refresh
          </Button>
          <Button size="sm" variant="primary" icon={<MapPin className="h-4 w-4" />} onClick={() => navigate(`/investigations/${currentInv.id}/live`)}>
            Multilateration Map
          </Button>
        </div>
      </motion.div>

      {(actionMessage || actionError) && (
        <div className={cn(
          'rounded-md border p-3 text-sm flex items-center justify-between',
          actionMessage
            ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300'
            : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'
        )}>
          <span>{actionMessage || actionError}</span>
          <button
            type="button"
            onClick={() => {
              setActionMessage(null)
              setActionError(null)
            }}
            className="text-xs opacity-70 hover:opacity-100 ml-4 underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Case Info */}
          <Card>
            <CardHeader><CardTitle>Case Overview</CardTitle></CardHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-2xs text-surface-400 mb-0.5">Case Number</p>
                <p className="text-sm font-medium text-surface-800 dark:text-surface-200">
                  {currentInv.case_number || currentInv.id}
                </p>
              </div>
              <div>
                <p className="text-2xs text-surface-400 mb-0.5">Suspect / Target</p>
                <p className="text-sm font-medium text-surface-800 dark:text-surface-200">
                  {currentInv.suspect_name || 'Target'}
                </p>
              </div>
              <div>
                <p className="text-2xs text-surface-400 mb-0.5">Mobile Number</p>
                <p className="text-sm font-medium text-surface-800 dark:text-surface-200">
                  {currentInv.mobile_number || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-2xs text-surface-400 mb-0.5">Ingested Uploads</p>
                <p className="text-sm font-medium text-surface-800 dark:text-surface-200">
                  {uploads.length} files
                </p>
              </div>
              <div>
                <p className="text-2xs text-surface-400 mb-0.5">Case Lifecycle</p>
                <div className="pt-0.5">
                  <CaseStatusSelector
                    caseId={currentInv.id}
                    currentStatus={currentInv.status}
                    variant="card"
                    onStatusChange={(newStatus) => {
                      setInv((prev) => (prev ? { ...prev, status: newStatus } : prev))
                    }}
                    onMessage={(msg) => {
                      if (msg.type === 'success') {
                        setActionMessage(msg.text)
                        setActionError(null)
                      } else {
                        setActionError(msg.text)
                        setActionMessage(null)
                      }
                    }}
                  />
                </div>
              </div>

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
              <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setShowUploadModal(true)}>
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
                <Button size="sm" variant="primary" onClick={() => setShowUploadModal(true)}>
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
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', OPERATOR_COLORS[up.operator] || 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300')}>
                      {up.operator || 'Telecom'}
                    </span>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={deletingCdrId === up.upload_id}
                      disabled={deletingCdrId === up.upload_id}
                      onClick={() => setDeleteCdrTarget({ id: up.upload_id, name: up.original_filename })}
                    >
                      Delete
                    </Button>
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
              <Button size="md" variant="secondary" className="w-full justify-start" icon={<Upload className="h-4 w-4" />} onClick={() => setShowUploadModal(true)}>
                Upload CDR File
              </Button>
              <Button size="md" variant="secondary" className="w-full justify-start" icon={<FileText className="h-4 w-4" />} onClick={() => navigate('/reports')}>
                View Forensic Report
              </Button>
              {isAdmin && (
                <Button
                  size="md"
                  variant="danger"
                  className="w-full justify-start"
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => setShowDeleteCaseConfirm(true)}
                >
                  Delete Investigation
                </Button>
              )}
            </div>
          </Card>

          {/* Admin Case Assignment Card */}
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary-500" />
                  Assigned Officers (RBAC)
                </CardTitle>
              </CardHeader>
              <div className="space-y-3 text-xs">
                {assignments.length === 0 ? (
                  <p className="text-surface-400">No officers explicitly assigned yet.</p>
                ) : (
                  <div className="divide-y divide-surface-100 dark:divide-surface-800">
                    {assignments.map((a) => (
                      <div key={a.assignment_id} className="py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-surface-800 dark:text-surface-200 truncate">{a.officer_name}</p>
                          <p className="text-2xs text-surface-400 truncate">{a.email}</p>
                        </div>
                        <Tooltip content="Remove assignment">
                          <button
                            type="button"
                            onClick={() => handleUnassignOfficer(a.officer_id)}
                            disabled={assignLoading}
                            aria-label="Remove assignment"
                            className="p-1 text-surface-400 hover:text-danger rounded"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </button>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add assignment dropdown */}
                <div className="pt-2 border-t border-surface-100 dark:border-surface-800 space-y-2">
                  <Dropdown
                    value={selectedAssignId}
                    onChange={setSelectedAssignId}
                    size="sm"
                    placeholder="Select Officer to Assign..."
                    aria-label="Select officer to assign"
                    options={availableInspectors
                      .filter((u) => !assignments.some((a) => a.officer_id === u.officer_id))
                      .map((u) => ({
                        value: u.officer_id,
                        label: `${u.officer_name} (${u.role})`,
                      }))}
                    className="w-full"
                  />
                  <Button
                    size="xs"
                    variant="outline"
                    className="w-full gap-1.5"
                    onClick={handleAssignOfficer}
                    disabled={!selectedAssignId || assignLoading}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Assign to Case
                  </Button>
                </div>
              </div>
            </Card>
          )}

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

          {/* Data Quality Report Card */}
          {qualityReport && (
            <Card>
              <CardHeader><CardTitle>Data Quality Report</CardTitle></CardHeader>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-surface-100 dark:border-surface-700/50">
                  <span className="text-surface-500 text-left">Total Records</span>
                  <span className="font-semibold text-surface-800 dark:text-surface-200 text-right">{qualityReport.total_records.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-surface-100 dark:border-surface-700/50">
                  <span className="text-surface-500 text-left">Rejected Records</span>
                  <span className={cn("font-semibold text-right", qualityReport.rejected_records > 0 ? "text-danger" : "text-green-500")}>
                    {qualityReport.rejected_records.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-surface-100 dark:border-surface-700/50">
                  <span className="text-surface-500 text-left">Unique Towers</span>
                  <span className="font-semibold text-surface-800 dark:text-surface-200 text-right">{qualityReport.unique_towers}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-surface-100 dark:border-surface-700/50">
                  <span className="text-surface-500 text-left">Target Identifiers</span>
                  <span className="font-semibold text-surface-800 dark:text-surface-200 text-right">{qualityReport.unique_subscribers}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-surface-100 dark:border-surface-700/50">
                  <span className="text-surface-500 text-left">TA Availability</span>
                  <span className="font-semibold text-surface-800 dark:text-surface-200 text-right">{qualityReport.ta_available_pct}%</span>
                </div>
                <div className="flex justify-between py-1 border-b border-surface-100 dark:border-surface-700/50">
                  <span className="text-surface-500 text-left">RTT Availability</span>
                  <span className="font-semibold text-surface-800 dark:text-surface-200 text-right">{qualityReport.rtt_available_pct}%</span>
                </div>
                <div className="flex justify-between py-1 border-b border-surface-100 dark:border-surface-700/50">
                  <span className="text-surface-500 text-left">Measurement Frames</span>
                  <span className="font-semibold text-primary-600 text-right">{qualityReport.frames_created}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-surface-100 dark:border-surface-700/50">
                  <span className="text-surface-500 text-left">Frames Skipped (Unusable)</span>
                  <span className={cn("font-semibold text-right", qualityReport.frames_skipped > 0 ? "text-warning" : "text-surface-800 dark:text-surface-200")}>
                    {qualityReport.frames_skipped}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-surface-500 text-left">Localization Fixes</span>
                  <span className="font-semibold text-green-500 text-right">{qualityReport.fixes_generated}</span>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={!!deleteCdrTarget}
        onClose={() => { if (!deletingCdrId) setDeleteCdrTarget(null) }}
        title="Delete this CDR?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteCdrTarget(null)} disabled={!!deletingCdrId}>Cancel</Button>
            <Button variant="danger" onClick={handleDeleteCdr} disabled={!!deletingCdrId}>
              {deletingCdrId ? 'Deleting...' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-surface-600 dark:text-surface-300">
          This will permanently remove this uploaded CDR.
        </p>
      </Modal>

      <Modal
        open={showDeleteCaseConfirm}
        onClose={() => { if (!isDeletingCase) setShowDeleteCaseConfirm(false) }}
        title="Delete Investigation?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteCaseConfirm(false)} disabled={isDeletingCase}>Cancel</Button>
            <Button variant="danger" onClick={handleDeleteCase} disabled={isDeletingCase}>
              {isDeletingCase ? 'Deleting...' : 'Delete Permanently'}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-surface-600 dark:text-surface-300">
          <p>This will permanently delete this investigation and its associated uploaded files/data.</p>
          <p className="font-medium text-surface-800 dark:text-surface-200">This action cannot be undone.</p>
        </div>
      </Modal>

      <CdrUploadModal
        open={showUploadModal}
        caseId={currentInv.id}
        onClose={() => setShowUploadModal(false)}
      />
    </div>
  )
}


import { useState, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileText, X, CheckCircle, AlertCircle, ArrowLeft, ArrowRight,
  HardDrive, Tag, BarChart2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { TRACKING_DURATION_OPTIONS, ACCEPTED_FILE_TYPES, MAX_FILE_SIZE_MB, MAX_FILE_SIZE_BYTES } from '@/constants'
import { formatFileSize, estimateRowCount, cn } from '@/utils'
import type { TrackingDuration, UploadResponse } from '@/types'
import { uploadApi } from '@/services/api'
import { useAuthContext } from '@/contexts/AuthContext'

type UploadStage = 'select' | 'preview' | 'settings' | 'uploading' | 'done'

const OPERATOR_BADGE_COLORS: Record<string, string> = {
  Airtel:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  Jio:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Vi:      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  BSNL:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Unknown: 'bg-surface-100 text-surface-600',
}

export default function UploadCDRPage() {
  const { id: investigationId } = useParams()
  const navigate     = useNavigate()
  const { officer }  = useAuthContext()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [stage, setStage]       = useState<UploadStage>('select')
  const [file, setFile]         = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [duration, setDuration] = useState<TrackingDuration>('1h')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadResult, setUploadResult]     = useState<UploadResponse | null>(null)
  const [uploadError, setUploadError]       = useState<string | null>(null)

  const validateFile = (f: File): string | null => {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase()
    if (!Object.values(ACCEPTED_FILE_TYPES).flat().includes(ext)) {
      return `Unsupported file type. Accepted: CSV, XLSX, XLS`
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      return `File too large. Maximum size is ${MAX_FILE_SIZE_MB} MB`
    }
    if (f.size === 0) {
      return 'File is empty'
    }
    return null
  }

  const handleFile = useCallback((f: File) => {
    const err = validateFile(f)
    if (err) { setFileError(err); return }
    setFileError(null)
    setFile(f)
    setStage('preview')
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const handleUpload = async () => {
    if (!file || !investigationId) return
    setStage('uploading')
    setUploadProgress(0)
    setUploadError(null)
    try {
      const result = await uploadApi.uploadFile(
        file,
        investigationId,
        officer?.name ?? 'Unknown Officer',
        (pct) => setUploadProgress(pct)
      )
      setUploadResult(result)
      setStage('done')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Upload failed'
      setUploadError(msg)
      setStage('settings')
    }
  }

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => navigate('/investigations')}
        className="mb-6 flex items-center gap-2 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">Upload CDR File</h1>
        <p className="text-sm text-surface-500">Case ID: {investigationId}</p>
      </div>

      {/* Stage: Select / Drop */}
      {(stage === 'select' || stage === 'preview' || stage === 'settings') && (
        <div className="space-y-5">
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            className={cn(
              'relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer',
              isDragging
                ? 'border-primary-400 bg-primary-50 dark:border-primary-500 dark:bg-primary-950/20'
                : file
                ? 'border-green-400 bg-green-50 dark:border-green-700 dark:bg-green-950/10'
                : 'border-surface-300 hover:border-primary-400 hover:bg-primary-50/50 dark:border-surface-600 dark:hover:border-primary-600'
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            aria-label="Upload CDR file"
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls"
              onChange={onFileChange}
              aria-label="File input"
            />
            <div className={cn(
              'flex h-14 w-14 items-center justify-center rounded-2xl',
              file ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
            )}>
              {file ? <CheckCircle className="h-7 w-7" /> : <Upload className="h-7 w-7" />}
            </div>
            {file ? (
              <div>
                <p className="font-semibold text-surface-900 dark:text-surface-100">{file.name}</p>
                <p className="text-xs text-surface-500 mt-1">{formatFileSize(file.size)} · {estimateRowCount(file.size)}</p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-surface-700 dark:text-surface-300">
                  {isDragging ? 'Drop your CDR file here' : 'Drag & drop your CDR file'}
                </p>
                <p className="text-xs text-surface-400 mt-1">or click to browse files</p>
                <p className="text-xs text-surface-400">CSV, XLSX, XLS · Max {MAX_FILE_SIZE_MB} MB</p>
              </div>
            )}
          </div>

          {fileError && (
            <div className="flex items-center gap-2 rounded-lg bg-danger-light px-4 py-3 text-sm text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {fileError}
            </div>
          )}

          {/* File preview card */}
          <AnimatePresence>
            {file && stage !== 'select' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">File Details</p>
                    <button onClick={() => { setFile(null); setStage('select') }} className="text-surface-400 hover:text-danger transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <FileMetaItem icon={FileText}   label="File Name"    value={file.name.length > 20 ? file.name.substring(0, 20) + '…' : file.name} />
                    <FileMetaItem icon={HardDrive}  label="File Size"    value={formatFileSize(file.size)} />
                    <FileMetaItem icon={BarChart2}  label="Est. Rows"    value={estimateRowCount(file.size)} />
                    <FileMetaItem icon={Tag}        label="Type"         value={file.name.split('.').pop()?.toUpperCase() ?? 'CSV'} />
                  </div>
                  <p className="mt-3 text-2xs text-surface-400">
                    Operator will be automatically detected after upload by the E-Rakshak detection engine.
                  </p>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tracking settings */}
          <AnimatePresence>
            {file && (stage === 'preview' || stage === 'settings') && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card>
                  <p className="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-4">Tracking Settings</p>
                  <Select
                    label="Tracking Duration"
                    options={TRACKING_DURATION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                    value={duration}
                    onChange={(e) => setDuration(e.target.value as TrackingDuration)}
                  />
                  <p className="mt-2 text-xs text-surface-400">
                    Records outside this time range will be excluded from the trilateration analysis.
                  </p>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {uploadError && (
            <div className="flex items-center gap-2 rounded-lg bg-danger-light px-4 py-3 text-sm text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {uploadError}
            </div>
          )}

          {/* Actions */}
          {file && (stage === 'preview' || stage === 'settings') && (
            <div className="flex items-center justify-between">
              <Button variant="secondary" size="md" onClick={() => { setFile(null); setStage('select') }}>
                Change File
              </Button>
              <Button
                variant="primary"
                size="md"
                iconRight={<ArrowRight className="h-4 w-4" />}
                onClick={handleUpload}
              >
                Upload & Process
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Uploading */}
      {stage === 'uploading' && (
        <Card>
          <div className="flex flex-col items-center gap-5 py-6">
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 rounded-full border-4 border-primary-100 dark:border-primary-900" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary-600 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Upload className="h-6 w-6 text-primary-600" />
              </div>
            </div>
            <div className="text-center">
              <p className="font-semibold text-surface-900 dark:text-surface-100">Uploading CDR File…</p>
              <p className="text-sm text-surface-500 mt-1">{file?.name}</p>
            </div>
            <div className="w-full max-w-xs">
              <div className="h-2 rounded-full bg-surface-200 dark:bg-surface-700">
                <motion.div
                  className="h-2 rounded-full bg-primary-600"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ ease: 'linear' }}
                />
              </div>
              <p className="mt-2 text-center text-xs text-surface-400">{uploadProgress}%</p>
            </div>
          </div>
        </Card>
      )}

      {/* Done */}
      {stage === 'done' && uploadResult && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle className="h-7 w-7" />
              </div>
              <div>
                <p className="font-semibold text-surface-900 dark:text-surface-100">
                  {uploadResult.duplicate ? 'Duplicate Detected' : 'Upload Successful'}
                </p>
                <p className="text-sm text-surface-500 mt-1">
                  {uploadResult.duplicate
                    ? 'This file was already uploaded. Existing data will be used.'
                    : 'CDR file uploaded and classified successfully.'
                  }
                </p>
              </div>

              {/* Detection results */}
              <div className="w-full rounded-lg bg-surface-50 dark:bg-surface-800 p-4 text-left">
                <p className="text-xs font-semibold text-surface-500 mb-3">DETECTION RESULTS</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-2xs text-surface-400">Operator</p>
                    <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${OPERATOR_BADGE_COLORS[uploadResult.detection.operator]}`}>
                      {uploadResult.detection.operator}
                    </span>
                  </div>
                  <div>
                    <p className="text-2xs text-surface-400">Source Type</p>
                    <p className="text-sm font-medium text-surface-800 dark:text-surface-200 mt-0.5">{uploadResult.detection.source_type}</p>
                  </div>
                  <div>
                    <p className="text-2xs text-surface-400">Confidence</p>
                    <p className="text-sm font-medium text-surface-800 dark:text-surface-200 mt-0.5">
                      {(uploadResult.detection.confidence * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs text-surface-400">Extractor</p>
                    <p className="text-sm font-medium text-surface-800 dark:text-surface-200 mt-0.5">{uploadResult.detection.extractor_name}</p>
                  </div>
                </div>
                {uploadResult.detection.matched_columns.length > 0 && (
                  <div className="mt-3">
                    <p className="text-2xs text-surface-400 mb-1.5">MATCHED COLUMNS</p>
                    <div className="flex flex-wrap gap-1">
                      {uploadResult.detection.matched_columns.slice(0, 8).map((col) => (
                        <span key={col} className="rounded bg-surface-200 px-2 py-0.5 text-2xs text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                          {col}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 w-full">
                <Button variant="secondary" size="md" className="flex-1" onClick={() => navigate('/investigations')}>
                  Back to Cases
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  className="flex-1"
                  iconRight={<ArrowRight className="h-4 w-4" />}
                  onClick={() => navigate(`/investigations/${investigationId}/processing`)}
                >
                  Start Processing
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  )
}

function FileMetaItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-2xs text-surface-400">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="text-xs font-medium text-surface-700 dark:text-surface-300 break-all">{value}</p>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, ArrowRight, Check, CheckCircle, Loader2, RefreshCw, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { fileApi } from '@/services/api'
import type { CaseFile, UploadResult } from '@/types'
import { cn } from '@/utils'

type FileStatus = CaseFile['upload_status'] | 'rejected' | 'unknown'
interface TrackedFile {
  id: string
  name: string
  status: FileStatus
  error?: string
}

const Stepper = ({ currentStep }: { currentStep: number }) => {
  const steps = [
    { num: 1, label: 'Case Details' },
    { num: 2, label: 'Upload Data' },
    { num: 3, label: 'Processing' },
  ]
  return (
    <div className="mb-10 relative flex items-center justify-between w-full px-2">
      <div className="absolute left-0 top-4 -translate-y-1/2 w-full h-1 bg-surface-200 dark:bg-surface-800 z-0 rounded-full" />
      <div className="absolute left-0 top-4 -translate-y-1/2 h-1 bg-primary-500 z-0 rounded-full transition-all duration-500" style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }} />
      {steps.map((step) => {
        const isActive = step.num === currentStep
        const isPast = step.num < currentStep
        return (
          <div key={step.num} className="relative z-10 flex flex-col items-center gap-2">
            <div className={cn(
              'h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm border-2 bg-white dark:bg-surface-950',
              isActive ? 'border-primary-500 text-primary-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-110' :
              isPast ? 'border-primary-500 bg-primary-500 text-white dark:bg-primary-600 dark:border-primary-600' :
              'border-surface-300 text-surface-400 dark:border-surface-700'
            )}>
              {isPast ? <Check className="h-4 w-4" /> : step.num}
            </div>
            <span className={cn(
              'text-xs font-bold uppercase tracking-wider bg-white dark:bg-surface-950 px-2 rounded',
              isActive ? 'text-primary-500' : isPast ? 'text-surface-700 dark:text-surface-300' : 'text-surface-400'
            )}>{step.label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function ProcessingPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const uploadResults = (location.state as { uploadResults?: UploadResult[] } | null)?.uploadResults
  const [caseFiles, setCaseFiles] = useState<CaseFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (!id) return
    let active = true
    const checkStatus = async () => {
      try {
        const result = await fileApi.listCaseFiles(id)
        if (!active) return
        setCaseFiles(result.files)
        setError(null)
        setLoading(false)
        const tracked = uploadResults
          ? result.files.filter((file) => uploadResults.some((item) => item.upload_id === file.upload_id))
          : result.files
        const allTerminal = tracked.length > 0 && tracked.every((file) => file.upload_status === 'completed' || file.upload_status === 'failed')
        // Keep polling if an uploaded file is not yet visible in the case listing.
        const allFound = !uploadResults || uploadResults.filter((item) => item.upload_id).length === tracked.length
        if (allTerminal && allFound) clearInterval(interval)
      } catch {
        if (!active) return
        setError('Could not check file processing status. Please retry.')
        setLoading(false)
      }
    }
    const interval = setInterval(() => { void checkStatus() }, 3000)
    void checkStatus()
    return () => { active = false; clearInterval(interval) }
  }, [id, uploadResults, refresh])

  const filesById = new Map(caseFiles.map((file) => [file.upload_id, file]))
  const files: TrackedFile[] = uploadResults
    ? uploadResults.map((item, index) => {
        const file = item.upload_id ? filesById.get(item.upload_id) : undefined
        return {
          id: item.upload_id ?? `${item.filename}-${index}`,
          name: item.filename,
          status: item.upload_id ? (file?.upload_status ?? 'unknown') : item.status,
          error: file?.error_message ?? item.reason,
        }
      })
    : caseFiles.map((file) => ({
        id: file.upload_id,
        name: file.display_name || file.original_filename,
        status: file.upload_status,
        error: file.error_message,
      }))

  const completed = files.filter((file) => file.status === 'completed').length
  const failed = files.filter((file) => file.status === 'failed' || file.status === 'rejected').length
  const pending = files.length - completed - failed
  const canContinue = !error && !loading && completed > 0 && pending === 0
  const allCompleted = canContinue && failed === 0

  return (
    <div className="max-w-3xl mx-auto">
      <Stepper currentStep={3} />
      <div className="mb-8 text-center mt-8">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 mb-4 shadow-inner">
          <Zap className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">Processing Telecom Files</h1>
        <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
          {allCompleted ? 'All files in this upload have been processed.' :
           canContinue ? 'Some files failed, but successfully processed files are ready.' :
           failed > 0 && pending === 0 ? 'No files were processed successfully.' :
           'Checking the actual processing status of your files...'}
        </p>
        {!uploadResults && <p className="mt-1 text-xs text-surface-500">Showing all files in this case (no current upload selected).</p>}
      </div>

      {error && (
        <div role="alert" className="mb-6 flex items-center gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 p-4 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="secondary" onClick={() => setRefresh((value) => value + 1)} icon={<RefreshCw className="h-4 w-4" />}>Retry</Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-surface-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading file statuses...</div>
      ) : files.length === 0 ? (
        <p className="text-center py-8 text-sm text-surface-500">No files found for this case. Upload a file to get started.</p>
      ) : (
        <>
          <div className="mb-8">
            <div className="mb-2 flex justify-between text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">
              <span>{completed} of {files.length} files processed{failed > 0 ? ` · ${failed} failed/rejected` : ''}</span>
              <span className="text-primary-600">{Math.round((completed / files.length) * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-surface-200 dark:bg-surface-800 overflow-hidden">
              <div className="h-full bg-primary-500 transition-all duration-300" style={{ width: `${(completed / files.length) * 100}%` }} />
            </div>
          </div>
          <div className="space-y-3">
            {files.map((file) => {
              const success = file.status === 'completed'
              const failure = file.status === 'failed' || file.status === 'rejected'
              return (
                <div key={file.id} className={cn(
                  'flex items-start gap-4 rounded-xl border p-4',
                  success ? 'border-green-200 bg-green-50/50 dark:border-green-800/50 dark:bg-green-900/10' :
                  failure ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20' :
                  'border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20'
                )}>
                  {success ? <CheckCircle className="h-6 w-6 text-green-500 shrink-0" /> :
                   failure ? <AlertCircle className="h-6 w-6 text-red-500 shrink-0" /> :
                   <Loader2 className="h-6 w-6 text-primary-500 animate-spin shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold break-all">{file.name}</p>
                    <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">
                      {file.error || (file.status === 'unknown' ? 'File status unavailable — checking again...' : `Status: ${file.status}`)}
                    </p>
                  </div>
                  <span className="text-xs font-semibold capitalize shrink-0">{file.status}</span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {canContinue && (
        <div className="mt-10 flex flex-col items-center gap-5">
          <p className="text-sm text-surface-600 dark:text-surface-400">Ingestion is complete. Run localization from the investigation page when you're ready.</p>
          <Button variant="primary" size="lg" iconRight={<ArrowRight className="h-5 w-5" />} onClick={() => navigate(`/investigations/${id}/live`)}>
            Open Live Investigation
          </Button>
        </div>
      )}
    </div>
  )
}

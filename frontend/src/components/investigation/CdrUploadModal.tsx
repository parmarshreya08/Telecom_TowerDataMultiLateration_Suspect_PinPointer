import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, FileType, Loader2, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { MAX_FILE_SIZE_MB } from '@/constants'
import { fileApi, uploadApi } from '@/services/api'
import { cn } from '@/utils'
import type { BatchUploadResponse, CaseFile } from '@/types'

interface CdrUploadModalProps {
  open: boolean
  caseId: string
  onClose: () => void
  onComplete?: (response: BatchUploadResponse) => void
}

/**
 * Single upload popup shown wherever an "upload CDR" action exists.
 * Contains dropzone, per-file delete/clear, progress, and the Upload & Process action.
 */
export function CdrUploadModal({ open, caseId, onClose, onComplete }: CdrUploadModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<BatchUploadResponse | null>(null)
  const [caseFiles, setCaseFiles] = useState<CaseFile[]>([])

  // Poll processing status of submitted uploads
  useEffect(() => {
    if (!submitted) return
    let active = true
    const poll = async () => {
      try {
        const r = await fileApi.listCaseFiles(caseId)
        if (!active) return
        setCaseFiles(r.files)
      } catch { /* ignore */ }
    }
    void poll()
    const iv = setInterval(() => { void poll() }, 2500)
    return () => { active = false; clearInterval(iv) }
  }, [submitted, caseId])

  // Clear stale errors when files change; reset state when modal closes.
  useEffect(() => { setError(null) }, [files])
  useEffect(() => {
    if (!open) {
      setFiles([])
      setUploading(false)
      setProgress(0)
      setError(null)
      setDragActive(false)
      setSubmitted(null)
      setCaseFiles([])
    }
  }, [open])

  const addFiles = (picked: FileList | File[]) => {
    setFiles((prev) => [...prev, ...Array.from(picked)])
  }

  const handleUpload = async () => {
    if (files.length === 0) return
    if (files.length > 10) { setError('Upload at most 10 files at a time.'); return }
    const oversized = files.find((f) => f.size > MAX_FILE_SIZE_MB * 1024 * 1024)
    if (oversized) { setError(`${oversized.name} exceeds the ${MAX_FILE_SIZE_MB} MB per-file limit.`); return }
    setUploading(true)
    setProgress(0)
    try {
      const response = await uploadApi.uploadFiles(files, caseId, 'Officer', setProgress)
      if (response.successful === 0) {
        setError(response.results.map((r) => `${r.filename}: ${r.reason || 'Upload failed'}`).join(' | '))
        return
      }
      setSubmitted(response)
      onComplete?.(response)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload files')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upload Telecom Files" size="lg">
      <p className="-mt-2 text-xs text-surface-500">Case ID: <span className="font-semibold">{caseId}</span></p>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div
        onDragEnter={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files) }}
        className={cn(
          'relative mt-4 rounded-xl border-2 border-dashed p-10 text-center transition-colors',
          dragActive ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-surface-300 dark:border-surface-700'
        )}
      >
        <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,.tsv" multiple className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
        <UploadCloud className={cn('mx-auto mb-3 h-10 w-10', dragActive ? 'text-primary-500' : 'text-surface-400')} />
        <p className="font-semibold">Drag & drop files here</p>
        <p className="mt-1 mb-4 text-xs text-surface-500">CSV, XLSX, XLS, TSV — up to {MAX_FILE_SIZE_MB} MB each; 10 files max.</p>
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>Browse Files</Button>
      </div>

      {submitted ? (
        <div className="mt-5 space-y-3">
          <h4 className="text-sm font-semibold">Processing Files</h4>
          <ul className="space-y-2">
            {submitted.results.map((r) => {
              const f = caseFiles.find((cf) => cf.upload_id === r.upload_id)
              const st = f?.upload_status ?? r.status
              return (
                <li key={r.upload_id ?? r.filename} className="flex items-center justify-between rounded-lg border border-surface-200 bg-white p-3 dark:border-surface-800 dark:bg-surface-900">
                  <div className="flex items-center gap-2 min-w-0">
                    {st === 'completed' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> :
                     st === 'failed' || st === 'rejected' ? <AlertCircle className="h-5 w-5 text-red-500" /> :
                     <Loader2 className="h-5 w-5 animate-spin text-primary-500" />}
                    <span className="truncate text-sm font-medium">{r.filename}</span>
                  </div>
                  <span className={cn('text-xs font-semibold capitalize', st === 'completed' ? 'text-green-600' : st === 'failed' || st === 'rejected' ? 'text-red-500' : 'text-surface-500')}>{st}</span>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-surface-500">You can close this popup and reopen it later from the case — processing continues in the background.</p>
          <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Done</Button></div>
        </div>
      ) : files.length > 0 && (
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Selected Files ({files.length})</h4>
            <button type="button" onClick={() => setFiles([])} className="text-xs font-medium text-red-500 hover:text-red-600">Clear all</button>
          </div>
          <ul className="space-y-2">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="flex items-center justify-between rounded-lg border border-surface-200 bg-white p-3 shadow-sm dark:border-surface-800 dark:bg-surface-900">
                <div className="flex min-w-0 items-center gap-3">
                  <FileType className="h-5 w-5 shrink-0 text-primary-500" />
                  <span className="truncate text-sm font-medium">{file.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-surface-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))} className="text-surface-400 transition-colors hover:text-red-500">✕</button>
                </div>
              </li>
            ))}
          </ul>

          {uploading ? (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs"><span className="font-medium text-primary-600">Uploading...</span><span>{progress}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-800"><div className="h-full bg-primary-600 transition-all" style={{ width: `${progress}%` }} /></div>
            </div>
          ) : (
            <div className="mt-4 flex justify-end">
              <Button variant="primary" size="lg" onClick={handleUpload}>Upload & Process</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

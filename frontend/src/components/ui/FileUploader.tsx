import React, { useState, useRef, useCallback, useEffect } from 'react'
import { UploadCloud, RotateCcw, Pencil, Trash2 } from 'lucide-react'
import { useFileUpload } from '@/hooks/useFileUpload'
import { formatFileSize, cn } from '@/utils'
import { FILE_UPLOAD_STATUS_COLORS, FILE_UPLOAD_STATUS_LABELS } from '@/constants'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface FileUploaderProps {
  caseId: string
  onUploadComplete?: () => void
}

const ACCEPTED_TYPES = '.csv,.xlsx,.xls,.tsv'

export const FileUploader: React.FC<FileUploaderProps> = ({ caseId, onUploadComplete }) => {
  const [isDragging, setIsDragging] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [showReinitConfirm, setShowReinitConfirm] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    files,
    isLoading,
    error,
    successMessage,
    deletingId,
    fetchFiles,
    uploadFiles,
    uploadFromUrl,
    renameFile,
    deleteFile,
    batchDelete,
    reinitialize,
    retryFile,
    uploadQueue,
  } = useFileUpload({
    caseId,
    onComplete: onUploadComplete,
  })

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length > 0) {
      uploadFiles(droppedFiles)
    }
  }, [uploadFiles])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    if (selected.length > 0) {
      uploadFiles(selected)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [uploadFiles])

  const handleUrlSubmit = useCallback(() => {
    if (urlInput.trim()) {
      uploadFromUrl(urlInput.trim())
      setUrlInput('')
      setShowUrlInput(false)
    }
  }, [urlInput, uploadFromUrl])

  const toggleFileSelection = useCallback((uploadId: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(uploadId)) {
        next.delete(uploadId)
      } else {
        next.add(uploadId)
      }
      return next
    })
  }, [])

  const handleBatchDelete = useCallback(() => {
    if (selectedFiles.size > 0) {
      batchDelete(Array.from(selectedFiles))
      setSelectedFiles(new Set())
    }
  }, [selectedFiles, batchDelete])

  const handleReinitialize = useCallback(() => {
    reinitialize()
    setShowReinitConfirm(false)
    setSelectedFiles(new Set())
  }, [reinitialize])

  const handleRenameSubmit = useCallback(() => {
    if (renameTarget && renameValue.trim() && renameValue !== renameTarget.name) {
      renameFile(renameTarget.id, renameValue.trim())
    }
    setRenameTarget(null)
  }, [renameTarget, renameValue, renameFile])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget || isDeleting) return
    setIsDeleting(true)
    const ok = await deleteFile(deleteTarget.id)
    setIsDeleting(false)
    if (ok) {
      setDeleteTarget(null)
    }
  }, [deleteTarget, deleteFile, isDeleting])

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
          isDragging
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-surface-300 hover:border-primary-400 hover:bg-surface-50 dark:border-surface-600 dark:hover:border-primary-500 dark:hover:bg-surface-800/50'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES}
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="space-y-2">
          <div className="text-4xl flex justify-center">
            <UploadCloud className="h-10 w-10 text-surface-400 dark:text-surface-500" />
          </div>
          <p className="text-sm font-medium text-surface-700 dark:text-surface-200">
            Drag & drop files here, or click to browse
          </p>
          <p className="text-xs text-surface-500 dark:text-surface-400">
            CSV, XLSX, XLS, TSV · Max 50MB per file · Up to 10 files
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setShowUrlInput(!showUrlInput)}
          className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          {showUrlInput ? 'Cancel' : '+ Upload from URL'}
        </button>
      </div>

      {showUrlInput && (
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com/file.csv"
            className="input"
          />
          <Button type="button" variant="primary" size="md" onClick={handleUrlSubmit} disabled={!urlInput.trim() || isLoading}>
            Upload
          </Button>
        </div>
      )}

      {successMessage && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
          <p className="text-sm text-green-700 dark:text-green-300">{successMessage}</p>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-danger-light bg-danger-light/50 p-3 dark:border-danger-800 dark:bg-danger-900/20">
          <p className="text-sm text-danger-dark dark:text-red-300">{error}</p>
        </div>
      )}

      {uploadQueue.length > 0 && (
        <div className="space-y-1">
          {uploadQueue.map((r, i) => (
            <div
              key={`queue-${i}`}
              className="flex items-center gap-3 rounded-md border border-surface-200 p-3 dark:border-surface-700"
            >
              <span className="text-sm font-medium text-surface-700 dark:text-surface-200">{r.filename}</span>
              {r.status === 'uploaded' ? (
                <span className="badge badge-success">Uploaded</span>
              ) : (
                <span className="badge badge-danger">{r.status}</span>
              )}
              {r.message && <span className="text-xs text-surface-500 dark:text-surface-400">{r.message}</span>}
              {r.reason && <span className="text-xs text-danger dark:text-red-300">{r.reason}</span>}
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-surface-700 dark:text-surface-200">
                {files.length} file{files.length !== 1 ? 's' : ''}
              </span>
              {selectedFiles.size > 0 && (
                <button
                  onClick={handleBatchDelete}
                  className="text-xs font-medium text-danger hover:text-danger-dark dark:text-red-400 dark:hover:text-red-300"
                >
                  Delete selected ({selectedFiles.size})
                </button>
              )}
            </div>
            <button
              onClick={() => setShowReinitConfirm(true)}
              className="text-xs font-medium text-danger hover:text-danger-dark dark:text-red-400 dark:hover:text-red-300"
            >
              Reinitialize All
            </button>
          </div>

          <div className="space-y-1">
            {files.map((file) => (
              <div
                key={file.upload_id}
                className={cn(
                  'flex items-center gap-3 rounded-md border p-3',
                  selectedFiles.has(file.upload_id)
                    ? 'border-primary-400 bg-primary-50 dark:border-primary-600 dark:bg-primary-900/30'
                    : 'border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-800'
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.upload_id)}
                  onChange={() => toggleFileSelection(file.upload_id)}
                  className="h-4 w-4 rounded border-surface-300 text-primary-600 dark:border-surface-500 dark:bg-surface-700"
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-surface-900 dark:text-surface-100">
                    {file.display_name}
                  </p>
                  <p className="text-xs text-surface-500 dark:text-surface-400">
                    {formatFileSize(file.file_size_bytes)} · {file.file_source}
                  </p>
                </div>

                <span
                  className={FILE_UPLOAD_STATUS_COLORS[file.upload_status] || FILE_UPLOAD_STATUS_COLORS.pending}
                >
                  {FILE_UPLOAD_STATUS_LABELS[file.upload_status] || file.upload_status}
                </span>

                <div className="flex items-center gap-1">
                  {file.upload_status === 'failed' && (
                    <button
                      onClick={() => retryFile(file.upload_id)}
                      className="p-1.5 rounded text-surface-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                      title="Retry upload"
                      aria-label="Retry upload"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => { setRenameTarget({ id: file.upload_id, name: file.display_name }); setRenameValue(file.display_name) }}
                    className="p-1.5 rounded text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 transition-colors"
                    title="Rename file"
                    aria-label="Rename file"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget({ id: file.upload_id, name: file.display_name })}
                    disabled={deletingId === file.upload_id}
                    className="p-1.5 rounded text-surface-400 hover:text-danger dark:hover:text-red-400 disabled:opacity-50 transition-colors"
                    title="Delete file"
                    aria-label="Delete file"
                  >
                    {deletingId === file.upload_id
                      ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent inline-block" />
                      : <Trash2 className="h-3.5 w-3.5" />
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        title="Rename File"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button variant="primary" onClick={handleRenameSubmit}>Rename</Button>
          </>
        }
      >
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          className="input"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit() }}
        />
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => { if (!isDeleting) setDeleteTarget(null) }}
        title="Delete this CDR?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button>
            <Button variant="danger" onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-surface-600 dark:text-surface-300">
          This will permanently remove this uploaded CDR.
        </p>
        {deleteTarget && (
          <p className="mt-2 text-sm font-medium text-surface-800 dark:text-surface-200">
            {deleteTarget.name}
          </p>
        )}
      </Modal>

      <Modal
        open={showReinitConfirm}
        onClose={() => setShowReinitConfirm(false)}
        title="Reinitialize Case"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowReinitConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleReinitialize}>Delete All</Button>
          </>
        }
      >
        <p className="text-sm text-surface-600 dark:text-surface-300">
          This will permanently delete ALL files for this case. This action cannot be undone.
        </p>
      </Modal>
    </div>
  )
}

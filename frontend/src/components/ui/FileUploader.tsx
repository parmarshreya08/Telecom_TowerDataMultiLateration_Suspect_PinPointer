import React, { useState, useRef, useCallback } from 'react'
import { useFileUpload } from '@/hooks/useFileUpload'

interface FileUploaderProps {
  caseId: string
  onUploadComplete?: () => void
}

const ACCEPTED_TYPES = '.csv,.xlsx,.xls,.tsv'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  uploaded: 'bg-blue-100 text-blue-700',
  processing: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  uploaded: 'Uploaded',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
}

export const FileUploader: React.FC<FileUploaderProps> = ({ caseId, onUploadComplete }) => {
  const [isDragging, setIsDragging] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [showReinitConfirm, setShowReinitConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    files,
    isLoading,
    error,
    uploadFiles,
    uploadFromUrl,
    renameFile,
    deleteFile,
    batchDelete,
    reinitialize,
    retryFile,
  } = useFileUpload({
    caseId,
    onComplete: onUploadComplete,
  })

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

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
        }`}
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
          <div className="text-4xl">📁</div>
          <p className="text-sm font-medium text-gray-700">
            Drag & drop files here, or click to browse
          </p>
          <p className="text-xs text-gray-500">
            CSV, XLSX, XLS, TSV · Max 50MB per file · Up to 10 files
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setShowUrlInput(!showUrlInput)}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
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
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleUrlSubmit}
            disabled={!urlInput.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Upload
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">
                {files.length} file{files.length !== 1 ? 's' : ''}
              </span>
              {selectedFiles.size > 0 && (
                <button
                  onClick={handleBatchDelete}
                  className="text-xs text-red-600 hover:text-red-700 font-medium"
                >
                  Delete selected ({selectedFiles.size})
                </button>
              )}
            </div>
            <button
              onClick={() => setShowReinitConfirm(true)}
              className="text-xs text-red-600 hover:text-red-700 font-medium"
            >
              Reinitialize All
            </button>
          </div>

          <div className="space-y-1">
            {files.map((file) => (
              <div
                key={file.upload_id}
                className={`flex items-center gap-3 p-3 rounded-md border ${
                  selectedFiles.has(file.upload_id)
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.upload_id)}
                  onChange={() => toggleFileSelection(file.upload_id)}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300"
                />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {file.display_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.file_size_bytes)} · {file.file_source}
                  </p>
                </div>

                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                    STATUS_COLORS[file.upload_status] || STATUS_COLORS.pending
                  }`}
                >
                  {STATUS_LABELS[file.upload_status] || file.upload_status}
                </span>

                <div className="flex items-center gap-1">
                  {file.upload_status === 'failed' && (
                    <button
                      onClick={() => retryFile(file.upload_id)}
                      className="p-1 text-gray-400 hover:text-blue-600"
                      title="Retry"
                    >
                      🔄
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const newName = prompt('Enter new name:', file.display_name)
                      if (newName && newName !== file.display_name) {
                        renameFile(file.upload_id, newName)
                      }
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600"
                    title="Rename"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${file.display_name}"?`)) {
                        deleteFile(file.upload_id)
                      }
                    }}
                    className="p-1 text-gray-400 hover:text-red-600"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showReinitConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Reinitialize Case</h3>
            <p className="text-sm text-gray-600">
              This will permanently delete ALL files for this case. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowReinitConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleReinitialize}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

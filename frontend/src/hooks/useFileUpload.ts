import { useState, useCallback, useRef } from 'react'
import { fileApi, uploadApi } from '@/services/api'
import type { CaseFile, UploadResult } from '@/types'

interface UseFileUploadOptions {
  caseId: string
  onComplete?: () => void
  onError?: (error: string) => void
}

interface UseFileUploadReturn {
  files: CaseFile[]
  uploadQueue: UploadResult[]
  isLoading: boolean
  error: string | null
  fetchFiles: () => Promise<void>
  uploadFiles: (files: File[]) => Promise<void>
  uploadFromUrl: (url: string, filename?: string) => Promise<void>
  renameFile: (uploadId: string, newName: string) => Promise<void>
  deleteFile: (uploadId: string) => Promise<void>
  batchDelete: (uploadIds: string[]) => Promise<void>
  reinitialize: () => Promise<void>
  retryFile: (uploadId: string) => Promise<void>
}

export function useFileUpload({ caseId, onComplete, onError }: UseFileUploadOptions): UseFileUploadReturn {
  const [files, setFiles] = useState<CaseFile[]>([])
  const [uploadQueue, setUploadQueue] = useState<UploadResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  const fetchFiles = useCallback(async () => {
    try {
      const data = await fileApi.listCaseFiles(caseId)
      setFiles(data.files)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch files')
    }
  }, [caseId])

  const pollFileStatus = useCallback((uploadId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current)

    pollingRef.current = setInterval(async () => {
      try {
        const status = await fileApi.getFileStatus(uploadId)
        if (status.upload_status === 'completed' || status.upload_status === 'failed') {
          if (pollingRef.current) clearInterval(pollingRef.current)
          await fetchFiles()
          if (status.upload_status === 'completed') {
            onComplete?.()
          } else {
            onError?.(status.error_message || 'Processing failed')
          }
        }
      } catch {
        if (pollingRef.current) clearInterval(pollingRef.current)
      }
    }, 2000)
  }, [fetchFiles, onComplete, onError])

  const uploadFiles = useCallback(async (newFiles: File[]) => {
    setIsLoading(true)
    setError(null)
    setUploadQueue([])

    try {
      const response = await uploadApi.uploadFiles(newFiles, caseId)
      setUploadQueue(response.results)

      // Poll status for uploaded files
      response.results.forEach((r) => {
        if (r.status === 'uploaded' && r.upload_id) {
          pollFileStatus(r.upload_id)
        }
      })

      // Refresh file list
      await fetchFiles()
    } catch (err: any) {
      setError(err.message || 'Upload failed')
      onError?.(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [caseId, fetchFiles, pollFileStatus, onError])

  const uploadFromUrl = useCallback(async (url: string, filename?: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await uploadApi.uploadFromUrl(caseId, url, filename)
      setUploadQueue([result])

      if (result.status === 'uploaded' && result.upload_id) {
        pollFileStatus(result.upload_id)
      }

      await fetchFiles()
    } catch (err: any) {
      setError(err.message || 'URL upload failed')
      onError?.(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [caseId, fetchFiles, pollFileStatus, onError])

  const renameFile = useCallback(async (uploadId: string, newName: string) => {
    try {
      await fileApi.renameFile(uploadId, newName)
      await fetchFiles()
    } catch (err: any) {
      setError(err.message || 'Rename failed')
    }
  }, [fetchFiles])

  const deleteFile = useCallback(async (uploadId: string) => {
    try {
      await fileApi.deleteFile(uploadId)
      await fetchFiles()
    } catch (err: any) {
      setError(err.message || 'Delete failed')
    }
  }, [fetchFiles])

  const batchDelete = useCallback(async (uploadIds: string[]) => {
    try {
      await fileApi.batchDelete(caseId, uploadIds)
      await fetchFiles()
    } catch (err: any) {
      setError(err.message || 'Batch delete failed')
    }
  }, [caseId, fetchFiles])

  const reinitialize = useCallback(async () => {
    try {
      await fileApi.reinitializeCase(caseId)
      await fetchFiles()
    } catch (err: any) {
      setError(err.message || 'Reinitialize failed')
    }
  }, [caseId, fetchFiles])

  const retryFile = useCallback(async (uploadId: string) => {
    // Re-trigger polling for failed file
    pollFileStatus(uploadId)
  }, [pollFileStatus])

  return {
    files,
    uploadQueue,
    isLoading,
    error,
    fetchFiles,
    uploadFiles,
    uploadFromUrl,
    renameFile,
    deleteFile,
    batchDelete,
    reinitialize,
    retryFile,
  }
}

import { useState, useCallback, useRef, useEffect } from 'react'
import { fileApi, uploadApi, formatDeleteError } from '@/services/api'
import { extractErrorMessage } from '@/utils'
import { POLL_INTERVAL } from '@/constants'
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
  successMessage: string | null
  deletingId: string | null
  fetchFiles: () => Promise<void>
  uploadFiles: (files: File[]) => Promise<void>
  uploadFromUrl: (url: string, filename?: string) => Promise<void>
  renameFile: (uploadId: string, newName: string) => Promise<void>
  deleteFile: (uploadId: string) => Promise<boolean>
  batchDelete: (uploadIds: string[]) => Promise<void>
  reinitialize: () => Promise<void>
  retryFile: (uploadId: string) => Promise<void>
}

export function useFileUpload({ caseId, onComplete, onError }: UseFileUploadOptions): UseFileUploadReturn {
  const [files, setFiles] = useState<CaseFile[]>([])
  const [uploadQueue, setUploadQueue] = useState<UploadResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const pollingRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const inFlightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const timers = pollingRef.current
    return () => {
      timers.forEach((t) => clearInterval(t))
      timers.clear()
      inFlightRef.current.clear()
    }
  }, [])

  const fetchFiles = useCallback(async () => {
    try {
      const data = await fileApi.listCaseFiles(caseId)
      setFiles(data.files)
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
    }
  }, [caseId])

  const stopPolling = useCallback((uploadId: string) => {
    const t = pollingRef.current.get(uploadId)
    if (t) {
      clearInterval(t)
      pollingRef.current.delete(uploadId)
    }
    inFlightRef.current.delete(uploadId)
  }, [])

  const pollFileStatus = useCallback((uploadId: string) => {
    if (pollingRef.current.has(uploadId)) return

    const timer = setInterval(async () => {
      // Skip overlapping ticks when a status request is slower than the interval.
      if (inFlightRef.current.has(uploadId)) return
      inFlightRef.current.add(uploadId)
      try {
        const status = await fileApi.getFileStatus(uploadId)
        if (status.upload_status === 'completed' || status.upload_status === 'failed') {
          stopPolling(uploadId)
          await fetchFiles()
          if (status.upload_status === 'completed') {
            onComplete?.()
          } else {
            onError?.(status.error_message || 'Processing failed')
          }
        }
      } catch {
        // Transient error: keep polling; do not abandon on one 500/401.
      } finally {
        inFlightRef.current.delete(uploadId)
      }
    }, POLL_INTERVAL)
    pollingRef.current.set(uploadId, timer)
  }, [fetchFiles, onComplete, onError, stopPolling])

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
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
      onError?.(extractErrorMessage(err))
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
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
      onError?.(extractErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [caseId, fetchFiles, pollFileStatus, onError])

  const renameFile = useCallback(async (uploadId: string, newName: string) => {
    try {
      await fileApi.renameFile(uploadId, newName)
      await fetchFiles()
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
    }
  }, [fetchFiles])

  const deleteFile = useCallback(async (uploadId: string): Promise<boolean> => {
    setDeletingId(uploadId)
    setError(null)
    setSuccessMessage(null)
    try {
      await fileApi.deleteFile(uploadId)
      setFiles((prev) => prev.filter((f) => f.upload_id !== uploadId))
      setSuccessMessage('CDR deleted successfully.')
      return true
    } catch (err: unknown) {
      setError(formatDeleteError(err, 'file'))
      return false
    } finally {
      setDeletingId(null)
    }
  }, [])

  const batchDelete = useCallback(async (uploadIds: string[]) => {
    try {
      await fileApi.batchDelete(caseId, uploadIds)
      await fetchFiles()
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
    }
  }, [caseId, fetchFiles])

  const reinitialize = useCallback(async () => {
    try {
      await fileApi.reinitializeCase(caseId)
      await fetchFiles()
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
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
  }
}

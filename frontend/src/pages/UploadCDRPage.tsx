import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, AlertCircle, RefreshCw } from 'lucide-react'
import { FileUploader } from '@/components/ui/FileUploader'
import { investigationApi } from '@/services/api'

export default function UploadCDRPage() {
  const { id: investigationId } = useParams()
  const navigate = useNavigate()

  const [caseId] = useState(() => investigationId || '')
  const [caseExists, setCaseExists] = useState<boolean | null>(null)
  const [caseError, setCaseError] = useState<string | null>(null)

  useEffect(() => {
    if (!caseId) {
      setCaseExists(false)
      setCaseError('No case ID provided. Create a case first.')
      return
    }

    let ignore = false
    setCaseExists(null)
    setCaseError(null)

    investigationApi.getById(caseId)
      .then(() => { if (!ignore) setCaseExists(true) })
      .catch((err: unknown) => {
        if (!ignore) {
          setCaseExists(false)
          const msg = err instanceof Error ? err.message : 'Case not found'
          setCaseError(msg)
        }
      })

    return () => { ignore = true }
  }, [caseId])

  if (!caseId) {
    return (
      <div className="max-w-2xl">
        <button
          onClick={() => navigate('/investigations')}
          className="mb-6 flex items-center gap-2 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">No case selected</p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">Create an investigation case first, then upload files to it.</p>
          <button
            onClick={() => navigate('/investigations/new')}
            className="mt-4 btn btn-md btn-primary"
          >
            Create New Case
          </button>
        </div>
      </div>
    )
  }

  if (caseExists === null) {
    return (
      <div className="max-w-2xl">
        <button
          onClick={() => navigate('/investigations')}
          className="mb-6 flex items-center gap-2 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center justify-center py-12 text-sm text-surface-400">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          Verifying case...
        </div>
      </div>
    )
  }

  if (!caseExists) {
    return (
      <div className="max-w-2xl">
        <button
          onClick={() => navigate('/investigations')}
          className="mb-6 flex items-center gap-2 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">Case not found</p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">{caseError || 'This case does not exist in the database.'}</p>
          <button
            onClick={() => navigate('/investigations/new')}
            className="mt-4 btn btn-md btn-primary"
          >
            Create New Case
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => navigate(`/investigations/${caseId}`)}
        className="mb-6 flex items-center gap-2 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Case
      </button>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">Upload Telecom Files</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
          Case ID: <span className="font-semibold text-surface-800 dark:text-surface-200">{caseId}</span>
        </p>
      </div>

      <FileUploader
        caseId={caseId}
        onUploadComplete={() => {
          // Optionally refresh or show success
        }}
      />
    </div>
  )
}

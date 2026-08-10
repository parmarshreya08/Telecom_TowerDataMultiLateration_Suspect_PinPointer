import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { FileUploader } from '@/components/ui/FileUploader'

export default function UploadCDRPage() {
  const { id: investigationId } = useParams()
  const navigate = useNavigate()

  const caseId = investigationId || `CASE-${Date.now().toString().slice(-4)}`

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => navigate('/investigations')}
        className="mb-6 flex items-center gap-2 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">Upload Telecom Files</h1>
        <p className="text-sm text-surface-500 mt-1">
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

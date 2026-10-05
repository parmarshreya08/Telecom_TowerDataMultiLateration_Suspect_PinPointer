import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, AlertCircle, RefreshCw, Check, UploadCloud, FileType, ArrowRight } from 'lucide-react'
import { investigationApi, uploadApi } from '@/services/api'
import { cn } from '@/utils'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/Button'

const Stepper = ({ currentStep }: { currentStep: number }) => {
  const steps = [
    { num: 1, label: 'Case Details' },
    { num: 2, label: 'Upload Data' },
    { num: 3, label: 'Processing' }
  ];
  return (
    <div className="mb-10 relative flex items-center justify-between w-full px-2">
      <div className="absolute left-0 top-4 -translate-y-1/2 w-full h-1 bg-surface-200 dark:bg-surface-800 z-0 rounded-full"></div>
      <div className="absolute left-0 top-4 -translate-y-1/2 h-1 bg-primary-500 z-0 rounded-full transition-all duration-500" style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}></div>
      {steps.map((s) => {
        const isActive = s.num === currentStep;
        const isPast = s.num < currentStep;
        return (
          <div key={s.num} className="relative z-10 flex flex-col items-center gap-2">
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all duration-300 bg-white dark:bg-surface-950",
              isActive ? 'border-primary-500 text-primary-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-110' : 
              isPast ? 'border-primary-500 bg-primary-500 text-white dark:bg-primary-600 dark:border-primary-600' : 
              'border-surface-300 text-surface-400 dark:border-surface-700'
            )}>
              {isPast ? <Check className="h-4 w-4" /> : s.num}
            </div>
            <span className={cn(
              "text-xs font-bold uppercase tracking-wider bg-white dark:bg-surface-950 px-2 rounded",
              isActive ? 'text-primary-500' : isPast ? 'text-surface-700 dark:text-surface-300' : 'text-surface-400'
            )}>{s.label}</span>
          </div>
        );
      })}
    </div>
  )
}

export default function UploadCDRPage() {
  const { id: investigationId } = useParams()
  const navigate = useNavigate()

  const [caseId] = useState(() => investigationId || '')
  const [caseExists, setCaseExists] = useState<boolean | null>(null)
  const [caseError, setCaseError] = useState<string | null>(null)

  const [dragActive, setDragActive] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  
  const inputRef = useRef<HTMLInputElement>(null)

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
          setCaseError(err instanceof Error ? err.message : 'Case not found')
        }
      })
    return () => { ignore = true }
  }, [caseId])

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const handleUpload = async () => {
    if (files.length === 0) return
    setIsUploading(true)
    setUploadError(null)
    setUploadProgress(0)
    try {
      await uploadApi.uploadFiles(files, caseId, 'Officer', (pct) => setUploadProgress(pct))
      navigate(`/investigations/${caseId}/processing`)
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to upload files')
    } finally {
      setIsUploading(false)
    }
  }

  if (!caseId || caseExists === false) {
    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate('/investigations')} className="mb-6 flex items-center gap-2 text-sm text-surface-500 hover:text-surface-700">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">{caseError || 'Case not found'}</p>
          <button onClick={() => navigate('/investigations/new')} className="mt-4 btn btn-md btn-primary">Create New Case</button>
        </div>
      </div>
    )
  }

  if (caseExists === null) {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-center py-12 text-sm text-surface-400">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" />
        Verifying case...
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate(`/investigations/${caseId}`)} className="mb-6 flex items-center gap-2 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Case
      </button>

      <Stepper currentStep={2} />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 shadow-inner">
            <UploadCloud className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 tracking-tight">Upload Telecom Files</h1>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
              Case ID: <span className="font-semibold text-surface-800 dark:text-surface-200">{caseId}</span>
            </p>
          </div>
        </div>

        {uploadError && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 p-4 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> {uploadError}
          </div>
        )}

        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={cn(
            "relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 ease-in-out mt-4",
            dragActive ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 scale-[1.02]" : "border-surface-300 dark:border-surface-700 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-surface-50 dark:hover:bg-surface-800/50"
          )}
        >
          <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
          <UploadCloud className={cn("h-12 w-12 mx-auto mb-4 transition-colors", dragActive ? "text-primary-500" : "text-surface-400")} />
          <h3 className="text-lg font-semibold text-surface-800 dark:text-surface-200 mb-2">
            Drag & Drop files here
          </h3>
          <p className="text-sm text-surface-500 dark:text-surface-400 mb-6">
            Supports CSV, XLSX, CDR, and standard cell tower formats up to 500MB
          </p>
          <Button variant="secondary" onClick={() => inputRef.current?.click()}>
            Browse Files
          </Button>
        </div>

        <AnimatePresence>
          {files.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-6 space-y-3">
              <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-300">Selected Files ({files.length})</h4>
              <ul className="space-y-2">
                {files.map((file, i) => (
                  <li key={i} className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 shadow-sm">
                    <div className="flex items-center gap-3">
                      <FileType className="h-5 w-5 text-primary-500" />
                      <span className="text-sm font-medium text-surface-700 dark:text-surface-300">{file.name}</span>
                    </div>
                    <span className="text-xs text-surface-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  </li>
                ))}
              </ul>
              
              {isUploading ? (
                <div className="mt-4">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-primary-600 font-medium">Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-surface-200 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              ) : (
                <div className="mt-6 flex justify-end">
                  <Button variant="primary" size="lg" onClick={handleUpload} iconRight={<ArrowRight className="h-5 w-5" />}>
                    Upload & Process
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

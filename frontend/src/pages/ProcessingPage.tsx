import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle, Loader2, ArrowRight, Zap, AlertCircle, RefreshCw, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { investigationApi } from '@/services/api'
import { cn } from '@/utils'

type StageStatus = 'pending' | 'processing' | 'completed' | 'error'

interface StageState { id: string; label: string; description: string; status: StageStatus; duration_ms?: number }

const STAGES: Array<{ id: string; label: string; description: string }> = [
  { id: 'upload',             label: 'File Upload',       description: 'File received and stored by backend' },
  { id: 'detection',          label: 'Detection',         description: 'Operator and source type auto-detected' },
  { id: 'extraction',         label: 'Extraction',        description: 'CDR/tower records parsed from file' },
  { id: 'validation',         label: 'Validation',        description: 'Data integrity and format checks' },
  { id: 'normalization',      label: 'Normalization',     description: 'Records normalized to standard schema' },
  { id: 'database',           label: 'Database Storage',  description: 'Validated records stored in PostGIS' },
  { id: 'tower_resolution',   label: 'Tower Resolution',  description: 'CGI codes resolved to tower coordinates' },
  { id: 'ready',              label: 'Ready for Analysis', description: 'Investigation ready for localization' },
]

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

export default function ProcessingPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const [stages, setStages] = useState<StageState[]>(
    STAGES.map((s) => ({ ...s, status: 'pending' }))
  )
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkStatus = useCallback(async () => {
    if (!id) return null
    try {
      const caseData = await investigationApi.getById(id)
      return {
        uploadCount: caseData.uploads?.length ?? 0,
        fixCount: caseData.fix_count ?? 0,
      }
    } catch {
      return null
    }
  }, [id])

  const applyStatus = useCallback((result: { uploadCount: number; fixCount: number } | null) => {
    if (!result) {
      setError('Failed to check processing status.')
      return
    }
    const { uploadCount, fixCount } = result
    if (uploadCount === 0) {
      setStages((prev) => prev.map((s, i) => i === 0 ? { ...s, status: 'error' } : s))
      setError('No uploads found for this case. Upload a file first.')
      return
    }
    setStages((prev) => prev.map((s, i) => {
      if (i < 6) return { ...s, status: 'completed' as const, duration_ms: undefined }
      if (i === 6) return { ...s, status: fixCount > 0 ? ('completed' as const) : ('processing' as const) }
      if (i === 7) return { ...s, status: fixCount > 0 ? ('completed' as const) : ('pending' as const) }
      return s
    }))
    if (fixCount > 0) setDone(true)
  }, [])

  const retry = useCallback(() => {
    setError(null)
    checkStatus().then(applyStatus)
  }, [checkStatus, applyStatus])

  useEffect(() => {
    let ignore = false
    checkStatus().then((result) => { if (!ignore) applyStatus(result) })
    
    const interval = setInterval(() => {
      if (!done) {
        checkStatus().then((result) => { if (!ignore) applyStatus(result) })
      }
    }, 3000)
    return () => { ignore = true; clearInterval(interval) }
  }, [checkStatus, applyStatus, done])

  const completedCount = stages.filter((s) => s.status === 'completed').length

  return (
    <div className="max-w-3xl mx-auto">
      <Stepper currentStep={3} />

      {/* Header */}
      <div className="mb-8 text-center mt-8">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 mb-4 shadow-inner">
          <Zap className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 tracking-tight">Processing CDR Data</h1>
        <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
          {done
            ? 'All pipeline stages completed. Investigation is ready.'
            : 'Analyzing and structuring uploaded records...'}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 p-4 text-xs text-red-700 dark:text-red-300 shadow-sm">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
          <div className="flex-1">
            <p className="font-semibold">Processing Issue</p>
            <p className="mt-0.5">{error}</p>
          </div>
          <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={retry}>
            Retry
          </Button>
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">
          <span>{completedCount} of {STAGES.length} stages</span>
          <span className="text-primary-600">{Math.round((completedCount / STAGES.length) * 100)}%</span>
        </div>
        <div className="h-2 rounded-full bg-surface-200 dark:bg-surface-800 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary-500"
            initial={{ width: 0 }}
            animate={{ width: `${(completedCount / STAGES.length) * 100}%` }}
            transition={{ ease: 'easeOut', duration: 0.4 }}
          />
        </div>
      </div>

      {/* Pipeline stages */}
      <div className="space-y-3 relative before:absolute before:inset-0 before:ml-[1.125rem] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-surface-200 dark:before:via-surface-700 before:to-transparent">
        {stages.map((stage, idx) => (
          <motion.div
            key={stage.id}
            className={cn(
              'relative flex items-center gap-4 rounded-xl border p-4 transition-all duration-300 ease-in-out',
              stage.status === 'processing' ? 'border-primary-400 bg-primary-50 dark:border-primary-600 dark:bg-primary-900/20 shadow-lg shadow-primary-500/10 scale-[1.01]' :
              stage.status === 'completed'  ? 'border-green-200 bg-green-50/50 dark:border-green-800/50 dark:bg-green-900/10 opacity-70' :
              stage.status === 'error'      ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20' :
              'border-surface-200 bg-white dark:border-surface-800 opacity-50'
            )}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
          >
            <div className="shrink-0 relative z-10 bg-white dark:bg-surface-900 rounded-full">
              {stage.status === 'completed' ? (
                <CheckCircle className="h-6 w-6 text-green-500" />
              ) : stage.status === 'processing' ? (
                <div className="relative flex items-center justify-center h-6 w-6">
                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                   <span className="relative inline-flex rounded-full h-4 w-4 bg-primary-500"></span>
                </div>
              ) : stage.status === 'error' ? (
                <AlertCircle className="h-6 w-6 text-red-500" />
              ) : (
                <div className="h-6 w-6 rounded-full border-2 border-surface-300 dark:border-surface-600" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-bold tracking-wide',
                stage.status === 'processing' ? 'text-primary-700 dark:text-primary-300' :
                stage.status === 'completed'  ? 'text-green-700 dark:text-green-400' :
                stage.status === 'error'      ? 'text-red-700 dark:text-red-400' :
                'text-surface-500 dark:text-surface-400'
              )}>
                {stage.label}
              </p>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{stage.description}</p>
              
              {/* Skeleton Loaders for Processing State */}
              {stage.status === 'processing' && (
                <div className="mt-3 space-y-2">
                  <div className="h-1.5 w-3/4 bg-primary-200 dark:bg-primary-800 rounded animate-pulse"></div>
                  <div className="h-1.5 w-1/2 bg-primary-200 dark:bg-primary-800 rounded animate-pulse delay-75"></div>
                  <div className="h-1.5 w-5/6 bg-primary-200 dark:bg-primary-800 rounded animate-pulse delay-150"></div>
                </div>
              )}
            </div>

            <div className="shrink-0 text-right">
              {stage.status === 'completed' && (
                <span className="text-xs font-semibold text-green-500">Done</span>
              )}
              {stage.status === 'processing' && (
                <span className="text-xs font-semibold text-primary-500 animate-pulse">In Progress...</span>
              )}
              {stage.status === 'error' && (
                <span className="text-xs font-semibold text-red-500">Failed</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Done action */}
      <AnimatePresence>
        {done && (
          <motion.div
            className="mt-10 flex flex-col items-center gap-5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="rounded-xl border border-green-200 bg-green-50 px-8 py-5 dark:border-green-800 dark:bg-green-900/20 text-center shadow-lg shadow-green-500/5">
              <p className="font-bold text-green-700 dark:text-green-300 text-lg">Analysis Complete</p>
              <p className="mt-1 text-sm text-green-600 dark:text-green-400">
                Data structured and geospatial indices built. Investigation is ready for intelligence mapping.
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              iconRight={<ArrowRight className="h-5 w-5" />}
              onClick={() => navigate(`/investigations/${id}/live`)}
              className="px-8 shadow-lg shadow-primary-500/30 text-lg h-12"
            >
              Open Live Investigation
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

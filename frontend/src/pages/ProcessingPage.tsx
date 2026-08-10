import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle, Loader2, ArrowRight, Zap, AlertCircle, RefreshCw } from 'lucide-react'
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

export default function ProcessingPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const [stages, setStages] = useState<StageState[]>(
    STAGES.map((s) => ({ ...s, status: 'pending' }))
  )
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkStatus = useCallback(async () => {
    if (!id) return
    try {
      const caseData = await investigationApi.getById(id)
      const uploadCount = caseData.uploads?.length ?? 0
      const fixCount = caseData.fix_count ?? 0

      if (uploadCount === 0) {
        setStages((prev) => prev.map((s, i) => i === 0 ? { ...s, status: 'error' } : s))
        setError('No uploads found for this case. Upload a file first.')
        return
      }

      // Mark stages as completed based on actual backend state
      setStages((prev) => prev.map((s, i) => {
        if (i < 6) return { ...s, status: 'completed' as const, duration_ms: undefined }
        if (i === 6) return { ...s, status: fixCount > 0 ? ('completed' as const) : ('processing' as const) }
        if (i === 7) return { ...s, status: fixCount > 0 ? ('completed' as const) : ('pending' as const) }
        return s
      }))

      if (fixCount > 0) {
        setDone(true)
      }
    } catch {
      setError('Failed to check processing status.')
    }
  }, [id])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  const completedCount = stages.filter((s) => s.status === 'completed').length

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 mb-4">
          <Zap className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">Processing CDR Data</h1>
        <p className="mt-2 text-sm text-surface-500">
          {done
            ? 'All pipeline stages completed. Investigation is ready.'
            : 'Checking backend processing status...'}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 p-4 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
          <div className="flex-1">
            <p className="font-semibold">Processing Issue</p>
            <p className="mt-0.5">{error}</p>
          </div>
          <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={checkStatus}>
            Retry
          </Button>
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-xs text-surface-500">
          <span>{completedCount} of {STAGES.length} stages</span>
          <span>{Math.round((completedCount / STAGES.length) * 100)}%</span>
        </div>
        <div className="h-2 rounded-full bg-surface-200 dark:bg-surface-700">
          <motion.div
            className="h-2 rounded-full bg-primary-600"
            initial={{ width: 0 }}
            animate={{ width: `${(completedCount / STAGES.length) * 100}%` }}
            transition={{ ease: 'easeOut', duration: 0.4 }}
          />
        </div>
      </div>

      {/* Pipeline stages */}
      <div className="space-y-2">
        {stages.map((stage, idx) => (
          <motion.div
            key={stage.id}
            className={cn(
              'flex items-center gap-4 rounded-xl border p-4 transition-colors',
              stage.status === 'processing' ? 'border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-950/20' :
              stage.status === 'completed'  ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/10' :
              stage.status === 'error'      ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/10' :
              'border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-800'
            )}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.03 }}
          >
            <div className="shrink-0">
              {stage.status === 'completed' ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : stage.status === 'processing' ? (
                <Loader2 className="h-5 w-5 text-primary-600 animate-spin" />
              ) : stage.status === 'error' ? (
                <AlertCircle className="h-5 w-5 text-red-500" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-surface-300 dark:border-surface-600" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-medium',
                stage.status === 'processing' ? 'text-primary-700 dark:text-primary-300' :
                stage.status === 'completed'  ? 'text-green-700 dark:text-green-300' :
                stage.status === 'error'      ? 'text-red-700 dark:text-red-300' :
                'text-surface-500'
              )}>
                {stage.label}
              </p>
              <p className="text-xs text-surface-400">{stage.description}</p>
            </div>

            <div className="shrink-0 text-right">
              {stage.status === 'completed' && (
                <span className="text-xs text-green-500">Done</span>
              )}
              {stage.status === 'processing' && (
                <span className="text-xs text-primary-500 animate-pulse">Running...</span>
              )}
              {stage.status === 'error' && (
                <span className="text-xs text-red-500">Failed</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Done action */}
      <AnimatePresence>
        {done && (
          <motion.div
            className="mt-8 flex flex-col items-center gap-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="rounded-xl border border-green-200 bg-green-50 px-6 py-4 dark:border-green-800 dark:bg-green-950/20 text-center">
              <p className="font-semibold text-green-700 dark:text-green-300">Tracking Ready</p>
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                All pipeline stages completed. Suspect location data is ready.
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              iconRight={<ArrowRight className="h-4 w-4" />}
              onClick={() => navigate(`/investigations/${id}/live`)}
            >
              Open Live Investigation
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

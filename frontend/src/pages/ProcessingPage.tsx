import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Loader2, Circle, ArrowRight, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PIPELINE_STAGES } from '@/constants'
import { cn } from '@/utils'

type StageStatus = 'pending' | 'processing' | 'completed' | 'error'

interface StageState { id: string; status: StageStatus; duration_ms?: number }

// Simulate pipeline progression — TODO: Replace with actual backend progress via WebSocket
function useSimulatedPipeline() {
  const [stages, setStages] = useState<StageState[]>(
    PIPELINE_STAGES.map((s) => ({ id: s.id, status: 'pending' }))
  )
  const [done, setDone] = useState(false)

  useEffect(() => {
    let idx = 0
    const advance = () => {
      if (idx >= PIPELINE_STAGES.length) { setDone(true); return }
      setStages((prev) => prev.map((s, i) => i === idx ? { ...s, status: 'processing' } : s))
      const delay = 800 + Math.random() * 600
      setTimeout(() => {
        setStages((prev) =>
          prev.map((s, i) => i === idx ? { ...s, status: 'completed', duration_ms: Math.floor(delay) } : s)
        )
        idx++
        setTimeout(advance, 300)
      }, delay)
    }
    const timer = setTimeout(advance, 500)
    return () => clearTimeout(timer)
  }, [])

  return { stages, done }
}

export default function ProcessingPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { stages, done } = useSimulatedPipeline()

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
            : 'Backend is processing the uploaded CDR file through the ingestion pipeline.'}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-xs text-surface-500">
          <span>{completedCount} of {PIPELINE_STAGES.length} stages</span>
          <span>{Math.round((completedCount / PIPELINE_STAGES.length) * 100)}%</span>
        </div>
        <div className="h-2 rounded-full bg-surface-200 dark:bg-surface-700">
          <motion.div
            className="h-2 rounded-full bg-primary-600"
            initial={{ width: 0 }}
            animate={{ width: `${(completedCount / PIPELINE_STAGES.length) * 100}%` }}
            transition={{ ease: 'easeOut', duration: 0.4 }}
          />
        </div>
      </div>

      {/* Pipeline stages */}
      <div className="space-y-2">
        {PIPELINE_STAGES.map((stage, idx) => {
          const state = stages[idx]
          return (
            <motion.div
              key={stage.id}
              className={cn(
                'flex items-center gap-4 rounded-xl border p-4 transition-colors',
                state.status === 'processing' ? 'border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-950/20' :
                state.status === 'completed'  ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/10' :
                'border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-800'
              )}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03 }}
            >
              {/* Status icon */}
              <div className="shrink-0">
                {state.status === 'completed' ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : state.status === 'processing' ? (
                  <Loader2 className="h-5 w-5 text-primary-600 animate-spin" />
                ) : (
                  <Circle className="h-5 w-5 text-surface-300 dark:text-surface-600" />
                )}
              </div>

              {/* Stage info */}
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium',
                  state.status === 'processing' ? 'text-primary-700 dark:text-primary-300' :
                  state.status === 'completed'  ? 'text-green-700 dark:text-green-300' :
                  'text-surface-500'
                )}>
                  {stage.label}
                </p>
                <p className="text-xs text-surface-400">{stage.description}</p>
              </div>

              {/* Duration */}
              <div className="shrink-0 text-right">
                {state.status === 'completed' && state.duration_ms && (
                  <span className="text-xs text-surface-400">{state.duration_ms}ms</span>
                )}
                {state.status === 'processing' && (
                  <span className="text-xs text-primary-500 animate-pulse">Running…</span>
                )}
              </div>
            </motion.div>
          )
        })}
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
              <p className="font-semibold text-green-700 dark:text-green-300">🎯 Tracking Ready</p>
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

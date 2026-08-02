import { CheckCircle, XCircle, Clock, Target } from 'lucide-react'
import type { AlgorithmResult } from '@/types'
import { cn } from '@/utils'

interface AlgorithmResultCardProps { result: AlgorithmResult }

export function AlgorithmResultCard({ result }: AlgorithmResultCardProps) {
  const isSuccess = result.status === 'success'

  return (
    <div className={cn(
      'rounded-lg border p-3 text-xs',
      isSuccess
        ? 'border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-800'
        : 'border-danger-light bg-danger-light/30 dark:border-red-900 dark:bg-red-950/20'
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 font-semibold text-surface-800 dark:text-surface-200">
          {isSuccess
            ? <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            : <XCircle    className="h-3.5 w-3.5 text-danger" />
          }
          {result.algorithm}
        </div>
        <div className="flex items-center gap-1 text-surface-400">
          <Clock className="h-3 w-3" />
          {result.execution_time_ms}ms
        </div>
      </div>

      <div className="space-y-1.5">
        <InfoRow label="Accuracy"   value={`±${result.accuracy_meters}m`} />
        {result.residual_rms != null && (
          <InfoRow label="Residual RMS" value={result.residual_rms.toFixed(4)} />
        )}
        {result.gdop != null && (
          <InfoRow label="GDOP"     value={result.gdop.toFixed(2)} />
        )}
        {result.adaptive_R_scale != null && (
          <InfoRow label="Adaptive R" value={result.adaptive_R_scale.toFixed(3)} />
        )}
        {result.adaptive_Q_scale != null && (
          <InfoRow label="Adaptive Q" value={result.adaptive_Q_scale.toFixed(3)} />
        )}
        {result.confidence != null && (
          <InfoRow label="Confidence" value={`${(result.confidence * 100).toFixed(1)}%`} highlight />
        )}
        {result.clock_bias != null && (
          <InfoRow label="Clock Bias" value={`${result.clock_bias.toFixed(1)}m`} />
        )}
        {result.velocity != null && (
          <InfoRow label="Velocity"   value={`${(result.velocity.magnitude * 3.6).toFixed(1)} km/h`} />
        )}
        {result.prediction != null && (
          <div className="mt-1.5 flex items-center gap-1 text-primary-600 dark:text-primary-400">
            <Target className="h-3 w-3" />
            <span>Predicted: {result.prediction.latitude.toFixed(5)}°, {result.prediction.longitude.toFixed(5)}°</span>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-surface-400">{label}</span>
      <span className={cn('font-medium', highlight ? 'text-primary-600 dark:text-primary-400' : 'text-surface-700 dark:text-surface-300')}>
        {value}
      </span>
    </div>
  )
}

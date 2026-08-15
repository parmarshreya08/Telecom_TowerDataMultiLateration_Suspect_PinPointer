import { useState, useRef } from 'react'
import { Radio, Upload, CheckCircle2, Loader2, FileText, AlertCircle, Sparkles, Check } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { RFVerifiedFix } from '@/types'

interface SDRUploadModalProps {
  isOpen: boolean
  onClose: () => void
  currentSuspectLat?: number
  currentSuspectLon?: number
  currentTimestamp?: string
  onVerificationComplete: (fix: RFVerifiedFix) => void
}

type Stage = 'idle' | 'processing' | 'complete'

const PROCESSING_STEPS = [
  'Reading RF spectrum measurements',
  'Correlating signal strength & RSSI profile',
  'Estimating transmitter proximity',
  'Calculating ±5m verified pin location',
]

export function SDRUploadModal({
  isOpen,
  onClose,
  currentSuspectLat,
  currentSuspectLon,
  currentTimestamp,
  onVerificationComplete,
}: SDRUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [verifiedFix, setVerifiedFix] = useState<RFVerifiedFix | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleReset = () => {
    setFile(null)
    setStage('idle')
    setCurrentStepIdx(0)
    setVerifiedFix(null)
  }

  const handleModalClose = () => {
    handleReset()
    onClose()
  }

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0]
      const ext = selected.name.toLowerCase()
      if (ext.endsWith('.csv') || ext.endsWith('.json') || ext.endsWith('.txt') || ext.endsWith('.log')) {
        setFile(selected)
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  // TEMPORARY FRONTEND MOCK — replace with backend SDR verification endpoint later
  const startProcessing = () => {
    if (!file) return
    setStage('processing')
    setCurrentStepIdx(0)

    // Derived location slightly offset (+0.00028 lat, +0.00019 lon) from current suspect pin
    const baseLat = currentSuspectLat ?? 28.6139
    const baseLon = currentSuspectLon ?? 77.2090
    const mockFix: RFVerifiedFix = {
      id: `rf-verified-${Date.now()}`,
      type: 'rf_verified_fix',
      latitude: baseLat + 0.00028,
      longitude: baseLon + 0.00019,
      rssi_dbm: -45,
      accuracy_m: 5,
      confidence: 98,
      timestamp: currentTimestamp || new Date().toISOString(),
      source: 'SDR',
      filename: file.name,
      frequency_mhz: 935.2,
    }

    const stepInterval = 450
    let step = 0
    const interval = setInterval(() => {
      step += 1
      if (step < PROCESSING_STEPS.length) {
        setCurrentStepIdx(step)
      } else {
        clearInterval(interval)
        setVerifiedFix(mockFix)
        setStage('complete')
        onVerificationComplete(mockFix)
      }
    }, stepInterval)
  }

  return (
    <Modal
      open={isOpen}
      onClose={handleModalClose}
      title="RF / SDR Ground Verification"
      size="md"
    >
      <p className="text-xs text-surface-500 dark:text-surface-400 -mt-2 mb-4">
        Upload a field RF sweep to refine the suspect location to high-precision ±5m.
      </p>
      <div className="space-y-4 pt-1">
        {stage === 'idle' && (
          <>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-cyan-300/80 bg-cyan-50/40 p-6 text-center transition-all hover:border-cyan-500 hover:bg-cyan-50 dark:border-cyan-800/60 dark:bg-cyan-950/20 dark:hover:border-cyan-600 dark:hover:bg-cyan-950/30 cursor-pointer"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json,.txt,.log"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400 mb-3 shadow-inner">
                <Radio className="h-6 w-6" />
              </div>

              <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">
                {file ? file.name : 'Drop SDR/RF scan here'}
              </p>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">
                {file ? `${(file.size / 1024).toFixed(1)} KB selected` : 'or click to browse your files'}
              </p>

              <div className="mt-3 flex items-center gap-1.5 text-2xs font-medium text-cyan-700 dark:text-cyan-300">
                <span className="rounded bg-cyan-100/80 px-1.5 py-0.5 dark:bg-cyan-900/50">CSV</span>
                <span className="rounded bg-cyan-100/80 px-1.5 py-0.5 dark:bg-cyan-900/50">JSON</span>
                <span className="rounded bg-cyan-100/80 px-1.5 py-0.5 dark:bg-cyan-900/50">TXT</span>
                <span className="rounded bg-cyan-100/80 px-1.5 py-0.5 dark:bg-cyan-900/50">LOG</span>
              </div>
            </div>

            <div className="rounded-lg bg-surface-100 p-3 text-xs text-surface-600 dark:bg-surface-800 dark:text-surface-300 flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Field SDR sweeps combine RSSI triangulation with hardware RF captures to isolate the suspect transmitter within the last 50 meters.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-surface-200 dark:border-surface-700">
              <Button variant="outline" onClick={handleModalClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!file}
                onClick={startProcessing}
                className="bg-cyan-600 hover:bg-cyan-700 text-white dark:bg-cyan-600 dark:hover:bg-cyan-700"
              >
                <Upload className="h-4 w-4 mr-1.5" />
                Upload & Correlate Sweep
              </Button>
            </div>
          </>
        )}

        {stage === 'processing' && (
          <div className="space-y-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                  Correlating RF Sweep Data
                </h4>
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  Analyzing {file?.name}...
                </p>
              </div>
            </div>

            {/* Stepper list */}
            <div className="space-y-2 rounded-lg border border-surface-200 bg-surface-50/50 p-3 dark:border-surface-700 dark:bg-surface-800/40">
              {PROCESSING_STEPS.map((label, idx) => {
                const isDone = idx < currentStepIdx
                const isCurrent = idx === currentStepIdx
                return (
                  <div key={label} className="flex items-center gap-2.5 text-xs">
                    {isDone ? (
                      <Check className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                    ) : isCurrent ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-600 dark:text-cyan-400 shrink-0" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full border border-surface-300 dark:border-surface-600 shrink-0" />
                    )}
                    <span
                      className={
                        isDone
                          ? 'text-surface-700 dark:text-surface-300'
                          : isCurrent
                          ? 'font-medium text-cyan-600 dark:text-cyan-400'
                          : 'text-surface-400 dark:text-surface-500'
                      }
                    >
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {stage === 'complete' && verifiedFix && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 rounded-lg border border-cyan-200 bg-cyan-50/70 p-3 dark:border-cyan-800/60 dark:bg-cyan-950/30">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-white shadow-md">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-cyan-900 dark:text-cyan-200">
                  RF Verification Complete
                </h4>
                <p className="text-xs text-cyan-700 dark:text-cyan-400">
                  High-confidence ground target verified within ±5m radius.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-surface-200 bg-surface-50 p-2.5 dark:border-surface-700 dark:bg-surface-800">
                <span className="text-2xs uppercase tracking-wider text-surface-500">Verified Accuracy</span>
                <p className="text-sm font-bold text-cyan-600 dark:text-cyan-400">±{verifiedFix.accuracy_m} meters</p>
              </div>
              <div className="rounded-lg border border-surface-200 bg-surface-50 p-2.5 dark:border-surface-700 dark:bg-surface-800">
                <span className="text-2xs uppercase tracking-wider text-surface-500">Peak Signal (RSSI)</span>
                <p className="text-sm font-bold text-surface-800 dark:text-surface-200">{verifiedFix.rssi_dbm} dBm</p>
              </div>
              <div className="rounded-lg border border-surface-200 bg-surface-50 p-2.5 dark:border-surface-700 dark:bg-surface-800">
                <span className="text-2xs uppercase tracking-wider text-surface-500">Confidence Score</span>
                <p className="text-sm font-bold text-green-600 dark:text-green-400">{verifiedFix.confidence}%</p>
              </div>
              <div className="rounded-lg border border-surface-200 bg-surface-50 p-2.5 dark:border-surface-700 dark:bg-surface-800">
                <span className="text-2xs uppercase tracking-wider text-surface-500">Verification Source</span>
                <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">Field SDR Sweep</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-surface-200 dark:border-surface-700">
              <Button
                variant="primary"
                onClick={handleModalClose}
                className="bg-cyan-600 hover:bg-cyan-700 text-white dark:bg-cyan-600 dark:hover:bg-cyan-700"
              >
                View Verified Target on Map
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

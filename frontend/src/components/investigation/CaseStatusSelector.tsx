import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, Check, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { investigationApi } from '@/services/api'
import { getCaseLifecycleStatus, cn } from '@/utils'
import type { CaseStatus } from '@/types'

interface CaseStatusOption {
  value: CaseStatus
  label: string
  description: string
  dotClass: string
  activeDotClass: string
}

const STATUS_OPTIONS: CaseStatusOption[] = [
  {
    value: 'Active',
    label: 'Active',
    description: 'Under active investigation & ongoing analysis',
    dotClass: 'bg-blue-500',
    activeDotClass: 'bg-blue-500 ring-4 ring-blue-500/25',
  },
  {
    value: 'Pending',
    label: 'Pending',
    description: 'On hold / awaiting additional data or warrants',
    dotClass: 'bg-yellow-500',
    activeDotClass: 'bg-yellow-500 ring-4 ring-yellow-500/25',
  },
  {
    value: 'Completed',
    label: 'Completed',
    description: 'Investigation officially concluded by officer',
    dotClass: 'bg-green-500',
    activeDotClass: 'bg-green-500 ring-4 ring-green-500/25',
  },
  {
    value: 'Archived',
    label: 'Archived',
    description: 'Preserved for historical forensic records',
    dotClass: 'bg-surface-400',
    activeDotClass: 'bg-surface-500 ring-4 ring-surface-500/25',
  },
]

interface CaseStatusSelectorProps {
  caseId: string
  currentStatus?: string | null
  onStatusChange?: (newStatus: CaseStatus) => void
  onMessage?: (msg: { type: 'success' | 'error'; text: string }) => void
  disabled?: boolean
  variant?: 'header' | 'card'
  className?: string
}

export function CaseStatusSelector({
  caseId,
  currentStatus,
  onStatusChange,
  onMessage,
  disabled = false,
  variant = 'header',
  className,
}: CaseStatusSelectorProps) {
  const normalizedStatus = getCaseLifecycleStatus({ status: currentStatus })
  const [isOpen, setIsOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<CaseStatus | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const executeStatusChange = useCallback(
    async (targetStatus: CaseStatus) => {
      if (targetStatus === normalizedStatus || isUpdating) return
      setIsUpdating(true)
      setIsOpen(false)
      setPendingConfirmation(null)

      try {
        await investigationApi.updateStatus(caseId, targetStatus)
        onStatusChange?.(targetStatus)
        onMessage?.({
          type: 'success',
          text: `Case status updated to ${targetStatus}`,
        })
      } catch (err: unknown) {
        const errorMsg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          (err as Error)?.message ||
          'Failed to update case status'
        onMessage?.({
          type: 'error',
          text: errorMsg,
        })
      } finally {
        setIsUpdating(false)
      }
    },
    [caseId, normalizedStatus, isUpdating, onStatusChange, onMessage]
  )

  const handleSelectOption = (targetStatus: CaseStatus) => {
    if (targetStatus === normalizedStatus || isUpdating || disabled) return

    // Confirmation modal for Completed and Archived
    if (targetStatus === 'Completed' || targetStatus === 'Archived') {
      setPendingConfirmation(targetStatus)
      setIsOpen(false)
      return
    }

    // Direct transition for Active and Pending
    executeStatusChange(targetStatus)
  }

  const currentOption = STATUS_OPTIONS.find((o) => o.value === normalizedStatus) || STATUS_OPTIONS[0]

  return (
    <div className={cn('relative inline-flex items-center', className)} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled || isUpdating}
        onClick={() => setIsOpen((prev) => !prev)}
        title="Click to change case lifecycle status"
        className={cn(
          'group inline-flex items-center gap-2 rounded-lg font-bold tracking-wide transition-all duration-150 cursor-pointer select-none',
          'border shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40',
          variant === 'header'
            ? 'px-3 py-1.5 text-xs uppercase'
            : 'px-2.5 py-1 text-xs',
          normalizedStatus === 'Active' &&
            'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 hover:border-blue-400 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-700/80 dark:hover:bg-blue-900/60 ring-1 ring-blue-500/20',
          normalizedStatus === 'Pending' &&
            'bg-yellow-50 text-yellow-800 border-yellow-300 hover:bg-yellow-100 hover:border-yellow-400 dark:bg-yellow-950/60 dark:text-yellow-300 dark:border-yellow-700/80 dark:hover:bg-yellow-900/60 ring-1 ring-yellow-500/20',
          normalizedStatus === 'Completed' &&
            'bg-green-50 text-green-800 border-green-300 hover:bg-green-100 hover:border-green-400 dark:bg-green-950/60 dark:text-green-300 dark:border-green-700/80 dark:hover:bg-green-900/60 ring-1 ring-green-500/20',
          normalizedStatus === 'Archived' &&
            'bg-surface-100 text-surface-700 border-surface-300 hover:bg-surface-200 hover:border-surface-400 dark:bg-surface-800 dark:text-surface-300 dark:border-surface-600 dark:hover:bg-surface-700 ring-1 ring-surface-500/20',
          (disabled || isUpdating) && 'opacity-60 cursor-not-allowed'
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {isUpdating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-current" />
        ) : (
          <span className={cn('h-2.5 w-2.5 rounded-full shrink-0 shadow-xs', currentOption.dotClass)} />
        )}
        <span className="font-semibold">{currentOption.label}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 opacity-70 group-hover:opacity-100 transition-transform duration-200 shrink-0',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full left-0 z-[100] mt-1.5 w-72 rounded-xl border border-surface-200 bg-white p-2 shadow-2xl dark:border-surface-700 dark:bg-surface-850"
            role="listbox"
          >
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-surface-100 dark:border-surface-700/70 mb-1.5">
              <span className="text-2xs font-bold uppercase tracking-wider text-surface-400">
                Case Lifecycle Status
              </span>
              <span className="text-2xs text-surface-400">Officer Action</span>
            </div>

            <div className="space-y-1">
              {STATUS_OPTIONS.map((opt) => {
                const isSelected = opt.value === normalizedStatus
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectOption(opt.value)}
                    className={cn(
                      'w-full flex items-start gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-all cursor-pointer',
                      isSelected
                        ? 'bg-surface-100 dark:bg-surface-750 font-semibold text-surface-900 dark:text-surface-100 ring-1 ring-surface-300 dark:ring-surface-600'
                        : 'text-surface-600 hover:bg-surface-50 dark:text-surface-300 dark:hover:bg-surface-800'
                    )}
                  >
                    <span
                      className={cn(
                        'mt-1 h-2.5 w-2.5 rounded-full shrink-0',
                        isSelected ? opt.activeDotClass : opt.dotClass
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-surface-900 dark:text-surface-100">
                          {opt.label}
                        </span>
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-2xs text-surface-400 leading-tight mt-0.5">
                        {opt.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for Completed / Archived */}
      <Modal
        open={pendingConfirmation !== null}
        onClose={() => setPendingConfirmation(null)}
        title={
          pendingConfirmation === 'Completed'
            ? 'Mark Investigation as Completed?'
            : 'Archive Investigation?'
        }
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-surface-500 dark:text-surface-400">
            {pendingConfirmation === 'Completed'
              ? 'This indicates that the officer considers the investigation complete. Technical tracking and multilateration status will remain unchanged.'
              : 'This marks the investigation as archived. You can reopen it at any time.'}
          </p>
          <div className="rounded-lg border border-surface-200 bg-surface-50 p-3 dark:border-surface-700 dark:bg-surface-800/60 text-xs text-surface-600 dark:text-surface-300 space-y-1">
            <p className="font-semibold text-surface-800 dark:text-surface-200">
              {pendingConfirmation === 'Completed' ? 'Investigation Conclusion' : 'Forensic Archiving'}
            </p>
            <p>
              {pendingConfirmation === 'Completed'
                ? 'Case files, localization fixes, and telemetry will remain accessible. The case will be categorized under the Completed filter.'
                : 'The case will be moved to the Archived filter for long-term record keeping.'}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPendingConfirmation(null)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              variant={pendingConfirmation === 'Completed' ? 'primary' : 'secondary'}
              size="sm"
              loading={isUpdating}
              onClick={() => pendingConfirmation && executeStatusChange(pendingConfirmation)}
            >
              {pendingConfirmation === 'Completed' ? 'Mark Completed' : 'Archive Case'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

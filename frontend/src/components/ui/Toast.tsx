import {
  createContext, useCallback, useContext, useEffect,
  useMemo, useRef, useState, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/utils'

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface ToastOptions {
  title: string
  description?: string
  variant?: ToastVariant
  /** Optional inline call-to-action, e.g. "Return to Surat". */
  actionLabel?: string
  onAction?: () => void
  /** ms; pass 0 to keep it until dismissed. */
  duration?: number
}

interface ToastItem extends Required<Omit<ToastOptions, 'description' | 'onAction'>> {
  id: string
  description?: string
  onAction?: () => void
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

const VARIANT_STYLES: Record<ToastVariant, { icon: typeof Info; ring: string; iconColor: string }> = {
  info:    { icon: Info,           ring: 'border-surface-200 dark:border-surface-700',                    iconColor: 'text-primary-600 dark:text-primary-400' },
  success: { icon: CheckCircle2,   ring: 'border-emerald-200 dark:border-emerald-800/60',              iconColor: 'text-emerald-600 dark:text-emerald-400' },
  warning: { icon: AlertTriangle,  ring: 'border-amber-200 dark:border-amber-700/60',                  iconColor: 'text-amber-600 dark:text-amber-400' },
  error:   { icon: XCircle,        ring: 'border-danger/30 dark:border-danger/50',                     iconColor: 'text-danger dark:text-danger' },
}

const DEFAULT_DURATION = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current[id]
    if (timer) {
      clearTimeout(timer)
      delete timers.current[id]
    }
  }, [])

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const variant = options.variant ?? 'info'
      const item: ToastItem = {
        id,
        title: options.title,
        description: options.description,
        variant,
        actionLabel: options.actionLabel ?? '',
        onAction: options.onAction,
        duration: options.duration ?? DEFAULT_DURATION,
      }

      // Cap the stack so a burst of events can't wallpaper the screen.
      setToasts((prev) => [...prev, item].slice(-3))

      if (item.duration > 0) {
        timers.current[id] = setTimeout(() => dismiss(id), item.duration)
      }
      return id
    },
    [dismiss]
  )

  // Clear every pending timer if the provider unmounts.
  useEffect(() => {
    const pending = timers.current
    return () => { Object.values(pending).forEach(clearTimeout) }
  }, [])

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-none fixed bottom-4 right-4 z-[10020] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
            role="region"
            aria-label="Notifications"
          >
            <AnimatePresence initial={false}>
              {toasts.map((t) => {
                const { icon: Icon, ring, iconColor } = VARIANT_STYLES[t.variant]
                return (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, y: 16, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0,  scale: 1 }}
                    exit={{ opacity: 0, y: 8,  scale: 0.97 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    role="status"
                    aria-live="polite"
                    className={cn(
                      'pointer-events-auto flex items-start gap-3 rounded-xl border bg-white/95 px-4 py-3 shadow-xl backdrop-blur-md',
                      'dark:bg-surface-800/95',
                      ring
                    )}
                  >
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconColor)} />

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                        {t.title}
                      </p>
                      {t.description && (
                        <p className="mt-0.5 text-xs leading-relaxed text-surface-600 dark:text-surface-300">
                          {t.description}
                        </p>
                      )}
                      {t.actionLabel && (
                        <button
                          type="button"
                          onClick={() => {
                            t.onAction?.()
                            dismiss(t.id)
                          }}
                          className="mt-2 cursor-pointer rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-500/10 dark:text-primary-300 dark:hover:bg-primary-500/20"
                        >
                          {t.actionLabel}
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => dismiss(t.id)}
                      aria-label="Dismiss notification"
                      className="-mr-1 -mt-1 shrink-0 cursor-pointer rounded-lg p-1 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-700 dark:hover:text-surface-200"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  )
}
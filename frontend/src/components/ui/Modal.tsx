import { type ReactNode, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X } from 'lucide-react'
import { cn } from '@/utils'

interface ModalProps {
  open:     boolean
  onClose:  () => void
  title?:   string
  children: ReactNode
  size?:    'sm' | 'md' | 'lg' | 'xl'
  footer?:  ReactNode
}

const sizeClass = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function Modal({ open, onClose, title, children, size = 'md', footer }: ModalProps) {
  const panelRef   = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  // ── Escape key ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // ── Body scroll lock ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // ── Focus management: move focus into modal on open,
  //    trap focus within panel while open ──────────────────────────────────
  useEffect(() => {
    if (!open) return

    // Move focus to the close button (first focusable) when modal opens
    closeBtnRef.current?.focus()

    function trapFocus(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
      )
      const first = focusable[0]
      const last  = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus() }
      }
    }

    document.addEventListener('keydown', trapFocus)
    return () => document.removeEventListener('keydown', trapFocus)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            className={cn(
              'relative w-full rounded-xl bg-white shadow-2xl dark:bg-surface-800',
              'border border-surface-200 dark:border-surface-700',
              sizeClass[size]
            )}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{    opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {/* Header */}
            {title ? (
              <div className="flex items-center justify-between border-b border-surface-200 px-6 py-4 dark:border-surface-700">
                <h2
                  id="modal-title"
                  className="text-base font-semibold text-surface-900 dark:text-surface-100"
                >
                  {title}
                </h2>
                <button
                  ref={closeBtnRef}
                  onClick={onClose}
                  className="btn btn-ghost btn-sm rounded-lg p-1.5"
                  aria-label="Close modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                ref={closeBtnRef}
                onClick={onClose}
                className="btn btn-ghost btn-sm absolute right-4 top-4 rounded-lg p-1.5"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* Body */}
            <div className="p-6">{children}</div>

            {/* Footer */}
            {footer && (
              <div className="flex items-center justify-end gap-3 border-t border-surface-200 px-6 py-4 dark:border-surface-700">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { X, ChevronLeft, ChevronRight, Check, Sparkles } from 'lucide-react'
import { cn } from '@/utils'

export interface TourStep {
  /** CSS selector of the element to spotlight. Omit for a centered card. */
  selector?: string
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

export const WORKSPACE_STEPS: TourStep[] = [
  {
    title: 'Welcome to your workspace',
    body: 'A quick 30-second tour of the E-Rakshak investigation console. You can skip anytime.',
  },
  {
    selector: '[data-tour="sidebar-nav"]',
    placement: 'right',
    title: 'Navigate the console',
    body: 'Everything lives in this sidebar — cases, live tracking, reports, and settings.',
  },
  {
    selector: '[data-tour="nav-dashboard"]',
    placement: 'right',
    title: 'Dashboard',
    body: 'Your caseload at a glance: active cases, uploads, localization fixes, and recent activity.',
  },
  {
    selector: '[data-tour="nav-investigations"]',
    placement: 'right',
    title: 'Investigations',
    body: 'Create and manage cases, then upload CDR/tower data to run multilateration.',
  },
  {
    selector: '[data-tour="nav-live"]',
    placement: 'right',
    title: 'Live Tracking',
    body: 'Open the tactical map to pinpoint, track, and playback a suspect location.',
  },
  {
    selector: '[data-tour="nav-reports"]',
    placement: 'right',
    title: 'Reports',
    body: 'Generate court-admissible forensic reports and export CSV / KML / GeoJSON.',
  },
  {
    selector: '[data-tour="notifications"]',
    placement: 'bottom',
    title: 'Notifications',
    body: 'Live alerts — tower changes, signal loss, rogue BTS detection, and report readiness.',
  },
  {
    selector: '[data-tour="theme-toggle"]',
    placement: 'bottom',
    title: 'Light or dark',
    body: 'Switch the interface theme whenever you like. Your choice is remembered.',
  },
  {
    selector: '[data-tour="user-menu"]',
    placement: 'bottom',
    title: 'Your account',
    body: 'Access your profile, admin tools (if applicable), and log out. That’s the tour!',
  },
]

interface Rect { top: number; left: number; width: number; height: number }

interface WorkspaceTourProps {
  open: boolean
  onFinish: () => void
  /** Custom step list. Defaults to the global workspace tour. */
  steps?: TourStep[]
}

const CARD_W = 340

/** Measures a selector against the viewport; re-runs on resize/scroll. */
function useElementRect(selector: string | undefined, active: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null)

  const measure = useCallback(() => {
    if (!selector) { setRect(null); return }
    const el = document.querySelector(selector)
    if (!el) { setRect(null); return }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [selector])

  useLayoutEffect(() => {
    if (!active) return
    measure()
    // Re-measure on the next frame too (after layout settles).
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [active, measure])

  return rect
}

/** Given the target rect + placement, compute the tooltip's fixed position. */
function computeCardPosition(rect: Rect | null, placement: TourStep['placement']) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const GAP = 14
  const MARGIN = 12

  if (!rect) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' as const }
  }

  const place = placement ?? 'bottom'
  let top = 0
  let left = 0

  if (place === 'right') {
    left = rect.left + rect.width + GAP
    top = rect.top + rect.height / 2
  } else if (place === 'left') {
    left = rect.left - CARD_W - GAP
    top = rect.top + rect.height / 2
  } else if (place === 'top') {
    left = rect.left + rect.width / 2 - CARD_W / 2
    top = rect.top - GAP
  } else {
    left = rect.left + rect.width / 2 - CARD_W / 2
    top = rect.top + rect.height + GAP
  }

  // Clamp inside the viewport
  left = Math.min(Math.max(MARGIN, left), vw - CARD_W - MARGIN)
  top = Math.min(Math.max(MARGIN, top), vh - MARGIN)

  // Vertical anchoring: for left/right we centered on the target, so translateY(-50%)
  const transform =
    place === 'left' || place === 'right' ? 'translateY(-50%)' : 'none'

  return { top: `${top}px`, left: `${left}px`, transform }
}

export function WorkspaceTour({ open, onFinish, steps = WORKSPACE_STEPS }: WorkspaceTourProps) {
  const [index, setIndex] = useState(0)
  const step = steps[index]
  const isLast = index === steps.length - 1

  const rect = useElementRect(step?.selector, open)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Reset to the first step each time the tour opens.
  useEffect(() => {
    if (open) setIndex(0)
  }, [open])

  // Focus the card heading when the step changes for screen readers / keyboard.
  useEffect(() => {
    if (open) headingRef.current?.focus()
  }, [open, index])

  const next = useCallback(() => {
    setIndex((i) => (i < steps.length - 1 ? i + 1 : i))
    if (isLast) onFinish()
  }, [isLast, onFinish, steps.length])

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  // Keyboard controls
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onFinish() }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, next, back, onFinish])

  // Lock body scroll while the tour is active
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (typeof document === 'undefined' || !open) return null

  const effectiveRect = step?.selector ? rect : null
  const cardPos = computeCardPosition(effectiveRect, step?.placement)

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[10050]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Click-catcher backdrop */}
          <div className="absolute inset-0" onClick={onFinish} aria-hidden="true" />

          {/* Spotlight — a transparent window with a giant shadow that dims the rest */}
          {effectiveRect ? (
            <motion.div
              className="pointer-events-none absolute rounded-xl ring-2 ring-primary-400/80"
              initial={false}
              animate={{
                top: effectiveRect.top - 6,
                left: effectiveRect.left - 6,
                width: effectiveRect.width + 12,
                height: effectiveRect.height + 12,
              }}
              transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
              style={{ boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.66)' }}
            />
          ) : (
            // Centered steps: dim the whole screen with no cut-out
            <div className="absolute inset-0" style={{ background: 'rgba(2, 6, 23, 0.66)' }} />
          )}

          {/* Tooltip card */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Workspace tour"
            className="absolute w-[340px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-surface-200 bg-white p-5 shadow-2xl dark:border-surface-700 dark:bg-surface-900"
            style={cardPos}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18 }}
          >
            {/* Header */}
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="text-2xs font-bold uppercase tracking-wider text-surface-400">
                  Step {index + 1} of {steps.length}
                </span>
              </div>
              <button
                onClick={onFinish}
                className="rounded-lg p-1 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-800 dark:hover:text-surface-200"
                aria-label="Skip tour"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <h3
              ref={headingRef}
              tabIndex={-1}
              className="mb-1.5 text-sm font-bold text-surface-900 outline-none dark:text-surface-100"
            >
              {step.title}
            </h3>
            <p className="text-xs leading-relaxed text-surface-500 dark:text-surface-400">
              {step.body}
            </p>

            {/* Progress dots */}
            <div className="mt-4 flex items-center gap-1.5">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-200',
                    i === index ? 'w-4 bg-primary-500' : 'w-1.5 bg-surface-300 dark:bg-surface-600'
                  )}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={onFinish}
                className="text-xs font-medium text-surface-400 transition-colors hover:text-surface-600 dark:hover:text-surface-200"
              >
                Skip tour
              </button>

              <div className="flex items-center gap-2">
                {index > 0 && (
                  <button
                    onClick={back}
                    className="inline-flex items-center gap-1 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-semibold text-surface-600 transition-colors hover:bg-surface-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                )}
                <button
                  onClick={next}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-700 active:scale-[0.98]"
                >
                  {isLast ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Finish
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

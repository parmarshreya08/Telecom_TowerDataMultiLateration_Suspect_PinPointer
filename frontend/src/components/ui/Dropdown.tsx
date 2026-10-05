import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/utils'

export interface DropdownOption {
  value: string
  label: string
  description?: string
  icon?: ReactNode
  disabled?: boolean
}

interface DropdownProps {
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  placeholder?: string
  disabled?: boolean
  /** Visual size — `sm` matches compact toolbars, `md` matches the standard input. */
  size?: 'sm' | 'md'
  /** Rendered label for the selected value when it is not in `options`. */
  id?: string
  className?: string
  menuClassName?: string
  align?: 'left' | 'right'
  'aria-label'?: string
}

/**
 * Dropdown — fully themed replacement for the native <select>.
 *
 * Renders a custom popup (instead of the OS menu) so trigger and options share
 * the app's surface / primary palette in both light and dark mode.
 * Mirrors the popup styling of CaseStatusSelector for visual consistency.
 */
export const Dropdown = forwardRef<HTMLButtonElement, DropdownProps>(function Dropdown(
  {
    value,
    onChange,
    options,
    placeholder = 'Select…',
    disabled = false,
    size = 'md',
    id,
    className,
    menuClassName,
    align = 'left',
    'aria-label': ariaLabel,
  },
  ref
) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlight, setHighlight] = useState<number>(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const generatedId = useId()
  const listboxId = `dropdown-${id ?? generatedId}`
  const activeIndex = options.findIndex((o) => o.value === value)
  const selected = activeIndex >= 0 ? options[activeIndex] : undefined

  const close = useCallback(() => setIsOpen(false), [])

  const open = useCallback(() => {
    if (disabled) return
    setIsOpen(true)
    const idx = activeIndex >= 0 ? activeIndex : options.findIndex((o) => !o.disabled)
    setHighlight(idx)
  }, [disabled, activeIndex, options])

  const toggle = useCallback(() => (isOpen ? close() : open()), [isOpen, close, open])

  const commit = useCallback(
    (index: number) => {
      const opt = options[index]
      if (!opt || opt.disabled) return
      onChange(opt.value)
      close()
    },
    [options, onChange, close]
  )

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [isOpen, close])

  // Keep the highlighted option in view
  useEffect(() => {
    if (!isOpen || highlight < 0) return
    const node = listRef.current?.querySelectorAll('[role="option"]')[highlight] as HTMLElement | undefined
    node?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, highlight])

  function moveCursor(delta: number) {
    if (options.length === 0) return
    let next = highlight
    for (let i = 0; i < options.length; i++) {
      next = (next + delta + options.length) % options.length
      if (!options[next]?.disabled) break
    }
    setHighlight(next)
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault()
        if (!isOpen) open()
        else moveCursor(e.key === 'ArrowDown' ? 1 : -1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (isOpen) commit(highlight)
        else open()
        break
      case 'Escape':
        if (isOpen) {
          e.preventDefault()
          close()
        }
        break
      case 'Home':
        if (isOpen) {
          e.preventDefault()
          setHighlight(0)
        }
        break
      case 'End':
        if (isOpen) {
          e.preventDefault()
          setHighlight(options.length - 1)
        }
        break
    }
  }

  const sizeClasses =
    size === 'sm'
      ? 'px-2.5 py-1.5 text-xs gap-1.5'
      : 'px-3 py-2 text-sm gap-2'

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={ref}
        type="button"
        id={id}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'flex w-full items-center justify-between rounded-lg border text-left transition-colors',
          'border-surface-300 bg-white text-surface-800',
          'hover:border-surface-400',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500',
          'dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 dark:hover:border-surface-500',
          sizeClasses,
          disabled && 'cursor-not-allowed opacity-50'
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={ariaLabel}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.icon && <span className="shrink-0">{selected.icon}</span>}
          <span className={cn('truncate', !selected && 'text-surface-400 dark:text-surface-500')}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-surface-400 transition-transform duration-200 dark:text-surface-500',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={listRef}
            id={listboxId}
            role="listbox"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'absolute z-[100] mt-1.5 max-h-72 min-w-full overflow-y-auto rounded-xl border p-1 shadow-2xl',
              'border-surface-200 bg-white',
              'dark:border-surface-700 dark:bg-surface-850',
              align === 'right' ? 'right-0' : 'left-0',
              menuClassName
            )}
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-surface-400">No options</div>
            ) : (
              options.map((opt, i) => {
                const isSelected = opt.value === value
                const isHighlighted = i === highlight
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onClick={() => commit(i)}
                    onMouseEnter={() => !opt.disabled && setHighlight(i)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      opt.disabled && 'cursor-not-allowed opacity-40',
                      !opt.disabled && isHighlighted && 'bg-surface-100 dark:bg-surface-700/70',
                      isSelected
                        ? 'font-semibold text-primary-700 dark:text-primary-300'
                        : 'text-surface-700 dark:text-surface-200'
                    )}
                  >
                    {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{opt.label}</span>
                      {opt.description && (
                        <span className="mt-0.5 block text-xs font-normal text-surface-400 dark:text-surface-500">
                          {opt.description}
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
                    )}
                  </button>
                )
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

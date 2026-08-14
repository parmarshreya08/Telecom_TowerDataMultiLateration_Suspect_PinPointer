import { type ReactNode, useState } from 'react'
import { cn } from '@/utils'

interface TooltipProps {
  content: string
  children: ReactNode
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

const positionClass: Record<NonNullable<TooltipProps['placement']>, string> = {
  top:    'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left:   'right-full top-1/2 mr-2 -translate-y-1/2',
  right:  'left-full top-1/2 ml-2 -translate-y-1/2',
}

export function Tooltip({ content, children, placement = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocusCapture={() => setVisible(true)}
      onBlurCapture={() => setVisible(false)}
    >
      {children}

      {/* Tooltip bubble — always in DOM so CSS transitions work;
          hidden via opacity/pointer-events rather than conditional render */}
      <div
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-surface-900 px-2.5 py-1.5',
          'text-xs font-medium text-white shadow-lg dark:bg-surface-700',
          'transition-opacity duration-150',
          positionClass[placement],
          visible ? 'opacity-100' : 'opacity-0',
          // Respect prefers-reduced-motion — skip the fade
          'motion-reduce:transition-none'
        )}
      >
        {content}
        {/* Arrow */}
        <span
          className={cn(
            'absolute h-0 w-0 border-4 border-transparent',
            placement === 'top'    && 'left-1/2 top-full -translate-x-1/2 border-t-surface-900 dark:border-t-surface-700',
            placement === 'bottom' && 'bottom-full left-1/2 -translate-x-1/2 border-b-surface-900 dark:border-b-surface-700',
            placement === 'left'   && 'left-full top-1/2 -translate-y-1/2 border-l-surface-900 dark:border-l-surface-700',
            placement === 'right'  && 'right-full top-1/2 -translate-y-1/2 border-r-surface-900 dark:border-r-surface-700',
          )}
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

import { type ReactNode, useState } from 'react'
import { cn } from '@/utils'

interface TooltipProps {
  content: string
  children: ReactNode
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

export function Tooltip({ content, children, placement = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false)

  const positionClass = {
    top:    '-top-9 left-1/2 -translate-x-1/2',
    bottom: '-bottom-9 left-1/2 -translate-x-1/2',
    left:   'right-full -translate-y-1/2 top-1/2 mr-2',
    right:  'left-full -translate-y-1/2 top-1/2 ml-2',
  }[placement]

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded bg-surface-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-surface-700',
            positionClass
          )}
          role="tooltip"
        >
          {content}
        </div>
      )}
    </div>
  )
}

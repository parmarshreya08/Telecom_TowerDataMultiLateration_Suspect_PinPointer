import { type ReactNode } from 'react'
import { cn } from '@/utils'

type Variant = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'custom'

interface BadgeProps {
  variant?: Variant
  className?: string
  children: ReactNode
  dot?: boolean
}

const variantClass: Record<Variant, string> = {
  primary: 'badge-primary',
  success: 'badge-success',
  warning: 'badge-warning',
  danger:  'badge-danger',
  neutral: 'badge-neutral',
  custom:  '',
}

export function Badge({ variant = 'neutral', className, children, dot }: BadgeProps) {
  return (
    <span className={cn(variantClass[variant], 'badge', className)}>
      {dot && (
        <span className={cn('status-dot', {
          'bg-primary-500': variant === 'primary',
          'bg-success':     variant === 'success',
          'bg-warning':     variant === 'warning',
          'bg-danger':      variant === 'danger',
          'bg-surface-400': variant === 'neutral',
        })} />
      )}
      {children}
    </span>
  )
}

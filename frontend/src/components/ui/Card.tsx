import { type ReactNode } from 'react'
import { cn } from '@/utils'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
  onClick?: () => void
}

const paddingClass = {
  none: '',
  sm:   'p-4',
  md:   'p-5',
  lg:   'p-6',
}

export function Card({ children, className, hover, padding = 'md', onClick }: CardProps) {
  return (
    <div
      className={cn(hover ? 'card-hover' : 'card', paddingClass[padding], className)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps { children: ReactNode; className?: string }
export function CardHeader({ children, className }: CardHeaderProps) {
  return <div className={cn('mb-4 flex items-center justify-between', className)}>{children}</div>
}

interface CardTitleProps { children: ReactNode; className?: string }
export function CardTitle({ children, className }: CardTitleProps) {
  return <h3 className={cn('text-sm font-semibold text-surface-900 dark:text-surface-100', className)}>{children}</h3>
}

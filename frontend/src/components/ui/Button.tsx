import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/utils'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
type Size    = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
}

const variantClass: Record<Variant, string> = {
  primary:   'btn-primary',
  secondary: 'btn-secondary',
  danger:    'btn-danger',
  ghost:     'btn-ghost',
  outline:   'btn-outline',
}

const sizeClass: Record<Size, string> = {
  xs: 'btn-xs px-2 py-1 text-2xs',
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, iconRight, className, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn('btn', variantClass[variant], sizeClass[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
      {iconRight && !loading && <span className="shrink-0">{iconRight}</span>}
    </button>
  )
})

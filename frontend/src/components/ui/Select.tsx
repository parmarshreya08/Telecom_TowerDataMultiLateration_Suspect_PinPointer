import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from '@/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, options, placeholder, className, id, ...props },
  ref
) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-surface-700 dark:text-surface-300"
        >
          {label}
          {props.required && <span className="ml-1 text-danger">*</span>}
        </label>
      )}

      {/* Wrapper provides the custom chevron via pseudo-element / background */}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'input appearance-none pr-9',
            error && 'input-error',
            className
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${selectId}-error` : undefined}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Chevron icon — uses currentColor so it adapts to light/dark */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-surface-400 dark:text-surface-500">
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {error && (
        <p id={`${selectId}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})

import { useId } from 'react'
import { Dropdown, type DropdownOption } from './Dropdown'
import { cn } from '@/utils'

interface SelectProps {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
  disabled?: boolean
  required?: boolean
  id?: string
  className?: string
}

/**
 * Select — labelled form field backed by the themed Dropdown primitive.
 *
 * Kept as a distinct component so form layouts keep the label/error styling,
 * but the popup is fully app-rendered (no native OS menu).
 * Emits the selected value directly: `onChange={(value) => ...}`.
 */
export function Select({
  label,
  error,
  options,
  placeholder,
  value,
  onChange,
  disabled,
  required,
  id,
  className,
}: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  const generatedId = useId()

  const dropdownOptions: DropdownOption[] = options.map((o) => ({
    value: o.value,
    label: o.label,
  }))

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-surface-700 dark:text-surface-300"
        >
          {label}
          {required && <span className="ml-1 text-danger">*</span>}
        </label>
      )}

      <Dropdown
        id={selectId ?? `select-${generatedId}`}
        value={value ?? ''}
        onChange={(v) => onChange?.(v)}
        options={dropdownOptions}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label}
      />

      {error && (
        <p id={`${selectId}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

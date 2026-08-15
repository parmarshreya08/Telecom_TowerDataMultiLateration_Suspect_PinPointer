import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils'
import { Button } from './Button'

export interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage?: number
  onPageChange: (page: number) => void
  className?: string
}

function getPaginationItems(
  currentPage: number,
  totalPages: number,
  siblingCount = 1
): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const leftSiblingIndex = Math.max(currentPage - siblingCount, 1)
  const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages)

  const shouldShowLeftDots = leftSiblingIndex > 2
  const shouldShowRightDots = rightSiblingIndex < totalPages - 1

  if (!shouldShowLeftDots && shouldShowRightDots) {
    const leftItemCount = 3 + 2 * siblingCount
    const leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1)
    return [...leftRange, '...', totalPages]
  }

  if (shouldShowLeftDots && !shouldShowRightDots) {
    const rightItemCount = 3 + 2 * siblingCount
    const rightRange = Array.from(
      { length: rightItemCount },
      (_, i) => totalPages - rightItemCount + i + 1
    )
    return [1, '...', ...rightRange]
  }

  const middleRange = Array.from(
    { length: rightSiblingIndex - leftSiblingIndex + 1 },
    (_, i) => leftSiblingIndex + i
  )
  return [1, '...', ...middleRange, '...', totalPages]
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage = 10,
  onPageChange,
  className,
}) => {
  if (totalPages <= 0 || totalItems <= 0) {
    return null
  }

  const startIndex = (currentPage - 1) * itemsPerPage + 1
  const endIndex = Math.min(currentPage * itemsPerPage, totalItems)
  const paginationItems = getPaginationItems(currentPage, totalPages)

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-surface-200 dark:border-surface-800',
        className
      )}
    >
      <p className="text-xs sm:text-sm text-surface-500 dark:text-surface-400 select-none">
        Showing{' '}
        <span className="font-medium text-surface-900 dark:text-surface-100">
          {startIndex}
        </span>
        –
        <span className="font-medium text-surface-900 dark:text-surface-100">
          {endIndex}
        </span>{' '}
        of{' '}
        <span className="font-medium text-surface-900 dark:text-surface-100">
          {totalItems}
        </span>{' '}
        cases
      </p>

      <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-center">
        {/* Previous button */}
        <Button
          variant="secondary"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          icon={<ChevronLeft className="h-4 w-4" />}
          className="px-2.5 sm:px-3 text-xs"
          aria-label="Go to previous page"
        >
          <span className="hidden sm:inline">Previous</span>
        </Button>

        {/* Page numbers with ellipsis */}
        {paginationItems.map((item, idx) => {
          if (item === '...') {
            return (
              <span
                key={`ellipsis-${idx}`}
                className="px-1.5 sm:px-2 py-1 text-xs text-surface-400 select-none"
              >
                ...
              </span>
            )
          }

          const isCurrent = item === currentPage

          return (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-current={isCurrent ? 'page' : undefined}
              aria-label={`Page ${item}`}
              className={cn(
                'min-w-[32px] h-8 px-2 rounded-lg text-xs font-medium transition-all duration-150 flex items-center justify-center cursor-pointer',
                isCurrent
                  ? 'bg-primary-600 text-white font-semibold shadow-sm hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-500'
                  : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-100 border border-transparent hover:border-surface-200 dark:hover:border-surface-700'
              )}
            >
              {item}
            </button>
          )
        })}

        {/* Next button */}
        <Button
          variant="secondary"
          size="sm"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          iconRight={<ChevronRight className="h-4 w-4" />}
          className="px-2.5 sm:px-3 text-xs"
          aria-label="Go to next page"
        >
          <span className="hidden sm:inline">Next</span>
        </Button>
      </div>
    </div>
  )
}

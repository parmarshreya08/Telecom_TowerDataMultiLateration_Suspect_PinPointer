export function PageLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-surface-50 dark:bg-surface-950">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-primary-200 dark:border-primary-900" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary-600 animate-spin" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-semibold text-surface-700 dark:text-surface-300">
            E-Rakshak
          </span>
          <span className="text-xs text-surface-400">Loading platform...</span>
        </div>
      </div>
    </div>
  )
}

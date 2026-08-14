/**
 * PageLoader — full-screen loading state used as the Suspense fallback
 * for all lazy-loaded pages.
 *
 * Uses the same dark background as the landing / auth pages so there is
 * no jarring white flash while React lazy-loads a chunk.
 */
import { Logo } from '@/components/ui/Logo'

export function PageLoader() {
  return (
    <div
      className="flex h-screen w-full flex-col items-center justify-center gap-5"
      style={{ background: 'linear-gradient(160deg, #060d1a 0%, #0c1a33 55%, #07111f 100%)' }}
      aria-label="Loading E-Rakshak platform"
      role="status"
    >
      {/* Logo */}
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary-700/40 bg-primary-950/60">
        <Logo size={36} />
      </div>

      {/* Spinner */}
      <div className="relative h-10 w-10">
        {/* Track */}
        <div className="absolute inset-0 rounded-full border-[3px] border-primary-900/60" />
        {/* Spinner arc */}
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-primary-500" />
      </div>

      {/* Labels */}
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-sm font-semibold tracking-wide text-white">E-RAKSHAK</span>
        <span className="text-xs text-slate-500">Loading platform…</span>
      </div>
    </div>
  )
}


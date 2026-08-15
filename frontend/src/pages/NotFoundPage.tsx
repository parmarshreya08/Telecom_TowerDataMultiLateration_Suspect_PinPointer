/**
 * NotFoundPage — 404 page, visually consistent with the dark E-RAKSHAK theme.
 */

import { lazy, Suspense } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Home } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'

const TechBackground = lazy(() =>
  import('@/components/landing/TechBackground').then((m) => ({ default: m.TechBackground }))
)

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-6 text-center"
      style={{ background: 'linear-gradient(160deg, #060d1a 0%, #0c1a33 55%, #07111f 100%)' }}
    >
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <Suspense fallback={null}>
          <TechBackground className="w-full h-full" />
        </Suspense>
      </div>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, rgba(6,13,26,0.50) 0%, rgba(6,13,26,0.80) 100%)' }}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 max-w-md">
        {/* Logo */}
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary-700/40 bg-primary-950/60 backdrop-blur-sm">
          <Logo size={32} />
        </div>

        {/* 404 */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-400 mb-3">
            Error 404
          </p>
          <h1
            className="text-8xl font-bold leading-none"
            style={{
              background: 'linear-gradient(95deg, #93c5fd 0%, #38bdf8 55%, #60a5fa 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            404
          </h1>
          <p className="mt-4 text-lg font-semibold text-white">Page Not Found</p>
          <p className="mt-2 text-sm text-slate-400 max-w-xs mx-auto">
            This route doesn't exist or you don't have access to it.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-300 backdrop-blur-sm transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition"
            style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              boxShadow: '0 0 20px rgba(37,99,235,0.30)',
            }}
          >
            <Home className="h-4 w-4" />
            Return Home
          </Link>
        </div>
      </div>
    </div>
  )
}

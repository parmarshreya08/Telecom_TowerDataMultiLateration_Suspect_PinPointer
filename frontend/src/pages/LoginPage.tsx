/**
 * LoginPage — E-RAKSHAK officer sign-in.
 *
 * Visual: shares the same dark atmospheric background as the landing page
 * (TechBackground Three.js canvas, lazy-loaded) so the transition from
 * landing → login feels seamless rather than jarring.
 *
 * Auth logic is unchanged.
 */

import { lazy, Suspense, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LogIn, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { Logo }   from '@/components/ui/Logo'
import { authApi, setToken, setStoredOfficer } from '@/services/auth'
import { resetLoginRedirect } from '@/services/api'
import { extractErrorMessage } from '@/utils'
import axios from 'axios'

const TechBackground = lazy(() =>
  import('@/components/landing/TechBackground').then((m) => ({ default: m.TechBackground }))
)

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
  // Intentionally no min-length on login: wrong passwords must surface as a
  // generic 401 banner, not a client-side length leak (user-enumeration).
  password: z.string().min(1, 'Password is required.'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [showPw,   setShowPw]   = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(data: FormData) {
    setServerError(null)
    setLoading(true)
    try {
      const res = await authApi.login({ email: data.email.trim(), password: data.password })
      setToken(res.access_token)
      setStoredOfficer(res.officer)
      resetLoginRedirect()
      // Redirect back to the page the user was trying to reach, or fall back to /dashboard.
      // `from` (router state) wins; otherwise honour a ?returnTo= param set by the
      // 401 interceptor so session-expiry logins resume where they left off.
      const rawFrom = (location.state as { from?: string } | null)?.from
      const fromState =
        rawFrom && rawFrom.startsWith('/') && !rawFrom.startsWith('//') ? rawFrom : null
      const rawReturnTo = new URLSearchParams(location.search).get('returnTo')
      // Only accept same-origin paths — reject absolute/protocol-relative URLs.
      const returnTo = rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
        ? rawReturnTo
        : null
      const target = fromState || returnTo || '/dashboard'
      navigate(target && target !== '/login' ? target : '/dashboard', { replace: true })
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        // Prefer backend detail (e.g. deactivation) over a flat invalid-password line.
        const detail = err.response?.data?.detail
        setServerError(typeof detail === 'string' && detail.trim() ? detail.trim() : 'Invalid email or password.')
      } else {
        setServerError(extractErrorMessage(err))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #060d1a 0%, #0c1a33 55%, #07111f 100%)' }}
    >
      {/* Atmospheric Three.js background — same as landing page */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <Suspense fallback={null}>
          <TechBackground className="w-full h-full" />
        </Suspense>
      </div>

      {/* Dark overlay — ensures form readability over the animation */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, rgba(6,13,26,0.55) 0%, rgba(6,13,26,0.80) 100%)' }}
        aria-hidden="true"
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm">

        {/* Logo + heading */}
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary-700/40 bg-primary-950/60 backdrop-blur-sm">
            <Logo size={36} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">E-RAKSHAK</h1>
            <p className="mt-1 text-sm text-slate-400">Sign in to your officer account</p>
          </div>
        </div>

        {/* Form card */}
        <div
          className="rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur-md"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)' }}
        >
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Email
              </label>
              <input
                type="email"
                placeholder="officer@police.gov.in"
                autoComplete="email"
                aria-invalid={!!errors.email}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 backdrop-blur-sm transition focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-red-300" role="alert">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 pr-10 text-sm text-white placeholder-slate-500 backdrop-blur-sm transition focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-300" role="alert">{errors.password.message}</p>
              )}
            </div>

            {/* Error */}
            {serverError && (
              <div
                className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300"
                role="alert"
              >
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{serverError}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
              style={{
                background: loading
                  ? 'rgba(37,99,235,0.5)'
                  : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                boxShadow: loading ? 'none' : '0 0 20px rgba(37,99,235,0.30)',
              }}
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Signing in…
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer links */}
        <div className="mt-5 flex flex-col items-center gap-2.5">
          <p className="text-xs text-slate-400 text-center">
            Forgot password or need clearance?{' '}
            <span className="text-slate-300 font-medium">Contact Cyber Cell Duty Admin</span>
          </p>
          <p className="text-sm text-slate-500">
            No account yet?{' '}
            <Link to="/register" className="font-semibold text-primary-400 hover:text-primary-300 transition-colors">
              Register
            </Link>
          </p>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Return to E-RAKSHAK home
          </Link>
        </div>
      </div>
    </div>
  )
}

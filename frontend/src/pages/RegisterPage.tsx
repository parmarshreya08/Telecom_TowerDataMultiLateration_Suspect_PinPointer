/**
 * RegisterPage — E-RAKSHAK officer account creation.
 *
 * Visual: same dark atmospheric background as LoginPage / LandingPage.
 * Auth logic is unchanged.
 */

import { lazy, Suspense, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { UserPlus, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { Logo }   from '@/components/ui/Logo'
import { authApi, setToken, setStoredOfficer } from '@/services/auth'
import { resetLoginRedirect } from '@/services/api'
import { extractErrorMessage, extractFieldErrors } from '@/utils'

const TechBackground = lazy(() =>
  import('@/components/landing/TechBackground').then((m) => ({ default: m.TechBackground }))
)

const schema = z
  .object({
    officer_name: z.string().trim().min(2, 'Enter officer name.').max(255, 'Name is too long.'),
    email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
    password: z.string().min(8, 'Password must be at least 8 characters.').max(72, 'Password is too long.'),
    confirm: z.string().min(1, 'Please confirm your password.'),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match.',
    path: ['confirm'],
  })

type FormData = z.infer<typeof schema>

function Field({
  label, type = 'text', placeholder, autoComplete, error,
  rightEl, registration,
}: {
  label: string; type?: string; placeholder?: string
  autoComplete?: string; error?: string
  rightEl?: React.ReactNode
  registration: Record<string, unknown>
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 backdrop-blur-sm transition focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 pr-10"
          {...(registration as object)}
        />
        {rightEl && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightEl}</div>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-300" role="alert">{error}</p>
      )}
    </div>
  )
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [showPw,   setShowPw]   = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  const { register, handleSubmit, setError, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { officer_name: '', email: '', password: '', confirm: '' },
  })

  async function onSubmit(data: FormData) {
    setServerError(null)
    setLoading(true)
    try {
      const res = await authApi.register({
        officer_name: data.officer_name.trim(),
        email: data.email.trim(),
        // Never trim passwords: spaces are valid characters; trimming locks users out.
        password: data.password,
      })
      setToken(res.access_token)
      setStoredOfficer(res.officer)
      resetLoginRedirect()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const fieldErrors = extractFieldErrors(err)
      let mapped = false
      for (const [field, message] of Object.entries(fieldErrors)) {
        if (field === 'officer_name' || field === 'email' || field === 'password') {
          setError(field, { type: 'server', message })
          mapped = true
        }
      }
      const msg = extractErrorMessage(err)
      // 409 duplicate-email arrives as a string detail — pin it to the email field.
      if (!mapped && /already exists/i.test(msg)) {
        setError('email', { type: 'server', message: msg })
      }
      // When a field already shows the message, keep the banner clear to avoid duplication.
      setServerError(mapped ? null : msg)
    } finally {
      setLoading(false)
    }
  }

  // Reusable dark field component
  const pwToggle = (
    <button
      type="button"
      onClick={() => setShowPw((v) => !v)}
      className="text-slate-500 hover:text-slate-300 transition-colors"
      aria-label={showPw ? 'Hide password' : 'Show password'}
    >
      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  )

  return (
    <div
      className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #060d1a 0%, #0c1a33 55%, #07111f 100%)' }}
    >
      {/* Atmospheric background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <Suspense fallback={null}>
          <TechBackground className="w-full h-full" />
        </Suspense>
      </div>

      {/* Overlay */}
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
            <p className="mt-1 text-sm text-slate-400">Create an officer account</p>
          </div>
        </div>

        {/* Form card */}
        <div
          className="rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur-md"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)' }}
        >
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <Field
              label="Officer Name"
              placeholder="Inspector A. Verma"
              autoComplete="name"
              error={errors.officer_name?.message}
              registration={register('officer_name')}
            />
            <Field
              label="Email"
              type="email"
              placeholder="officer@police.gov.in"
              autoComplete="email"
              error={errors.email?.message}
              registration={register('email')}
            />
            <Field
              label="Password"
              type={showPw ? 'text' : 'password'}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              error={errors.password?.message}
              rightEl={pwToggle}
              registration={register('password')}
            />
            <Field
              label="Confirm Password"
              type={showPw ? 'text' : 'password'}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              error={errors.confirm?.message}
              registration={register('confirm')}
            />

            {serverError && (
              <div
                className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300"
                role="alert"
              >
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{serverError}</span>
              </div>
            )}

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
                  Creating account…
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Create Account
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer links */}
        <div className="mt-5 flex flex-col items-center gap-3">
          <p className="text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-primary-400 hover:text-primary-300 transition-colors">
              Sign in
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

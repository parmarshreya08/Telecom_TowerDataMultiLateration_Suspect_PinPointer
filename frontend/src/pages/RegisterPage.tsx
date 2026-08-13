import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { UserPlus, Eye, EyeOff } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { authApi, setToken, setStoredOfficer } from '@/services/auth'
import type { AxiosError } from 'axios'

function errorMessage(err: unknown): string {
  const e = err as AxiosError<{ detail?: string | Array<Record<string, unknown>> }>
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string }
    return first?.msg ?? 'Validation failed.'
  }
  return 'Something went wrong. Please try again.'
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const res = await authApi.register({ officer_name: name, email, password })
      setToken(res.access_token)
      setStoredOfficer(res.officer)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 p-4 dark:bg-surface-950">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo size={56} />
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">E-Rakshak</h1>
          <p className="text-sm text-surface-500">Create an officer account</p>
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Officer Name"
              placeholder="Inspector A. Verma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
            <Input
              type="email"
              label="Email"
              placeholder="officer@police.gov.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <Input
              type={showPw ? 'text' : 'password'}
              label="Password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />
            <Input
              type={showPw ? 'text' : 'password'}
              label="Confirm Password"
              placeholder="Re-enter your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />

            {error && (
              <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} icon={<UserPlus className="h-4 w-4" />}>
              Create Account
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-surface-500">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { LogIn, Eye, EyeOff } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { authApi, setToken, setStoredOfficer } from '@/services/auth'
import type { AxiosError } from 'axios'

function errorMessage(err: unknown): string {
  const e = err as AxiosError<{ detail?: string }>
  return e?.response?.data?.detail ?? 'Something went wrong. Please try again.'
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await authApi.login({ email, password })
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
          <p className="text-sm text-surface-500">Sign in to your officer account</p>
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
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

            {error && (
              <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} icon={<LogIn className="h-4 w-4" />}>
              Sign In
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-surface-500">
          No account yet?{' '}
          <Link to="/register" className="font-semibold text-primary hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}
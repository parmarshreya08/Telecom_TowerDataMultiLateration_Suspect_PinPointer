import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Shield, Eye, EyeOff, Mail, Lock, Chrome } from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

const schema = z.object({
  email:       z.string().email('Enter a valid email address'),
  password:    z.string().min(6, 'Password must be at least 6 characters'),
  remember_me: z.boolean().default(false),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const { login, loginWithGoogle, isLoading, error } = useAuthContext()
  const navigate = useNavigate()
  const [showPass, setShowPass] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { remember_me: false },
  })

  const onSubmit = async (data: FormData) => {
    try {
      await login(data)
      navigate('/dashboard')
    } catch {
      // error shown via context
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 dark:bg-surface-950 px-4">
      <div className="w-full max-w-[400px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 shadow-glow-primary mb-4">
              <Shield className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">E-Rakshak</h1>
            <p className="mt-1 text-sm text-surface-500">Telecom Investigation Platform</p>
          </div>

          {/* Card */}
          <div className="card p-7">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-surface-900 dark:text-surface-100">Officer Sign In</h2>
              <p className="mt-1 text-xs text-surface-500">Restricted to authorized personnel only</p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 rounded-lg bg-danger-light px-4 py-3 text-sm text-danger" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <Input
                label="Email Address"
                type="email"
                placeholder="officer@department.gov.in"
                autoComplete="email"
                required
                leftIcon={<Mail className="h-4 w-4" />}
                error={errors.email?.message}
                {...register('email')}
              />

              <Input
                label="Password"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                leftIcon={<Lock className="h-4 w-4" />}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="text-surface-400 hover:text-surface-600"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                error={errors.password?.message}
                {...register('password')}
              />

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400 cursor-pointer">
                  <input type="checkbox" className="rounded border-surface-300" {...register('remember_me')} />
                  Remember me
                </label>
                <button type="button" className="text-sm text-primary-600 hover:underline dark:text-primary-400">
                  Forgot password?
                </button>
              </div>

              <Button type="submit" variant="primary" size="lg" loading={isLoading} className="w-full">
                {isLoading ? 'Signing in…' : 'Sign In'}
              </Button>
            </form>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="divider flex-1" />
              <span className="text-xs text-surface-400">or</span>
              <div className="divider flex-1" />
            </div>

            {/* Google OAuth */}
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={loginWithGoogle}
              icon={<Chrome className="h-4 w-4" />}
            >
              Continue with Google
            </Button>

            <p className="mt-5 text-center text-xs text-surface-500">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary-600 hover:underline dark:text-primary-400 font-medium">
                Register here
              </Link>
            </p>
          </div>

          <p className="mt-6 text-center text-2xs text-surface-400">
            Authorized law enforcement use only · All access is logged
          </p>
        </motion.div>
      </div>
    </div>
  )
}

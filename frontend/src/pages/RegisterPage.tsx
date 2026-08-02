import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Shield, Eye, EyeOff, Chrome, User, Building, Briefcase, Mail, Lock } from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

const schema = z.object({
  name:             z.string().min(3, 'Full name is required'),
  department:       z.string().min(3, 'Department is required'),
  designation:      z.string().min(2, 'Designation is required'),
  email:            z.string().email('Enter a valid email address'),
  password:         z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: 'Passwords do not match',
  path:    ['confirm_password'],
})

type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const { register: registerOfficer, loginWithGoogle, isLoading, error } = useAuthContext()
  const navigate = useNavigate()
  const [showPass, setShowPass] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    try {
      await registerOfficer(data)
      navigate('/login')
    } catch {
      // error shown via context
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 dark:bg-surface-950 px-4 py-8">
      <div className="w-full max-w-[420px]">
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
            <p className="mt-1 text-sm text-surface-500">Officer Registration</p>
          </div>

          {/* Card */}
          <div className="card p-7">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-surface-900 dark:text-surface-100">Create Account</h2>
              <p className="mt-1 text-xs text-surface-500">Register your department credentials</p>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-danger-light px-4 py-3 text-sm text-danger" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <Input
                label="Full Name"
                placeholder="Inspector Rajesh Kumar"
                required
                leftIcon={<User className="h-4 w-4" />}
                error={errors.name?.message}
                {...register('name')}
              />
              <Input
                label="Department"
                placeholder="Surat City Police — Cyber Crime Cell"
                required
                leftIcon={<Building className="h-4 w-4" />}
                error={errors.department?.message}
                {...register('department')}
              />
              <Input
                label="Designation"
                placeholder="Inspector / Sub-Inspector / ACP"
                required
                leftIcon={<Briefcase className="h-4 w-4" />}
                error={errors.designation?.message}
                {...register('designation')}
              />
              <Input
                label="Official Email"
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
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                leftIcon={<Lock className="h-4 w-4" />}
                rightElement={
                  <button type="button" onClick={() => setShowPass((v) => !v)} className="text-surface-400 hover:text-surface-600" aria-label="Toggle password">
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                error={errors.password?.message}
                {...register('password')}
              />
              <Input
                label="Confirm Password"
                type={showPass ? 'text' : 'password'}
                placeholder="Repeat password"
                required
                leftIcon={<Lock className="h-4 w-4" />}
                error={errors.confirm_password?.message}
                {...register('confirm_password')}
              />

              <Button type="submit" variant="primary" size="lg" loading={isLoading} className="w-full">
                {isLoading ? 'Creating account…' : 'Create Account'}
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="divider flex-1" />
              <span className="text-xs text-surface-400">or</span>
              <div className="divider flex-1" />
            </div>

            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={loginWithGoogle}
              icon={<Chrome className="h-4 w-4" />}
            >
              Sign up with Google
            </Button>

            <p className="mt-5 text-center text-xs text-surface-500">
              Already registered?{' '}
              <Link to="/login" className="text-primary-600 hover:underline dark:text-primary-400 font-medium">
                Sign in here
              </Link>
            </p>
          </div>

          <p className="mt-6 text-center text-2xs text-surface-400">
            Registration requires department approval · Authorized use only
          </p>
        </motion.div>
      </div>
    </div>
  )
}

import { useNavigate } from 'react-router-dom'
import { Shield, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-surface-50 dark:bg-surface-950 text-center px-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-600/10">
        <Shield className="h-10 w-10 text-primary-600" />
      </div>
      <div>
        <h1 className="text-6xl font-bold text-primary-600">404</h1>
        <p className="mt-3 text-lg font-semibold text-surface-900 dark:text-surface-100">Page Not Found</p>
        <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">This route doesn't exist or you don't have access.</p>
      </div>
      <Button variant="primary" size="lg" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/dashboard')}>
        Return to Dashboard
      </Button>
    </div>
  )
}

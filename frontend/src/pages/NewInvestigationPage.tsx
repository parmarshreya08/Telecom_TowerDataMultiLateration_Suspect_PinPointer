import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'motion/react'
import { ArrowLeft, FolderPlus, ArrowRight, RefreshCw, Check } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { investigationApi } from '@/services/api'
import { extractErrorMessage, generateCaseNumber, cn } from '@/utils'

const schema = z.object({
  case_name:     z.string().min(3, 'Case name is required'),
  case_number:   z.string().min(5, 'Case number is required'),
  suspect_name:  z.string().min(2, 'Suspect name is required'),
  mobile_number: z.string().trim().min(1, 'Mobile number is required.').refine(
    (v) => {
      const clean = v.replace(/\D/g, '')
      if (clean.length === 10) return /^[6-9]\d{9}$/.test(clean)
      if (clean.length === 12 && clean.startsWith('91')) return /^91[6-9]\d{9}$/.test(clean)
      return false
    },
    { message: 'Invalid MSISDN structure. Must be a 10-digit Indian phone number or prefixed with 91.' },
  ),
  description:   z.string().min(10, 'Provide a brief description'),
  officer_notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const Stepper = ({ currentStep }: { currentStep: number }) => {
  const steps = [
    { num: 1, label: 'Case Details' },
    { num: 2, label: 'Upload Data' },
    { num: 3, label: 'Processing' }
  ];
  return (
    <div className="mb-10 relative flex items-center justify-between w-full px-2">
      <div className="absolute left-0 top-4 -translate-y-1/2 w-full h-1 bg-surface-200 dark:bg-surface-800 z-0 rounded-full"></div>
      <div className="absolute left-0 top-4 -translate-y-1/2 h-1 bg-primary-500 z-0 rounded-full transition-all duration-500" style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}></div>
      {steps.map((s) => {
        const isActive = s.num === currentStep;
        const isPast = s.num < currentStep;
        return (
          <div key={s.num} className="relative z-10 flex flex-col items-center gap-2">
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all duration-300 bg-white dark:bg-surface-950",
              isActive ? 'border-primary-500 text-primary-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-110' : 
              isPast ? 'border-primary-500 bg-primary-500 text-white dark:bg-primary-600 dark:border-primary-600' : 
              'border-surface-300 text-surface-400 dark:border-surface-700'
            )}>
              {isPast ? <Check className="h-4 w-4" /> : s.num}
            </div>
            <span className={cn(
              "text-xs font-bold uppercase tracking-wider bg-white dark:bg-surface-950 px-2 rounded",
              isActive ? 'text-primary-500' : isPast ? 'text-surface-700 dark:text-surface-300' : 'text-surface-400'
            )}>{s.label}</span>
          </div>
        );
      })}
    </div>
  )
}

export default function NewInvestigationPage() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { case_number: generateCaseNumber() },
  })

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    try {
      const created = await investigationApi.create(data)
      navigate(`/investigations/${created.id}`)
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate('/investigations')}
        className="mb-6 flex items-center gap-2 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Investigations
      </button>

      <Stepper currentStep={1} />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 shadow-inner">
            <FolderPlus className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 tracking-tight">New Investigation</h1>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">Initialize pipeline by creating a case profile</p>
          </div>
        </div>

        <Card className="border-surface-200 dark:border-surface-800 shadow-lg dark:shadow-none">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> {error}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <Input
                label="Case Name"
                placeholder="Operation Phantom Signal"
                required
                error={errors.case_name?.message}
                {...register('case_name')}
                className="bg-surface-50 dark:bg-surface-900/50"
              />
              <div>
                <Input
                  label="Case Number"
                  placeholder="CASE-2026-SRT-1042"
                  required
                  error={errors.case_number?.message}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setValue('case_number', generateCaseNumber())}
                      className="text-surface-400 hover:text-primary-600 transition-colors"
                      title="Generate new case number"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  }
                  {...register('case_number')}
                  className="bg-surface-50 dark:bg-surface-900/50"
                />
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <Input
                label="Suspect Name"
                placeholder="Full name or alias"
                required
                error={errors.suspect_name?.message}
                {...register('suspect_name')}
                className="bg-surface-50 dark:bg-surface-900/50"
              />
              <Input
                label="Mobile Number"
                placeholder="91XXXXXXXXXX"
                type="tel"
                required
                error={errors.mobile_number?.message}
                hint="Include country code (e.g. 919876543210)"
                {...register('mobile_number')}
                className="bg-surface-50 dark:bg-surface-900/50"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-surface-700 dark:text-surface-300 flex items-center gap-1">
                Case Description <span className="text-danger">*</span>
              </label>
              <textarea
                className="input min-h-[100px] resize-y bg-surface-50 dark:bg-surface-900/50"
                placeholder="Brief description of the case, criminal activity, and investigation goals..."
                {...register('description')}
              />
              {errors.description && <p className="text-xs text-danger">{errors.description.message}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-surface-700 dark:text-surface-300">Officer Notes</label>
              <textarea
                className="input min-h-[80px] resize-y bg-surface-50 dark:bg-surface-900/50"
                placeholder="Internal notes, evidence references, coordination notes..."
                {...register('officer_notes')}
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-surface-100 dark:border-surface-800">
              <Button type="button" variant="secondary" size="lg" onClick={() => navigate('/investigations')} className="px-6">
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isLoading}
                iconRight={<ArrowRight className="h-5 w-5" />}
                className="px-8 shadow-lg shadow-primary-500/30"
              >
                Create & Continue
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </div>
  )
}

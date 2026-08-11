import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'motion/react'
import { ArrowLeft, FolderPlus, ArrowRight, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { investigationApi } from '@/services/api'
import { extractErrorMessage, generateCaseNumber } from '@/utils'

const schema = z.object({
  case_name:     z.string().min(3, 'Case name is required'),
  case_number:   z.string().min(5, 'Case number is required'),
  suspect_name:  z.string().min(2, 'Suspect name is required'),
  mobile_number: z.string().min(10, 'Enter a valid mobile number'),
  description:   z.string().min(10, 'Provide a brief description'),
  officer_notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

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
      await investigationApi.create(data)
      navigate(`/investigations/${data.case_number}/upload`)
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Back */}
      <button
        onClick={() => navigate('/investigations')}
        className="mb-6 flex items-center gap-2 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Investigations
      </button>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
            <FolderPlus className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">New Investigation</h1>
            <p className="text-sm text-surface-500 dark:text-surface-400">Fill in the case details to get started</p>
          </div>
        </div>

        <Card>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Case Name"
                placeholder="Operation Phantom Signal"
                required
                error={errors.case_name?.message}
                {...register('case_name')}
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
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Suspect Name"
                placeholder="Full name or alias"
                required
                error={errors.suspect_name?.message}
                {...register('suspect_name')}
              />
              <Input
                label="Mobile Number"
                placeholder="91XXXXXXXXXX"
                type="tel"
                required
                error={errors.mobile_number?.message}
                hint="Include country code (e.g. 919876543210)"
                {...register('mobile_number')}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
                Case Description <span className="text-danger">*</span>
              </label>
              <textarea
                className="input min-h-[90px] resize-y"
                placeholder="Brief description of the case, criminal activity, and investigation goals..."
                {...register('description')}
              />
              {errors.description && <p className="text-xs text-danger">{errors.description.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Officer Notes</label>
              <textarea
                className="input min-h-[70px] resize-y"
                placeholder="Internal notes, evidence references, coordination notes..."
                {...register('officer_notes')}
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button type="button" variant="secondary" size="md" onClick={() => navigate('/investigations')}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={isLoading}
                iconRight={<ArrowRight className="h-4 w-4" />}
              >
                Create & Upload CDR
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </div>
  )
}

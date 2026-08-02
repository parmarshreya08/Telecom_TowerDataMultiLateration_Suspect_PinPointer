import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { User, Building, Briefcase, Mail, Key, Save, Eye, EyeOff } from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { formatDateTime } from '@/utils'

const profileSchema = z.object({
  name:        z.string().min(3, 'Name is required'),
  department:  z.string().min(3, 'Department is required'),
  designation: z.string().min(2, 'Designation is required'),
})

const passwordSchema = z.object({
  current_password: z.string().min(6, 'Enter current password'),
  new_password:     z.string().min(8, 'New password must be at least 8 characters'),
  confirm_password: z.string(),
}).refine((d) => d.new_password === d.confirm_password, {
  message: 'Passwords do not match', path: ['confirm_password'],
})

type ProfileData  = z.infer<typeof profileSchema>
type PasswordData = z.infer<typeof passwordSchema>

export default function ProfilePage() {
  const { officer } = useAuthContext()
  const [showPass, setShowPass]       = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [passSaved, setPassSaved]     = useState(false)

  const { register: rProfile, handleSubmit: hProfile, formState: { errors: eProfile } } =
    useForm<ProfileData>({
      resolver: zodResolver(profileSchema),
      defaultValues: {
        name:        officer?.name ?? '',
        department:  officer?.department ?? '',
        designation: officer?.designation ?? '',
      },
    })

  const { register: rPass, handleSubmit: hPass, formState: { errors: ePass }, reset: resetPass } =
    useForm<PasswordData>({ resolver: zodResolver(passwordSchema) })

  const onSaveProfile = async (data: ProfileData) => {
    // TODO: authApi.updateProfile(data)
    await new Promise((r) => setTimeout(r, 600))
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 3000)
    void data
  }

  const onSavePassword = async (data: PasswordData) => {
    // TODO: authApi.changePassword(data)
    await new Promise((r) => setTimeout(r, 600))
    setPassSaved(true)
    resetPass()
    setTimeout(() => setPassSaved(false), 3000)
    void data
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">Officer Profile</h1>
        <p className="text-sm text-surface-500">Manage your account and security settings</p>
      </div>

      {/* Avatar + badge */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 text-2xl font-bold text-white shadow-glow-primary">
              {officer?.name?.charAt(0) ?? 'O'}
            </div>
            <div>
              <p className="font-semibold text-surface-900 dark:text-surface-100">{officer?.name}</p>
              <p className="text-sm text-surface-500">{officer?.designation} · {officer?.department}</p>
              <p className="text-xs text-surface-400 mt-1">
                Badge: {officer?.badge_number ?? 'N/A'} · Last login: {officer?.last_login ? formatDateTime(officer.last_login) : '—'}
              </p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Profile form */}
      <Card>
        <CardHeader><CardTitle><User className="mr-2 inline h-4 w-4" />Profile Information</CardTitle></CardHeader>
        {profileSaved && (
          <div className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
            ✓ Profile updated successfully
          </div>
        )}
        <form onSubmit={hProfile(onSaveProfile)} className="space-y-4">
          <Input label="Full Name"   leftIcon={<User className="h-4 w-4" />}      error={eProfile.name?.message}        {...rProfile('name')} />
          <Input label="Department"  leftIcon={<Building className="h-4 w-4" />}  error={eProfile.department?.message}  {...rProfile('department')} />
          <Input label="Designation" leftIcon={<Briefcase className="h-4 w-4" />} error={eProfile.designation?.message} {...rProfile('designation')} />
          <Input label="Email"       leftIcon={<Mail className="h-4 w-4" />}      value={officer?.email ?? ''} disabled />
          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="md" icon={<Save className="h-4 w-4" />}>Save Changes</Button>
          </div>
        </form>
      </Card>

      {/* Password form */}
      <Card>
        <CardHeader><CardTitle><Key className="mr-2 inline h-4 w-4" />Change Password</CardTitle></CardHeader>
        {passSaved && (
          <div className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
            ✓ Password changed successfully
          </div>
        )}
        <form onSubmit={hPass(onSavePassword)} className="space-y-4">
          <Input
            label="Current Password" type="password"
            leftIcon={<Key className="h-4 w-4" />}
            error={ePass.current_password?.message}
            {...rPass('current_password')}
          />
          <Input
            label="New Password" type={showPass ? 'text' : 'password'}
            leftIcon={<Key className="h-4 w-4" />}
            rightElement={
              <button type="button" onClick={() => setShowPass((v) => !v)} className="text-surface-400 hover:text-surface-600">
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
            error={ePass.new_password?.message}
            {...rPass('new_password')}
          />
          <Input
            label="Confirm New Password" type={showPass ? 'text' : 'password'}
            leftIcon={<Key className="h-4 w-4" />}
            error={ePass.confirm_password?.message}
            {...rPass('confirm_password')}
          />
          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="md">Update Password</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { AxiosError } from 'axios'
import {
  Users, UserPlus, Shield, ShieldCheck, Search, Key,
  CheckCircle, AlertCircle, RefreshCw, X, UserX, UserCheck
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { adminApi } from '@/services/api'
import { formatTimeAgo, cn } from '@/utils'
import type { AdminUser, CreateUserPayload, UserRole } from '@/types'

export default function UserManagementPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'INSPECTOR'>('ALL')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [resetModalUser, setResetModalUser] = useState<AdminUser | null>(null)

  // Create Form State
  const [createForm, setCreateForm] = useState<CreateUserPayload>({
    officer_name: '',
    email: '',
    password: '',
    role: 'INSPECTOR',
    is_active: true,
  })
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Reset Password State
  const [newPassword, setNewPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    try {
      const res = await adminApi.listUsers()
      setUsers(res.users)
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to load officer directory.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  function showSuccess(msg: string) {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(null), 4000)
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setCreateLoading(true)
    try {
      const res = await adminApi.createUser(createForm)
      showSuccess(res.message || 'Officer account created successfully.')
      setCreateModalOpen(false)
      setCreateForm({ officer_name: '', email: '', password: '', role: 'INSPECTOR', is_active: true })
      await loadUsers()
    } catch (err: unknown) {
      const e = err as AxiosError<{ detail?: string }>
      setCreateError(e.response?.data?.detail || e.message || 'Failed to create user.')
    } finally {
      setCreateLoading(false)
    }
  }

  async function handleToggleStatus(user: AdminUser) {
    try {
      const nextStatus = !user.is_active
      await adminApi.updateUserStatus(user.officer_id, nextStatus)
      showSuccess(`Officer '${user.officer_name}' is now ${nextStatus ? 'Active' : 'Deactivated'}.`)
      await loadUsers()
    } catch (err: unknown) {
      const e = err as AxiosError<{ detail?: string }>
      setError(e.response?.data?.detail || 'Failed to update user status.')
    }
  }

  async function handleToggleRole(user: AdminUser) {
    try {
      const nextRole: UserRole = user.role === 'ADMIN' ? 'INSPECTOR' : 'ADMIN'
      await adminApi.updateUserRole(user.officer_id, nextRole)
      showSuccess(`Role for '${user.officer_name}' changed to ${nextRole}.`)
      await loadUsers()
    } catch (err: unknown) {
      const e = err as AxiosError<{ detail?: string }>
      setError(e.response?.data?.detail || 'Failed to update user role.')
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault()
    if (!resetModalUser) return
    setResetError(null)
    setResetLoading(true)
    try {
      const res = await adminApi.resetUserPassword(resetModalUser.officer_id, newPassword)
      showSuccess(res.message || 'Password reset successfully.')
      setResetModalUser(null)
      setNewPassword('')
    } catch (err: unknown) {
      const e = err as AxiosError<{ detail?: string }>
      setResetError(e.response?.data?.detail || e.message || 'Failed to reset password.')
    } finally {
      setResetLoading(false)
    }
  }

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.officer_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  return (
    <div className="space-y-8">
      {/* Top Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 flex items-center gap-2">
            <Users className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            Officer & User Management
          </h1>
          <p className="text-base text-surface-500 dark:text-surface-400 mt-1">
            Provision law-enforcement personnel, configure administrative roles, and manage active system credentials.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsLoading(true)
              loadUsers()
            }}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="gap-2"
          >
            <UserPlus className="h-4 w-4" />
            Create Officer Account
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="flex items-center gap-4 p-4.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-base font-medium">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <p>{successMessage}</p>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-4 p-4.5 bg-danger/10 border border-danger/20 rounded-xl text-danger text-base font-medium">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-5">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {(['ALL', 'ADMIN', 'INSPECTOR'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-base font-semibold uppercase tracking-wider transition-colors',
                roleFilter === r
                  ? 'bg-primary-600 text-white shadow-xs'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-base text-left">
            <thead className="bg-surface-50 dark:bg-surface-800 text-surface-500 uppercase tracking-wider font-semibold border-b border-surface-200/60 dark:border-surface-700">
              <tr>
                <th className="px-4 py-4">Officer Name</th>
                <th className="px-4 py-4">Email Address</th>
                <th className="px-4 py-4">Role</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Assigned Cases</th>
                <th className="px-4 py-4">Created</th>
                <th className="px-4 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-surface-400">
                    No officers matched your criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.officer_id} className="hover:bg-surface-50/50 dark:hover:bg-surface-800/50 transition-colors">
                    <td className="px-4 py-4.5 font-semibold text-surface-900 dark:text-surface-100">
                      {u.officer_name}
                    </td>
                    <td className="px-4 py-4.5 font-mono text-surface-600 dark:text-surface-300">
                      {u.email}
                    </td>
                    <td className="px-4 py-4.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider',
                          u.role === 'ADMIN'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            : 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20'
                        )}
                      >
                        {u.role === 'ADMIN' ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-4.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 text-base font-semibold px-2 py-0.5 rounded-full',
                          u.is_active
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-danger/10 text-danger'
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full', u.is_active ? 'bg-emerald-500' : 'bg-danger')} />
                        {u.is_active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="px-4 py-4.5 text-surface-600 dark:text-surface-300 font-medium">
                      {u.assigned_cases_count ?? 0}
                    </td>
                    <td className="px-4 py-4.5 text-surface-400">
                      {formatTimeAgo(u.created_at)}
                    </td>
                    <td className="px-4 py-4.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleToggleRole(u)}
                          className="text-surface-600 hover:text-primary-600"
                        >
                          Switch Role
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setResetModalUser(u)}
                          className="text-surface-600 hover:text-amber-600 gap-1"
                        >
                          <Key className="h-3 w-3" />
                          Reset PW
                        </Button>
                        <Button
                          variant={u.is_active ? 'danger' : 'outline'}
                          size="xs"
                          onClick={() => handleToggleStatus(u)}
                          className="gap-1"
                        >
                          {u.is_active ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Create User */}
      <AnimatePresence>
        {createModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-surface-900 rounded-2xl border border-surface-200/60 dark:border-surface-700 shadow-2xl p-6 overflow-hidden"
            >
              <div className="flex items-center justify-between pb-4 border-b border-surface-100 dark:border-surface-800">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary-500" />
                  <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100">
                    Create Officer Account
                  </h3>
                </div>
                <button
                  onClick={() => setCreateModalOpen(false)}
                  className="p-1 rounded-lg text-surface-400 hover:text-surface-600 dark:hover:text-surface-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {createError && (
                <div className="mt-4 p-4 bg-danger/10 border border-danger/20 rounded-xl text-danger text-base">
                  {createError}
                </div>
              )}

              <form onSubmit={handleCreateUser} className="mt-4 space-y-4 text-base">
                <div>
                  <label className="font-semibold text-surface-700 dark:text-surface-300">
                    Full Name / Designation
                  </label>
                  <Input
                    required
                    placeholder="e.g. Insp. Vikram Sharma"
                    value={createForm.officer_name}
                    onChange={(e) => setCreateForm({ ...createForm, officer_name: e.target.value })}
                    className="mt-1 text-base"
                  />
                </div>

                <div>
                  <label className="font-semibold text-surface-700 dark:text-surface-300">
                    Official Email Address
                  </label>
                  <Input
                    type="email"
                    required
                    placeholder="officer@erakshak.gov.in"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    className="mt-1 text-base"
                  />
                </div>

                <div>
                  <label className="font-semibold text-surface-700 dark:text-surface-300">
                    Initial Secure Password (min 8 chars)
                  </label>
                  <Input
                    type="password"
                    required
                    minLength={8}
                    placeholder="••••••••"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className="mt-1 text-base"
                  />
                </div>

                <div>
                  <label className="font-semibold text-surface-700 dark:text-surface-300">
                    Assigned Role
                  </label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, role: 'INSPECTOR' })}
                      className={cn(
                        'p-2.5 rounded-xl border text-base font-semibold flex items-center justify-center gap-1.5 transition-colors',
                        createForm.role === 'INSPECTOR'
                          ? 'border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300'
                          : 'border-surface-200/60 dark:border-surface-700 text-surface-600'
                      )}
                    >
                      <Shield className="h-4 w-4" />
                      INSPECTOR
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, role: 'ADMIN' })}
                      className={cn(
                        'p-2.5 rounded-xl border text-base font-semibold flex items-center justify-center gap-1.5 transition-colors',
                        createForm.role === 'ADMIN'
                          ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'border-surface-200/60 dark:border-surface-700 text-surface-600'
                      )}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      ADMIN
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-surface-100 dark:border-surface-800">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCreateModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={createLoading}
                    className="gap-2"
                  >
                    {createLoading ? 'Creating...' : 'Create Account'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Reset Password */}
      <AnimatePresence>
        {resetModalUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-white dark:bg-surface-900 rounded-2xl border border-surface-200/60 dark:border-surface-700 shadow-2xl p-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-surface-100 dark:border-surface-800">
                <div className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-amber-500" />
                  <h3 className="text-base font-bold text-surface-900 dark:text-surface-100">
                    Reset Password
                  </h3>
                </div>
                <button
                  onClick={() => setResetModalUser(null)}
                  className="p-1 rounded-lg text-surface-400 hover:text-surface-600 dark:hover:text-surface-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="mt-3 text-base text-surface-500">
                Setting a new password for <span className="font-semibold text-surface-900 dark:text-surface-100">{resetModalUser.email}</span>.
              </p>

              {resetError && (
                <div className="mt-3 p-2.5 bg-danger/10 border border-danger/20 rounded-xl text-danger text-base">
                  {resetError}
                </div>
              )}

              <form onSubmit={handleResetPassword} className="mt-4 space-y-4 text-base">
                <div>
                  <label className="font-semibold text-surface-700 dark:text-surface-300">
                    New Password (min 8 chars)
                  </label>
                  <Input
                    type="password"
                    required
                    minLength={8}
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 text-base"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setResetModalUser(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={resetLoading}
                  >
                    {resetLoading ? 'Resetting...' : 'Update Password'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

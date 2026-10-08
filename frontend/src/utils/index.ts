// ============================================================
// E-Rakshak — Utility Functions
// ============================================================

import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { type ClassValue, clsx } from 'clsx'
import type { CaseStatus } from '@/types'

// ── Class merging ──────────────────────────────────────────
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}

// ── Date / Time ────────────────────────────────────────────
export function formatDate(
  date: string | Date | undefined | null,
  pattern = 'dd MMM yyyy'
): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    if (isNaN(d.getTime())) return '—'
    return format(d, pattern)
  } catch {
    return '—'
  }
}

export function formatDateTime(date: string | Date | undefined | null): string {
  return formatDate(date, 'dd MMM yyyy, HH:mm:ss')
}

export function formatTimeAgo(date: string | Date | undefined | null): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    if (isNaN(d.getTime())) return '—'
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return '—'
  }
}

export function formatTime(date: string | Date | undefined | null): string {
  return formatDate(date, 'HH:mm:ss')
}

// ── File Size ──────────────────────────────────────────────
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k     = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i     = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// ── Numbers ────────────────────────────────────────────────
export function formatNumber(n: number): string {
  return n.toLocaleString('en-IN')
}

export function formatCoordinate(val: number, decimals = 6): string {
  return val.toFixed(decimals)
}

export function formatSpeed(mps: number): string {
  const kmh = mps * 3.6
  return `${kmh.toFixed(1)} km/h`
}

export function formatAccuracy(meters: number): string {
  if (meters < 1000) return `±${meters.toFixed(0)} m`
  return `±${(meters / 1000).toFixed(2)} km`
}

export function formatSignalStrength(dbm: number): string {
  return `${dbm.toFixed(1)} dBm`
}

export function formatConfidencePercent(val: number): string {
  return `${(val * 100).toFixed(1)}%`
}

// ── Coordinates ────────────────────────────────────────────
export function buildGoogleMapsUrl(lat: number, lon: number): string {
  return `https://maps.google.com/?q=${lat},${lon}`
}

export function buildGoogleMapsDirectionsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
}

export function formatLatLon(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S'
  const lonDir = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(6)}°${latDir}, ${Math.abs(lon).toFixed(6)}°${lonDir}`
}

// ── String Utils ───────────────────────────────────────────
export function truncate(str: string, length = 40): string {
  if (str.length <= length) return str
  return `${str.substring(0, length)}…`
}

export function maskPhoneNumber(phone: string): string {
  if (phone.length < 6) return phone
  return `${phone.substring(0, 3)}****${phone.substring(phone.length - 3)}`
}

export function generateCaseNumber(): string {
  const year  = new Date().getFullYear()
  const rand  = Math.floor(Math.random() * 9000) + 1000
  const alpha = ['DEL', 'MUM', 'BLR', 'CHN', 'HYD', 'SRT'][Math.floor(Math.random() * 6)]
  return `CASE-${year}-${alpha}-${rand}`
}

// ── Color utils ────────────────────────────────────────────
export function getSignalStrengthColor(dbm: number): string {
  if (dbm >= -70) return 'text-success'
  if (dbm >= -85) return 'text-warning'
  return 'text-danger'
}

export function getQualityScoreColor(score: number): string {
  if (score >= 0.8) return 'text-success'
  if (score >= 0.6) return 'text-warning'
  return 'text-danger'
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-success'
  if (confidence >= 0.5) return 'text-warning'
  return 'text-danger'
}

// ── Validation ─────────────────────────────────────────────
export function isValidPhoneNumber(phone: string): boolean {
  const clean = phone.replace(/\D/g, '')
  if (clean.length === 10) return /^[6-9]\d{9}$/.test(clean)
  if (clean.length === 12 && clean.startsWith('91')) return /^91[6-9]\d{9}$/.test(clean)
  return false
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ── Error Handling ─────────────────────────────────────────
type BackendDetailItem = {
  loc?: Array<string | number>
  msg?: string
  message?: string
}

function backendDetailToMessage(detail: unknown): string | null {
  if (detail == null) return null
  if (typeof detail === 'string') {
    const trimmed = detail.trim()
    return trimmed ? trimmed : null
  }
  if (Array.isArray(detail)) {
    for (const item of detail) {
      if (typeof item === 'string' && item.trim()) return item.trim()
      if (item && typeof item === 'object') {
        const rec = item as BackendDetailItem
        if (typeof rec.msg === 'string' && rec.msg.trim()) return rec.msg.trim()
        if (typeof rec.message === 'string' && rec.message.trim()) return rec.message.trim()
      }
    }
    return null
  }
  if (typeof detail === 'object') {
    const rec = detail as Record<string, unknown>
    // FastAPI sometimes returns {"detail": {"message": "..."}} — surface it.
    for (const key of ['message', 'msg', 'error']) {
      const v = rec[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
  }
  return null
}

/** Map a FastAPI 422 `detail` array to `{ fieldName: message }` for setError. */
export function extractFieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (err == null || typeof err !== 'object') return out
  const response = (err as { response?: { data?: { detail?: unknown } } }).response
  const detail = response?.data?.detail
  if (!Array.isArray(detail)) return out
  for (const item of detail) {
    if (item && typeof item === 'object') {
      const rec = item as BackendDetailItem
      const loc = Array.isArray(rec.loc) ? rec.loc : []
      // FastAPI loc is like ["body", "email"] — last segment is the field.
      const field = [...loc].reverse().find((s) => typeof s === 'string' && s !== 'body' && s !== 'query' && s !== 'path')
      const msg =
        (typeof rec.msg === 'string' && rec.msg.trim() ? rec.msg.trim() : null) ??
        (typeof rec.message === 'string' && rec.message.trim() ? rec.message.trim() : null)
      if (typeof field === 'string' && msg) {
        // Backend uses officer_name / case_name / mobile_number — matches form keys.
        if (!(field in out)) out[field] = msg
      }
    }
  }
  return out
}

export function extractErrorMessage(err: unknown): string {
  if (err == null) return 'An unknown error occurred'
  if (typeof err === 'string') {
    const trimmed = err.trim()
    return trimmed ? trimmed : 'An unknown error occurred'
  }
  if (typeof err === 'object') {
    const rec = err as {
      response?: { data?: { detail?: unknown; message?: unknown }; status?: number }
      code?: string
      message?: unknown
    }
    // Axios / fetch-style backend error — prefer server `detail` over generic message.
    const fromBackend =
      backendDetailToMessage(rec.response?.data?.detail) ??
      (typeof rec.response?.data?.message === 'string' && rec.response.data.message.trim()
        ? rec.response.data.message.trim()
        : null)
    if (fromBackend) return fromBackend
    // Network failure (no response from backend).
    if (!rec.response && (rec.code === 'ERR_NETWORK' || rec.code === 'ECONNABORTED')) {
      return 'Could not connect to the backend. Check your connection and try again.'
    }
    if (typeof rec.message === 'string' && rec.message.trim()) {
      // Hide raw Axios "Request failed with status code 401" — not user-facing.
      if (/^request failed with status code \d+$/i.test(rec.message.trim())) {
        const status = rec.response?.status
        if (status === 401) return 'Invalid email or password.'
        if (status === 409) return 'This record already exists.'
        if (typeof status === 'number' && status >= 500) return 'Server error. Please try again later.'
        if (typeof status === 'number') return 'Request failed. Please check your input and try again.'
        return 'Something went wrong. Please try again.'
      }
      return rec.message.trim()
    }
  }
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return 'An unknown error occurred'
}

// ── Clipboard ──────────────────────────────────────────────
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// ── CSV / Download ─────────────────────────────────────────
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Debounce ───────────────────────────────────────────────
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

// ── Estimated rows from file size ─────────────────────────
export function estimateRowCount(fileSizeBytes: number): string {
  // Rough estimate: avg CDR row ≈ 200 bytes
  const estimated = Math.floor(fileSizeBytes / 200)
  if (estimated < 1000) return `~${estimated} rows`
  if (estimated < 1_000_000) return `~${(estimated / 1000).toFixed(1)}K rows`
  return `~${(estimated / 1_000_000).toFixed(1)}M rows`
}

// ── Case Lifecycle Status (Single Source of Truth) ────────
export function normalizeCaseStatus(status?: string | null): CaseStatus {
  if (!status || typeof status !== 'string' || !status.trim()) {
    return 'Unknown'
  }
  const normalized = status.trim().toLowerCase()
  switch (normalized) {
    case 'active':
      return 'Active'
    case 'pending':
      return 'Pending'
    case 'completed':
      return 'Completed'
    case 'archived':
    case 'archive':
      return 'Archived'
    default:
      return 'Unknown'
  }
}

export function getCaseLifecycleStatus(inv?: { status?: string | null } | null): CaseStatus {
  return normalizeCaseStatus(inv?.status)
}

export function getCaseStatusBadgeVariant(
  status: CaseStatus
): 'primary' | 'warning' | 'success' | 'neutral' {
  switch (status) {
    case 'Active':
      return 'primary'
    case 'Pending':
      return 'warning'
    case 'Completed':
      return 'success'
    case 'Archived':
      return 'neutral'
    case 'Unknown':
    default:
      return 'neutral'
  }
}

export function getCaseStatusIconClasses(status: CaseStatus): string {
  switch (status) {
    case 'Active':
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
    case 'Pending':
      return 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
    case 'Completed':
      return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
    case 'Archived':
      return 'bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-400'
    case 'Unknown':
    default:
      return 'bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-400'
  }
}


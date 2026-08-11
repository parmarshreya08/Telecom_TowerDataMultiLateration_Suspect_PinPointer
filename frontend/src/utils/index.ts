// ============================================================
// E-Rakshak — Utility Functions
// ============================================================

import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { type ClassValue, clsx } from 'clsx'

// ── Class merging ──────────────────────────────────────────
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}

// ── Date / Time ────────────────────────────────────────────
export function formatDate(date: string | Date, pattern = 'dd MMM yyyy'): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, pattern)
  } catch {
    return '—'
  }
}

export function formatDateTime(date: string | Date): string {
  return formatDate(date, 'dd MMM yyyy, HH:mm:ss')
}

export function formatTimeAgo(date: string | Date): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return '—'
  }
}

export function formatTime(date: string | Date): string {
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
  return clean.length >= 10 && clean.length <= 15
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ── Error Handling ─────────────────────────────────────────
export function extractErrorMessage(err: unknown): string {
  if (err == null) return 'An unknown error occurred'
  if (typeof err === 'string') return err
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
  a.href    = url
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

// ============================================================
// E-Rakshak — Central Configuration Constants
// ============================================================

// ── API / Environment ──────────────────────────────────────
// ponytail: empty string = relative URLs → Vite proxy forwards /api, /health to backend
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || ''
export const WS_BASE_URL = (import.meta.env.VITE_WS_BASE_URL as string) || ''

export const LS_KEYS = {
  THEME: 'e-rakshak-theme',
  SESSION: 'e-rakshak-session',
} as const

export const CASE_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  ON_HOLD: 'ON_HOLD',
} as const

export const INVESTIGATION_STATUS_COLORS = {
  PENDING:    'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800',
  PROCESSING: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  COMPLETED:  'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
  FAILED:     'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  ON_HOLD:    'bg-gray-100 text-gray-800 border-gray-200 dark:bg-surface-700 dark:text-surface-300 dark:border-surface-600',
} as const

export const CDR_TYPE_LABELS: Record<string, string> = {
  Airtel:    'Airtel CDR',
  Jio:       'Jio CDR',
  Vi:        'Vi CDR',
  BSNL:      'BSNL CDR',
  TowerDump: 'Tower Dump',
  unknown:   'Unknown Format',
}

export const CDR_TYPE_COLORS: Record<string, string> = {
  Airtel:    'bg-blue-100 text-blue-800 border-blue-200',
  Jio:       'bg-purple-100 text-purple-800 border-purple-200',
  Vi:        'bg-pink-100 text-pink-800 border-pink-200',
  BSNL:      'bg-orange-100 text-orange-800 border-orange-200',
  TowerDump: 'bg-teal-100 text-teal-800 border-teal-200',
  unknown:   'bg-gray-100 text-gray-800 border-gray-200',
}

export const UPLOAD_STATES = {
  IDLE:       'idle',
  UPLOADING:  'uploading',
  PROCESSING: 'processing',
  COMPLETE:   'complete',
  ERROR:      'error',
} as const

export const POLL_INTERVAL = import.meta.env.VITE_POLL_INTERVAL || 2000

export const TRACKING_STATUS_COLORS: Record<string, string> = {
  Live:    'text-green-600 dark:text-green-400',
  Active:  'text-blue-600 dark:text-blue-400',
  Idle:    'text-yellow-600 dark:text-yellow-400',
  Stopped: 'text-red-600 dark:text-red-400',
} as const

export const TRACKING_DURATION_OPTIONS = [
  { value: '15m', label: '15 Minutes' },
  { value: '30m', label: '30 Minutes' },
  { value: '1h',  label: '1 Hour' },
  { value: '2h',  label: '2 Hours' },
  { value: '6h',  label: '6 Hours' },
  { value: '12h', label: '12 Hours' },
  { value: '24h', label: '24 Hours' },
  { value: '7d',  label: '7 Days' },
  { value: '30d', label: '30 Days' },
] as const

export const ACCEPTED_FILE_TYPES = {
  csv:  ['.csv'],
  xlsx: ['.xlsx'],
  xls:  ['.xls'],
} as const

export const MAX_FILE_SIZE_MB = 50
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

export const API_KEY = import.meta.env.VITE_API_KEY as string

// ── Map Defaults ──────────────────────────────────────────
export const DEFAULT_MAP_CENTER: [number, number] = [21.1702, 72.8311] // Surat
export const DEFAULT_MAP_ZOOM = 12

// ── Operator Colors ───────────────────────────────────────
export const OPERATOR_COLORS: Record<string, string> = {
  Airtel: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  Jio: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Vi: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  BSNL: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  Unknown: 'bg-gray-100 text-gray-700 dark:bg-surface-700 dark:text-surface-300',
}

export const FILE_UPLOAD_STATUS_COLORS: Record<string, string> = {
  pending:    'badge badge-neutral',
  uploaded:   'badge badge-primary',
  processing: 'badge badge-warning',
  completed:  'badge badge-success',
  failed:     'badge badge-danger',
}

export const FILE_UPLOAD_STATUS_LABELS: Record<string, string> = {
  pending:    'Pending',
  uploaded:   'Uploaded',
  processing: 'Processing',
  completed:  'Completed',
  failed:     'Failed',
}

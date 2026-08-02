// ============================================================
// E-Rakshak — Application Constants
// ============================================================

export const APP_NAME = 'E-Rakshak'
export const APP_FULL_NAME = 'E-Rakshak Telecom Investigation Platform'
export const APP_VERSION = '1.0.0'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
export const WS_BASE_URL  = import.meta.env.VITE_WS_BASE_URL  ?? 'ws://localhost:8000'

// API key header name (matches backend security.py)
export const API_KEY_HEADER = 'X-API-Key'

// Local storage keys
export const LS_KEYS = {
  AUTH_TOKEN:   'erakshak_auth_token',
  OFFICER:      'erakshak_officer',
  THEME:        'erakshak_theme',
  SIDEBAR_OPEN: 'erakshak_sidebar_open',
} as const

// Tracking duration options
export const TRACKING_DURATION_OPTIONS = [
  { value: '30m',    label: 'Last 30 Minutes' },
  { value: '1h',     label: 'Last 1 Hour' },
  { value: '3h',     label: 'Last 3 Hours' },
  { value: '6h',     label: 'Last 6 Hours' },
  { value: '12h',    label: 'Last 12 Hours' },
  { value: '24h',    label: 'Last 24 Hours' },
  { value: '2d',     label: 'Last 2 Days' },
  { value: '7d',     label: 'Last 7 Days' },
  { value: 'custom', label: 'Custom Range' },
] as const

// Accepted file extensions for CDR upload
export const ACCEPTED_FILE_TYPES = {
  'text/csv':                                                          ['.csv'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel':                                          ['.xls'],
}

export const MAX_FILE_SIZE_MB  = 100
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

// Operator color mapping for UI badges
export const OPERATOR_COLORS: Record<string, string> = {
  Airtel:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  Jio:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Vi:      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  BSNL:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  Unknown: 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
}

// Case status colors
export const CASE_STATUS_COLORS: Record<string, string> = {
  Active:    'badge-success',
  Pending:   'badge-warning',
  Completed: 'badge-primary',
  Archived:  'badge-neutral',
}

// Tracking status colors
export const TRACKING_STATUS_COLORS: Record<string, string> = {
  Live:       'text-success dark:text-green-400',
  Processing: 'text-warning dark:text-yellow-400',
  Paused:     'text-surface-400',
  Completed:  'text-primary-600 dark:text-primary-400',
  Error:      'text-danger dark:text-red-400',
  Idle:       'text-surface-400',
}

// Pipeline stages for processing screen
export const PIPELINE_STAGES = [
  { id: 'upload',           label: 'Upload',            description: 'File received and stored' },
  { id: 'validation',       label: 'Validation',        description: 'Data integrity checks' },
  { id: 'tower_detection',  label: 'Tower Detection',   description: 'Identifying cell towers' },
  { id: 'trilateration',    label: 'Trilateration',     description: 'Computing 3-tower location' },
  { id: 'multilateration',  label: 'Multilateration',   description: 'Multi-tower refinement' },
  { id: 'kalman_filter',    label: 'Kalman Filter',     description: 'Trajectory smoothing' },
  { id: 'heatmap_generation','label': 'Heatmap Generation','description': 'Building GeoJSON heatmap' },
  { id: 'ready',            label: 'Tracking Ready',    description: 'Investigation live' },
] as const

// Default map center (India)
export const DEFAULT_MAP_CENTER: [number, number] = [20.5937, 78.9629]
export const DEFAULT_MAP_ZOOM = 5

// Export formats
export const EXPORT_FORMATS = [
  { value: 'pdf',     label: 'PDF Report',       icon: 'FileText'  },
  { value: 'excel',   label: 'Excel Spreadsheet', icon: 'FileSpreadsheet' },
  { value: 'csv',     label: 'CSV Data',          icon: 'FileCode'  },
  { value: 'json',    label: 'JSON Data',          icon: 'Braces'    },
  { value: 'geojson', label: 'GeoJSON Map Data',  icon: 'Map'       },
] as const

// Navigation items
export const NAV_ITEMS = [
  { path: '/dashboard',      label: 'Dashboard',       icon: 'LayoutDashboard' },
  { path: '/investigations', label: 'Investigations',  icon: 'FolderSearch'    },
  { path: '/live',           label: 'Live Tracking',   icon: 'MapPin'          },
  { path: '/reports',        label: 'Reports',         icon: 'FileBarChart'    },
  { path: '/settings',       label: 'Settings',        icon: 'Settings'        },
] as const

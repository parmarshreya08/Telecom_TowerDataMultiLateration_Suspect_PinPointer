// ============================================================
// E-Rakshak — Shared TypeScript Types
// ============================================================

// ── Upload ─────────────────────────────────────────────────
export type UploadStatus = 'uploading' | 'processing' | 'complete' | 'error' | 'validated' | 'rejected' | 'duplicate' | 'unknown'

export interface UploadProgress {
  file: File
  status: UploadStatus
  progress: number
  cdrType?: string
  recordsFound?: number
  error?: string
  startTime: Date
  estimatedTimeRemaining?: number
  speed?: number
}

export interface UploadResponse {
  success: boolean
  message: string
  case_id: string
  cdr_type?: string
  operator?: string
  record_count?: number
  filename?: string
  processing_time_seconds?: number
  validation?: {
    status: string
    total_rows?: number
    valid_rows?: number
    rejected_rows?: number
  }
  normalized_count?: number
  duplicate_count?: number
  rejected_count?: number
  measurements_created?: number
}

export interface Upload {
  id: string
  filename: string
  cdr_type: string
  status: string
  record_count: number
  created_at: string
}

// ── Investigations ─────────────────────────────────────────

export interface CreateInvestigationData {
  title?: string
  description?: string
  suspect_name?: string
  mobile_numbers?: string[]
  created_by?: string
  assigned_to?: string
  case_name?: string
  case_number?: string
  mobile_number?: string
  officer_notes?: string
}

// ── Tracking ───────────────────────────────────────────────
export interface GeoJSONPoint {
  type: 'Feature'
  id?: string
  geometry: { type: 'Point' | 'Polygon'; coordinates: [number, number] | [number, number][][] }
  properties: {
    id?: string
    latitude?: number
    longitude?: number
    confidence?: number
    operator?: string
    tower_id?: string
    signal_strength?: number
    color?: string
    label?: string
    [key: string]: any
  }
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJSONPoint[]
}

export interface Tower {
  tower_id: string
  operator: string
  radio: string
  cgi: string
  latitude: number
  longitude: number
  azimuth?: number
  beamwidth?: number
  range_meters?: number
  site_address?: string
}

export interface TowerRecord {
  tower_id: string
  operator: string
  radio?: string
  cgi: string
  latitude: number
  longitude: number
  azimuth?: number
  beamwidth?: number
  range_meters?: number
  site_address?: string
  [key: string]: unknown
}

export interface LocalizationFix {
  fix_id: string
  case_id: string
  latitude: number
  longitude: number
  timestamp: string
  confidence?: number
  confidence_radius_meters?: number
  accuracy_meters?: number
  algorithm?: string
  gdop?: number
  residual_rms?: number
  velocity_east?: number
  velocity_north?: number
  [key: string]: unknown
}

// ── Reports ────────────────────────────────────────────────

// ── Notifications ──────────────────────────────────────────

// ── Pagination ─────────────────────────────────────────────
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// ── API ────────────────────────────────────────────────────
export interface ApiError {
  success: boolean
  message: string
  error?: string
}

export interface HealthStatus {
  status: string
  database: string
  timestamp: string
}

// ── Theme ──────────────────────────────────────────────────
export type Theme = 'light' | 'dark'

export interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
}

// ── Settings ───────────────────────────────────────────────
export interface Settings {
  notifications: boolean
  darkMode: boolean
  language: string
  autoRefresh: boolean
  refreshInterval: number
}

// ── WebSocket / Socket Events ──────────────────────────────

export interface SocketEvent {
  event: string
  case_id?: string
  data: unknown
  timestamp: string
}

// ── File Upload State ──────────────────────────────────────
export type FileUploadStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error'
export type FileCdrType = 'airtel' | 'jio' | 'vi' | 'bsnl' | 'tower_dump' | 'spot_dump'

export interface FileUploadState {
  status: FileUploadStatus
  progress: number
  cdrType?: FileCdrType
  message?: string
}

// ── File Upload Progress ───────────────────────────────────
export type FileUploadProgressStatus =
  | 'uploading'
  | 'processing'
  | 'complete'
  | 'error'
  | 'validated'
  | 'rejected'
  | 'duplicate'
  | 'unknown'

export interface FileUploadProgress {
  file: File
  status: FileUploadProgressStatus
  progress: number
  cdrType?: string
  recordsFound?: number
  error?: string
  startTime: Date
  estimatedTimeRemaining?: number
  speed?: number
}

export type FileCDRType =
  | 'Airtel'
  | 'Jio'
  | 'Vi'
  | 'BSNL'
  | 'TowerDump'
  | 'unknown'

export type FileValidationStatus =
  | 'valid'
  | 'invalid'
  | 'warning'
  | 'pending'
  | 'error'

export interface FileValidationResult {
  valid: boolean
  status: FileValidationStatus
  total_rows: number
  valid_rows: number
  invalid_rows: number
  warnings: string[]
  errors: string[]
}

export interface FileProcessingResult {
  case_id: string
  upload_id: string
  cdr_type: FileCDRType
  file_name: string
  status: 'processing' | 'complete' | 'error'
  total_rows: number
  processed_rows: number
  valid_rows: number
  invalid_rows: number
  measurements_created: number
  error?: string
}

// ── File Management Types ─────────────────────────────────

export interface CaseFile {
  upload_id: string
  case_id?: string
  display_name: string
  original_filename: string
  file_size_bytes: number
  upload_status: 'pending' | 'uploaded' | 'processing' | 'completed' | 'failed'
  error_message?: string
  file_source: 'local' | 'url' | 'drive'
  operator?: string
  source_type?: string
  uploaded_at: string
}

export interface UploadResult {
  upload_id: string | null
  filename: string
  status: 'uploaded' | 'rejected' | 'failed'
  reason?: string
  message?: string
}

export interface BatchUploadResponse {
  case_id: string
  results: UploadResult[]
  total: number
  successful: number
  rejected: number
  failed: number
}

export interface FileListResponse {
  case_id: string
  files: CaseFile[]
  total: number
}

// ── Missing Types (stub definitions for existing components) ──

export interface AlgorithmResult {
  algorithm: string
  status?: string
  confidence?: number
  residual_rms?: number
  gdop?: number
  adaptive_R_scale?: number
  adaptive_Q_scale?: number
  clock_bias?: number
  execution_time_ms?: number
  accuracy_meters?: number
  velocity?: { magnitude: number; [key: string]: unknown }
  prediction?: { latitude: number; longitude: number; [key: string]: unknown }
  [key: string]: unknown
}

export interface TimelineEvent {
  id: string
  timestamp: string
  type: string
  description: string
  title?: string
  [key: string]: any
}

export type TimelineEventType = string

export interface LocalizationResult {
  latitude: number
  longitude: number
  confidence?: number
  timestamp?: string
  accuracy_meters?: number
  algorithm?: string
  gdop?: number
  residual_rms?: number
  velocity_east?: number
  velocity_north?: number
  [key: string]: any
}

export interface PathPoint {
  id?: string
  latitude: number
  longitude: number
  timestamp?: string
  accuracy_meters?: number
  algorithm?: string
  confidence?: number
  [key: string]: any
}

export interface LiveTrackingData {
  case_id: string
  positions: LocalizationResult[]
  towers: TowerRecord[]
  [key: string]: unknown
}

export interface TrackingSettings {
  duration: string
  interval?: number
  [key: string]: unknown
}

export interface UploadMetadata {
  upload_id: string
  case_id: string
  original_filename: string
  file_size_bytes: number
  upload_status: string
  operator?: string
  source_type?: string
  uploaded_at: string
  [key: string]: unknown
}

export type CaseStatus = 'Active' | 'Pending' | 'Completed' | 'Archived'

export type TrackingStatus = 'Idle' | 'Processing' | 'Live' | 'Paused' | 'Completed' | 'Error'

export type NotificationType = string

// Fix Investigation type to match what pages expect
export interface Investigation {
  id: string
  case_name?: string
  case_number?: string
  suspect_name?: string
  mobile_number?: string
  mobile_numbers?: string[]
  description?: string
  officer_notes?: string
  status?: InvestigationStatus | string
  created_by?: string
  created_at?: string
  updated_at?: string
  tracking_status?: TrackingStatus | string
  uploads?: UploadMetadata[]
  timeline?: TimelineEvent[]
  fix_count?: number
  upload_count?: number
  title?: string
  assigned_to?: string
}

export type InvestigationStatus = 'Active' | 'Pending' | 'Completed' | 'Archived'

// Fix DashboardStats to match what pages expect
export interface DashboardStats {
  total_cases: number
  total_uploads: number
  total_measurements: number
  total_towers: number
  active_cases: number
  completed_cases: number
}

// Fix ForensicReport to match what pages expect
export interface ForensicReport {
  id?: string
  case_id?: string
  title?: string
  summary?: any
  status?: string
  format?: string
  created_at?: string | Date
  file_size?: number
  report_id?: string
  generated_at?: string | Date
  methodology?: any
  fix_count?: number
  subscriber_count?: number
  subscribers?: Array<{ id: string; name: string; [key: string]: any }>
  confidence_level?: any
  algorithm?: any
  [key: string]: any
}

// Fix Notification to include timestamp and investigation_id
export interface Notification {
  id: string
  type?: NotificationType
  title?: string
  message?: string
  caseId?: string
  investigation_id?: string
  read?: boolean
  createdAt?: Date | string
  timestamp?: string
  [key: string]: any
}

// SocketEventType - any string (socket.io events are dynamic)
export type SocketEventType = string

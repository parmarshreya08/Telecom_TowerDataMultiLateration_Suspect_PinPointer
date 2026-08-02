// ============================================================
// E-Rakshak Frontend — Core TypeScript Type Definitions
// Mirrors backend Pydantic contracts from app/contracts/
// ============================================================

// ── Enums ──────────────────────────────────────────────────

export type Operator = 'Airtel' | 'Jio' | 'Vi' | 'BSNL' | 'Unknown'

export type SourceType =
  | 'CDR'
  | 'TowerDump'
  | 'SpotDump'
  | 'LBS'
  | 'CEIR'
  | 'IPDR'
  | 'Unknown'

export type CallType =
  | 'Incoming'
  | 'Outgoing'
  | 'SMS'
  | 'Data'
  | 'Registration'
  | 'Unknown'

export type RadioTechnology = 'GSM' | 'UMTS' | 'LTE' | 'NR' | 'Unknown'

export type FrameStatus = 'Ready' | 'Incomplete' | 'Invalid'

export type CaseStatus = 'Active' | 'Pending' | 'Completed' | 'Archived'

export type TrackingStatus =
  | 'Idle'
  | 'Processing'
  | 'Live'
  | 'Paused'
  | 'Completed'
  | 'Error'

export type AlgorithmType =
  | 'Trilateration'
  | 'Multilateration'
  | 'Kalman'
  | 'Unknown'

// ── Authentication ─────────────────────────────────────────

export interface Officer {
  id: string
  name: string
  department: string
  designation: string
  email: string
  badge_number?: string
  avatar_url?: string
  created_at: string
  last_login?: string
  preferences: OfficerPreferences
}

export interface OfficerPreferences {
  theme: 'light' | 'dark' | 'system'
  language: string
  notifications_enabled: boolean
  map_provider: 'openstreetmap' | 'satellite'
  export_format: 'pdf' | 'excel' | 'csv'
}

export interface LoginCredentials {
  email: string
  password: string
  remember_me: boolean
}

export interface RegisterData {
  name: string
  department: string
  designation: string
  email: string
  password: string
  confirm_password: string
}

export interface AuthState {
  officer: Officer | null
  token: string | null
  is_authenticated: boolean
  is_loading: boolean
}

// ── Upload / Detection ─────────────────────────────────────

/** Mirrors backend DetectionResult */
export interface DetectionResult {
  operator: Operator
  source_type: SourceType
  confidence: number
  detected_by: string
  extractor_name: string
  matched_columns: string[]
}

/** Mirrors backend UploadMetadata */
export interface UploadMetadata {
  upload_id: string
  case_id: string
  source_type: SourceType
  operator: Operator
  original_filename: string
  stored_filename: string
  sha256: string
  mime_type: string
  file_size_bytes: number
  uploaded_by: string
  uploaded_at: string
}

/** Full upload API response */
export interface UploadResponse extends UploadMetadata {
  duplicate: boolean
  detection: DetectionResult
}

// ── Subscriber Records ─────────────────────────────────────

/** Mirrors backend SubscriberEventRecord */
export interface SubscriberEventRecord {
  event_id: string
  upload_id: string
  operator: Operator
  source_type: SourceType
  phone_number?: string
  imei?: string
  imsi?: string
  timestamp: string
  call_type: CallType
  duration_seconds: number
  cgi: string
  mcc?: number
  mnc?: number
  lac?: number
  cell_id?: number
  tower_latitude?: number
  tower_longitude?: number
  signal_strength?: number
  timing_advance?: number
  rtt?: number
  source_file: string
  record_number: number
  raw_fields: Record<string, unknown>
}

/** Mirrors backend ValidatedSubscriberRecord */
export interface ValidatedSubscriberRecord {
  record: SubscriberEventRecord
  normalized_phone_number: string
  quality_score: number
  warnings: string[]
}

/** Mirrors backend ValidationStatistics */
export interface ValidationStatistics {
  total_records: number
  valid_records: number
  rejected_records: number
  duplicate_records: number
  unique_cgis: number
}

/** Mirrors backend ValidationResult */
export interface ValidationResult {
  valid_records: ValidatedSubscriberRecord[]
  rejected_records: SubscriberEventRecord[]
  warning_records: ValidatedSubscriberRecord[]
  validation_statistics: ValidationStatistics
  unique_cgi_set: string[]
}

// ── Tower Records ──────────────────────────────────────────

/** Mirrors backend TowerRecord */
export interface TowerRecord {
  tower_id: string
  operator: Operator
  radio: RadioTechnology
  mcc: number
  mnc: number
  lac: number
  cell_id: number
  cgi: string
  latitude: number
  longitude: number
  azimuth?: number
  beamwidth?: number
  range_meters?: number
  site_address?: string
}

// ── Measurement Frames ─────────────────────────────────────

/** Mirrors backend MeasurementTower */
export interface MeasurementTower {
  tower_id: string
  cgi: string
  latitude: number
  longitude: number
  azimuth?: number
  beamwidth?: number
  signal_strength?: number
  timing_advance?: number
  rtt?: number
  pseudorange_meters?: number
}

/** Mirrors backend MeasurementFrame */
export interface MeasurementFrame {
  frame_id: string
  upload_id: string
  subscriber_identifier: string
  timestamp: string
  towers: MeasurementTower[]
  status: FrameStatus
}

// ── Localization Result (Future backend output) ────────────

/**
 * TODO: Connect to backend trilateration/multilateration engine output.
 * These fields will be populated once the localization engine is implemented.
 */
export interface LocalizationResult {
  latitude: number
  longitude: number
  raw_latitude: number
  raw_longitude: number
  velocity_m_s: number
  clock_bias_meters: number
  residual_rms: number
  gdop: number
  adaptive_R_scale: number
  adaptive_Q_scale: number
  geojson_heatmap: GeoJSONFeatureCollection | null
  timestamp: string
  accuracy_meters: number
  heading_degrees?: number
  algorithm_used: AlgorithmType
  confidence: number
}

/** Algorithm execution metrics */
export interface AlgorithmResult {
  algorithm: AlgorithmType
  status: 'success' | 'failed' | 'pending'
  execution_time_ms: number
  accuracy_meters: number
  residual_rms?: number
  gdop?: number
  adaptive_R_scale?: number
  adaptive_Q_scale?: number
  prediction?: { latitude: number; longitude: number }
  confidence?: number
  clock_bias?: number
  velocity?: { x: number; y: number; magnitude: number }
}

// ── Investigation / Case Management ───────────────────────

export interface Investigation {
  id: string
  case_name: string
  case_number: string
  suspect_name: string
  mobile_number: string
  description: string
  officer_notes: string
  status: CaseStatus
  created_by: string
  created_at: string
  updated_at: string
  tracking_status: TrackingStatus
  uploads: UploadMetadata[]
  timeline: TimelineEvent[]
}

export interface CreateInvestigationData {
  case_name: string
  case_number: string
  suspect_name: string
  mobile_number: string
  description: string
  officer_notes: string
}

export interface TrackingSettings {
  duration: TrackingDuration
  custom_start?: string
  custom_end?: string
}

export type TrackingDuration =
  | '30m'
  | '1h'
  | '3h'
  | '6h'
  | '12h'
  | '24h'
  | '2d'
  | '7d'
  | 'custom'

// ── Live Tracking ──────────────────────────────────────────

export interface LiveTrackingData {
  investigation_id: string
  suspect_identifier: string
  current_location: LocalizationResult | null
  path: PathPoint[]
  towers: TowerRecord[]
  algorithm_results: AlgorithmResult[]
  tracking_status: TrackingStatus
  last_updated: string
}

export interface PathPoint {
  latitude: number
  longitude: number
  timestamp: string
  accuracy_meters: number
  algorithm: AlgorithmType
}

// ── GeoJSON ────────────────────────────────────────────────

export interface GeoJSONPoint {
  type: 'Point'
  coordinates: [number, number]
}

export interface GeoJSONFeature {
  type: 'Feature'
  geometry: GeoJSONPoint | GeoJSONPolygon
  properties: Record<string, unknown>
}

export interface GeoJSONPolygon {
  type: 'Polygon'
  coordinates: [number, number][][]
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

// ── Timeline ───────────────────────────────────────────────

export interface TimelineEvent {
  id: string
  timestamp: string
  type: TimelineEventType
  title: string
  description: string
  metadata?: Record<string, unknown>
}

export type TimelineEventType =
  | 'tower_change'
  | 'location_update'
  | 'kalman_update'
  | 'signal_lost'
  | 'tracking_resumed'
  | 'export_generated'
  | 'upload_completed'
  | 'investigation_created'
  | 'investigation_completed'
  | 'email_sent'

// ── Notifications ──────────────────────────────────────────

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: string
  read: boolean
  investigation_id?: string
  action_url?: string
}

export type NotificationType =
  | 'location_updated'
  | 'tower_changed'
  | 'signal_lost'
  | 'tracking_resumed'
  | 'email_sent'
  | 'investigation_completed'
  | 'report_generated'
  | 'upload_completed'
  | 'error'

// ── Email Status ───────────────────────────────────────────

export type EmailStatus = 'pending' | 'sending' | 'delivered' | 'failed'

export interface EmailRecord {
  id: string
  to: string
  subject: string
  status: EmailStatus
  sent_at?: string
  investigation_id: string
}

// ── Report / Export ────────────────────────────────────────

export type ExportFormat = 'csv' | 'excel' | 'pdf' | 'json' | 'geojson'

export interface ReportRecord {
  id: string
  investigation_id: string
  format: ExportFormat
  generated_at: string
  file_name: string
  file_size_bytes: number
  generated_by: string
}

// ── API Responses ──────────────────────────────────────────

export interface ApiError {
  detail: string
  status_code?: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface HealthStatus {
  status: 'healthy' | 'degraded'
  database: 'connected' | 'unreachable'
  timestamp: string
}

// ── Dashboard Stats ────────────────────────────────────────

export interface DashboardStats {
  active_cases: number
  pending_cases: number
  completed_cases: number
  todays_uploads: number
  active_tracking_sessions: number
  reports_generated: number
}

// ── Processing Pipeline ────────────────────────────────────

export type PipelineStage =
  | 'upload'
  | 'validation'
  | 'tower_detection'
  | 'trilateration'
  | 'multilateration'
  | 'kalman_filter'
  | 'heatmap_generation'
  | 'ready'

export interface PipelineProgress {
  stage: PipelineStage
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress_percent: number
  message?: string
  duration_ms?: number
}

// ── Map Controls ───────────────────────────────────────────

export interface MapLayerControls {
  show_heatmap: boolean
  show_confidence_ellipse: boolean
  show_current_marker: boolean
  show_path: boolean
  show_towers: boolean
  heatmap_opacity: number
  heatmap_radius: number
}

// ── Socket Events (for future WebSocket integration) ───────

export type SocketEventType =
  | 'tracking:location_update'
  | 'tracking:tower_change'
  | 'tracking:signal_lost'
  | 'tracking:resumed'
  | 'tracking:completed'
  | 'pipeline:progress'
  | 'notification:new'
  | 'connect'
  | 'disconnect'
  | 'error'

export interface SocketMessage<T = unknown> {
  event: SocketEventType
  data: T
  timestamp: string
}

// ============================================================
// E-Rakshak — Axios API Client
// TODO: Wire authentication token + API key from auth context
// ============================================================

import axios from 'axios'
import { API_BASE_URL, API_KEY_HEADER, LS_KEYS } from '@/constants'
import type {
  HealthStatus,
  UploadResponse,
  Investigation,
  CreateInvestigationData,
  DashboardStats,
  PaginatedResponse,
  ReportRecord,
  Notification,
  ForensicReport,
  GeoJSONFeatureCollection,
} from '@/types'

// ── Axios instance ─────────────────────────────────────────
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor — attach auth token and API key
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(LS_KEYS.AUTH_TOKEN)
  if (token) config.headers.Authorization = `Bearer ${token}`

  // TODO: Replace with env var once backend wires API key validation
  const apiKey = import.meta.env.VITE_API_KEY
  if (apiKey) config.headers[API_KEY_HEADER] = apiKey

  return config
})

// Response interceptor — handle 401/403 globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(LS_KEYS.AUTH_TOKEN)
      localStorage.removeItem(LS_KEYS.OFFICER)
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// ── Health ─────────────────────────────────────────────────
export const healthApi = {
  check: () => apiClient.get<HealthStatus>('/health').then((r) => r.data),
}

// ── Upload ─────────────────────────────────────────────────
export const uploadApi = {
  /**
   * POST /api/upload — multipart form data
   * TODO: Backend requires: file, case_id, uploaded_by
   */
  uploadFile: (
    file: File,
    caseId: string,
    uploadedBy: string,
    onProgress?: (pct: number) => void
  ) => {
    const form = new FormData()
    form.append('file', file)
    form.append('case_id', caseId)
    form.append('uploaded_by', uploadedBy)

    return apiClient
      .post<UploadResponse>('/api/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (onProgress && e.total) {
            onProgress(Math.round((e.loaded * 100) / e.total))
          }
        },
      })
      .then((r) => r.data)
  },
}

// ── Investigations ─────────────────────────────────────────
// TODO: These endpoints don't exist in backend yet — implement when ready
export const investigationApi = {
  list: (params?: { status?: string; page?: number; page_size?: number }) =>
    apiClient
      .get<PaginatedResponse<Investigation>>('/api/investigations', { params })
      .then((r) => r.data),

  getById: (id: string) =>
    apiClient.get<Investigation>(`/api/investigations/${id}`).then((r) => r.data),

  create: (data: CreateInvestigationData) =>
    apiClient.post<Investigation>('/api/investigations', data).then((r) => r.data),

  update: (id: string, data: Partial<CreateInvestigationData>) =>
    apiClient.patch<Investigation>(`/api/investigations/${id}`, data).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`/api/investigations/${id}`).then((r) => r.data),

  getDashboardStats: () =>
    apiClient.get<DashboardStats>('/api/dashboard/stats').then((r) => r.data),
}

// ── Auth ───────────────────────────────────────────────────
// TODO: Backend auth endpoints not yet implemented
export const authApi = {
  login: (email: string, password: string) =>
    apiClient
      .post<{ access_token: string; token_type: string; officer: unknown }>(
        '/api/auth/login',
        { email, password }
      )
      .then((r) => r.data),

  register: (data: unknown) =>
    apiClient.post('/api/auth/register', data).then((r) => r.data),

  logout: () =>
    apiClient.post('/api/auth/logout').then((r) => r.data),

  me: () =>
    apiClient.get('/api/auth/me').then((r) => r.data),

  googleOAuth: () => {
    // TODO: Redirect to Google OAuth endpoint
    window.location.href = `${API_BASE_URL}/api/auth/google`
  },
}

// ── Tracking / Localization ────────────────────────────────
export const trackingApi = {
  /** POST /api/case/{case_id}/localize — run trilateration + Kalman on stored frames */
  runLocalization: (caseId: string) =>
    apiClient
      .post<{ case_id: string; fix_count: number; geojson: GeoJSONFeatureCollection }>(
        `/api/case/${caseId}/localize`
      )
      .then((r) => r.data),

  /** GET /api/case/{case_id}/localize/geojson — read cached GeoJSON fixes */
  getGeoJSON: (caseId: string) =>
    apiClient
      .get<GeoJSONFeatureCollection>(`/api/case/${caseId}/localize/geojson`)
      .then((r) => r.data),

  /** GET /api/case/{case_id}/uploads — list uploads for a case */
  getCaseUploads: (caseId: string) =>
    apiClient
      .get<{ case_id: string; uploads: unknown[]; total: number }>(
        `/api/case/${caseId}/uploads`
      )
      .then((r) => r.data),

  /** GET /api/towers?cgi=... — lookup tower by CGI */
  lookupTower: (cgi: string) =>
    apiClient
      .get<{ tower_id: string; latitude: number; longitude: number; azimuth?: number; beamwidth?: number }>(
        '/api/towers',
        { params: { cgi } }
      )
      .then((r) => r.data),
}

// ── Reports / Export ───────────────────────────────────────
export const reportApi = {
  /** GET /api/case/{case_id}/report — forensic report for a case */
  getForensicReport: (caseId: string) =>
    apiClient
      .get<ForensicReport>(`/api/case/${caseId}/report`)
      .then((r) => r.data),

  list: (investigationId: string) =>
    apiClient
      .get<ReportRecord[]>(`/api/investigations/${investigationId}/reports`)
      .then((r) => r.data),

  generate: (investigationId: string, format: string) =>
    apiClient
      .post(`/api/investigations/${investigationId}/reports/generate`, { format })
      .then((r) => r.data),

  download: (reportId: string) =>
    apiClient
      .get(`/api/reports/${reportId}/download`, { responseType: 'blob' })
      .then((r) => r.data),
}

// ── Notifications ──────────────────────────────────────────
// TODO: Backend notification endpoints not yet implemented
export const notificationApi = {
  list: () =>
    apiClient.get<Notification[]>('/api/notifications').then((r) => r.data),

  markRead: (id: string) =>
    apiClient.patch(`/api/notifications/${id}/read`).then((r) => r.data),

  markAllRead: () =>
    apiClient.post('/api/notifications/read-all').then((r) => r.data),
}

// ============================================================
// E-Rakshak — Axios API Client
// ============================================================

import axios from 'axios'
import { API_BASE_URL } from '@/constants'
import { extractErrorMessage } from '@/utils'
import type {
  HealthStatus,
  UploadResponse,
  Investigation,
  CreateInvestigationData,
  DashboardStats,
  PaginatedResponse,
  ForensicReport,
  GeoJSONFeatureCollection,
  UploadResult,
  BatchUploadResponse,
  FileListResponse,
  RttObservation,
  CaseStatus,
} from '@/types'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor — attach Bearer token + strip Content-Type for FormData
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('erakshak_access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

export function formatDeleteError(err: unknown, resource: 'file' | 'investigation'): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'Could not connect to the backend.'
    if (err.response.status === 404) {
      return resource === 'investigation' ? 'Investigation not found.' : 'File not found.'
    }
    if (err.response.status >= 500) {
      return resource === 'investigation'
        ? 'Failed to delete investigation.'
        : 'Failed to delete CDR. The server encountered an error.'
    }
    const detail = err.response.data?.detail
    if (typeof detail === 'string') return detail
  }
  return extractErrorMessage(err)
}

// Response interceptor — on 401 (except auth endpoints), clear session + go to login
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    const url = error?.config?.url ?? ''
    const isAuthCall = url.startsWith('/api/auth/')
    if (status === 401 && !isAuthCall && !url.endsWith('/login')) {
      localStorage.removeItem('erakshak_access_token')
      localStorage.removeItem('erakshak_officer')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Health
export const healthApi = {
  check: () => apiClient.get<HealthStatus>('/health').then((r) => r.data),
}

// Upload (multi-file + URL)
export const uploadApi = {
  uploadFiles: (
    files: File[],
    caseId: string,
    uploadedBy: string = 'Officer',
    onProgress?: (pct: number) => void
  ): Promise<BatchUploadResponse> => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    form.append('uploaded_by', uploadedBy)

    return apiClient
      .post<BatchUploadResponse>(`/api/case/${caseId}/upload`, form, {
        onUploadProgress: (e) => {
          if (onProgress && e.total) {
            onProgress(Math.round((e.loaded * 100) / e.total))
          }
        },
      })
      .then((r) => r.data)
  },

  uploadFromUrl: (
    caseId: string,
    url: string,
    filename: string = ''
  ): Promise<UploadResult> => {
    return apiClient
      .post<UploadResult>(`/api/case/${caseId}/upload/url`, { url, filename })
      .then((r) => r.data)
  },

  // Legacy single-file upload
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
        onUploadProgress: (e) => {
          if (onProgress && e.total) {
            onProgress(Math.round((e.loaded * 100) / e.total))
          }
        },
      })
      .then((r) => r.data)
  },
}

// File management
export const fileApi = {
  listCaseFiles: (caseId: string): Promise<FileListResponse> =>
    apiClient.get<FileListResponse>(`/api/case/${caseId}/files`).then((r) => r.data),

  getFileStatus: (
    uploadId: string
  ): Promise<{ upload_id: string; upload_status: string; error_message?: string }> =>
    apiClient.get(`/api/file/${uploadId}/status`).then((r) => r.data),

  renameFile: (uploadId: string, displayName: string): Promise<void> =>
    apiClient.patch(`/api/file/${uploadId}`, { display_name: displayName }).then((r) => r.data),

  deleteFile: (uploadId: string): Promise<void> =>
    apiClient.delete(`/api/file/${uploadId}`).then((r) => r.data),

  batchDelete: (caseId: string, uploadIds: string[]): Promise<void> =>
    apiClient.post(`/api/case/${caseId}/files/batch-delete`, { upload_ids: uploadIds }).then((r) => r.data),

  reinitializeCase: (caseId: string): Promise<void> =>
    apiClient.delete(`/api/case/${caseId}/files`).then((r) => r.data),
}

// Investigations
export const investigationApi = {
  list: (params?: { status?: string; page?: number; page_size?: number }) =>
    apiClient
      .get<PaginatedResponse<Investigation>>('/api/cases', { params })
      .then((r) => r.data),

  getById: (id: string) =>
    apiClient.get<Investigation>(`/api/case/${id}`).then((r) => r.data),

  getCaseEvents: (caseId: string, limit: number = 500) =>
    apiClient
      .get<{ case_id: string; events: unknown[]; total: number }>(`/api/case/${caseId}/events`, {
        params: { limit },
      })
      .then((r) => r.data),

  create: (data: CreateInvestigationData) =>
    apiClient.post<Investigation>('/api/cases', data).then((r) => r.data),

  update: (id: string, data: Partial<CreateInvestigationData> & { status?: string }) =>
    apiClient.patch<Investigation>(`/api/case/${id}`, data).then((r) => r.data),

  updateStatus: (id: string, status: CaseStatus) =>
    apiClient
      .patch<{ id: string; status: CaseStatus; message: string }>(`/api/case/${id}/status`, { status })
      .then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`/api/case/${id}`).then((r) => r.data),

  getDashboardStats: () =>
    apiClient.get<DashboardStats>('/api/dashboard/stats').then((r) => r.data),

  getQualityReport: (caseId: string): Promise<any> =>
    apiClient.get(`/api/case/${caseId}/quality-report`).then((r) => r.data),
}

// Tracking / Localization
export const trackingApi = {
  runLocalization: (caseId: string, uploadIds: string[] = []) =>
    apiClient
      .post<{ case_id: string; fix_count: number; geojson: GeoJSONFeatureCollection }>(
        `/api/case/${caseId}/localize`,
        undefined,
        {
          params: { geocode: 'true', upload_ids: uploadIds },
          paramsSerializer: { indexes: null },
        }
      )
      .then((r) => r.data),

  getGeoJSON: (caseId: string, start?: string, end?: string) => {
    const params: Record<string, string> = { geocode: 'true' }
    if (start) params.start = start
    if (end) params.end = end
    return apiClient
      .get<GeoJSONFeatureCollection>(`/api/case/${caseId}/localize/geojson`, { params })
      .then((r) => r.data)
  },

  getHeatmap: (caseId: string, start?: string, end?: string) => {
    const params: Record<string, string> = {}
    if (start) params.start = start
    if (end) params.end = end
    return apiClient
      .get<GeoJSONFeatureCollection>(`/api/case/${caseId}/heatmap`, { params })
      .then((r) => r.data)
  },

  getRttObservations: (caseId: string) =>
    apiClient
      .get<{ case_id: string; observations: RttObservation[]; total: number }>(
        `/api/case/${caseId}/rtt-observations`
      )
      .then((r) => r.data),

  getCaseUploads: (caseId: string) =>
    apiClient
      .get<{ case_id: string; uploads: unknown[]; total: number }>(
        `/api/case/${caseId}/uploads`
      )
      .then((r) => r.data),

  lookupTower: (cgi: string) =>
    apiClient
      .get<{ tower_id: string; latitude: number; longitude: number; azimuth?: number; beamwidth?: number }>(
        '/api/towers',
        { params: { cgi } }
      )
      .then((r) => r.data),

  listAllTowers: () =>
    apiClient
      .get<{ towers: Array<{ tower_id: string; operator: string; radio: string; cgi: string; latitude: number; longitude: number; azimuth?: number; beamwidth?: number; range_meters?: number; site_address?: string }>; total: number }>(
        '/api/towers/list'
      )
      .then((r) => r.data),
}

// Reports / Export
export const reportApi = {
  getForensicReport: (caseId: string) =>
    apiClient
      .get<ForensicReport>(`/api/case/${caseId}/report`)
      .then((r) => r.data),
}

// Export downloads — returns Blob for file save
export interface ExportParams {
  start?: string
  end?: string
}

export const exportApi = {
  downloadCSV: (caseId: string, params?: ExportParams) =>
    apiClient
      .get(`/api/case/${caseId}/export/csv`, {
        params,
        responseType: 'blob',
      })
      .then((r) => r.data as Blob),

  downloadKML: (caseId: string, params?: ExportParams) =>
    apiClient
      .get(`/api/case/${caseId}/export/kml`, {
        params,
        responseType: 'blob',
      })
      .then((r) => r.data as Blob),

  downloadPDF: (caseId: string, params?: ExportParams) =>
    apiClient
      .get(`/api/case/${caseId}/export/pdf`, {
        params,
        responseType: 'blob',
      })
      .then((r) => r.data as Blob),
}

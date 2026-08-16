import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Share2, Download, FileText, Map, Globe,
  Navigation, Radio, Wifi, WifiOff, Clock,
  ArrowLeft, Crosshair, PlayCircle, RefreshCw, AlertCircle,
  Copy, Check, Play, Pause, Trash2,
  FolderOpen, SlidersHorizontal, MoreVertical, X,
  ChevronUp, ChevronDown, Smartphone, ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { InvestigationMap } from '@/components/map/InvestigationMap'
import { ShareLocationModal } from '@/components/investigation/ShareLocationModal'
import { SDRUploadModal } from '@/components/investigation/SDRUploadModal'
import {
  formatCoordinate, formatDateTime, formatAccuracy,
  downloadBlob, extractErrorMessage, cn,
  buildGoogleMapsUrl, copyToClipboard,
} from '@/utils'
import { TRACKING_STATUS_COLORS, DEFAULT_MAP_CENTER } from '@/constants'
import { investigationApi, trackingApi, exportApi, fileApi } from '@/services/api'
import type { GeoJSONFeatureCollection, Investigation, TowerRecord, RttObservation, CaseFile, InvestigationSwapEvent, RFVerifiedFix } from '@/types'
import { InvestigationExplorer, SelectedItem } from '@/components/investigation/InvestigationExplorer'

interface LocalFix {
  fix_id: string
  case_id: string
  subscriber_identifier: string
  timestamp: string
  latitude: number
  longitude: number
  confidence_radius_meters: number
  velocity_east: number
  velocity_north: number
  gdop: number
  residual_rms: number
  ta_inner_m?: number
  ta_outer_m?: number
  rss_i_dbm?: number
  geocode?: string
  localization_method?: string
  kalman_applied?: boolean
  towers_used?: Array<{ cgi: string; lat: number; lon: number; signal_strength?: number }>
  measurement_constraints?: string[]
}

function parseFixes(geo: GeoJSONFeatureCollection, caseId: string): LocalFix[] {
  return geo.features
    .filter((f) => f.geometry.type === 'Point')
    .map((f, idx) => ({
      fix_id: String(f.id || idx),
      case_id: caseId,
      subscriber_identifier: String(f.properties?.subscriber_identifier || 'Target'),
      timestamp: String(f.properties?.timestamp || new Date().toISOString()),
      latitude: (f.geometry as { coordinates: [number, number] }).coordinates[1],
      longitude: (f.geometry as { coordinates: [number, number] }).coordinates[0],
      confidence_radius_meters: Number(f.properties?.confidence_radius_meters || 100),
      velocity_east: Number(f.properties?.velocity_east || 0),
      velocity_north: Number(f.properties?.velocity_north || 0),
      gdop: Number(f.properties?.gdop || 0),
      residual_rms: Number(f.properties?.residual_rms || 0),
      ta_inner_m: f.properties?.ta_inner_m != null ? Number(f.properties.ta_inner_m) : undefined,
      ta_outer_m: f.properties?.ta_outer_m != null ? Number(f.properties.ta_outer_m) : undefined,
      rss_i_dbm: f.properties?.rss_i_dbm != null ? Number(f.properties.rss_i_dbm) : undefined,
      geocode: f.properties?.geocode ? String(f.properties.geocode) : undefined,
      localization_method: f.properties?.localization_method ? String(f.properties.localization_method) : undefined,
      kalman_applied: f.properties?.kalman_applied != null ? Boolean(f.properties.kalman_applied) : undefined,
      towers_used: (f.properties?.towers_used as LocalFix['towers_used']) || [],
      measurement_constraints: (f.properties?.measurement_constraints as LocalFix['measurement_constraints']) || [],
    }))
}

// TEMPORARY FRONTEND MOCK — replace with backend event stream later
const ENABLE_SWAP_EVENT_MOCKS = true

const MOCK_SWAP_TEMPLATES = [
  {
    id: 'mock-sim-swap-1',
    event_type: 'sim_swap' as const,
    old_imsi: '404450123456789',
    new_imsi: '404450987654321',
    title: 'SIM Swap Detected',
    description: 'Subscriber IMSI changed: 404450123456789 → 404450987654321',
  },
  {
    id: 'mock-device-swap-1',
    event_type: 'device_swap' as const,
    old_imei: '862045041234567',
    new_imei: '354089097654321',
    title: 'Device Handover / IMEI Swap Detected',
    description: 'Device IMEI changed: 862045041234567 → 354089097654321',
  },
]

// TEMPORARY FRONTEND MOCK — replace with backend is_rogue data
const ENABLE_ROGUE_BTS_MOCK = true

function createMockRogueTower(referenceLat?: number, referenceLon?: number): TowerRecord {
  const lat = referenceLat ?? 28.6139
  const lon = referenceLon ?? 77.2090
  return {
    tower_id: 'MOCK-ROGUE-BTS-01',
    cgi: '404-45-ROGUE-99',
    operator: 'UNREGISTERED / UNKNOWN',
    radio: 'Fake GSM/LTE',
    latitude: lat + 0.0072,
    longitude: lon + 0.0058,
    azimuth: 180,
    beamwidth: 360,
    range_meters: 850,
    site_address: '⚠️ Unregistered Mobile BTS / IMSI Catcher Unit',
    is_rogue: true,
  }
}

export default function LiveInvestigationPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [investigation, setInvestigation] = useState<Investigation | null>(null)
  const [fixes, setFixes] = useState<LocalFix[]>([])
  const [geojson, setGeojson] = useState<GeoJSONFeatureCollection | null>(null)
  const [towers, setTowers] = useState<TowerRecord[]>([])
  const [kdeHeatPoints, setKdeHeatPoints] = useState<Array<[number, number, number]>>([])
  const [rttObservations, setRttObservations] = useState<RttObservation[]>([])
  const [mode, setMode] = useState<'multilateration' | 'rtt'>('multilateration')
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [centerTrigger, setCenterTrigger] = useState(false)
  const [autoFollow, setAutoFollow] = useState(true)
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)

  const [files, setFiles] = useState<CaseFile[]>([])
  const [selectedItem, setSelectedItem] = useState<SelectedItem>({ type: 'overview', id: null })
  const [isDeletingFile, setIsDeletingFile] = useState(false)

  // RF / SDR Ground Verification state
  const [rfVerifiedFix, setRfVerifiedFix] = useState<RFVerifiedFix | null>(null)
  const [sdrModalOpen, setSdrModalOpen] = useState(false)
  const [sdrFocusTrigger, setSdrFocusTrigger] = useState(false)

  // Mobile drawer states
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false)
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false)
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false)
  const mobileActionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (mobileActionsRef.current && !mobileActionsRef.current.contains(e.target as Node)) {
        setMobileActionsOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMobileExplorerOpen(false)
        setMobileDetailsOpen(false)
        setMobileActionsOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('click', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Trigger resize event for Leaflet map when mobile drawers or bottom sheets toggle
  useEffect(() => {
    const t1 = setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
    const t2 = setTimeout(() => window.dispatchEvent(new Event('resize')), 250)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [mobileExplorerOpen, mobileDetailsOpen])

  // Body scroll lock on mobile when drawer or bottom sheet is open
  useEffect(() => {
    if (mobileExplorerOpen || mobileDetailsOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [mobileExplorerOpen, mobileDetailsOpen])

  const [explorerWidth, setExplorerWidth] = useState(() => {
    const saved = localStorage.getItem('investigationExplorerWidth')
    return saved ? parseInt(saved, 10) : 300
  })
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const saved = localStorage.getItem('investigationRightPanelWidth')
    return saved ? parseInt(saved, 10) : 320
  })

  useEffect(() => {
    localStorage.setItem('investigationExplorerWidth', explorerWidth.toString())
  }, [explorerWidth])

  useEffect(() => {
    localStorage.setItem('investigationRightPanelWidth', rightPanelWidth.toString())
  }, [rightPanelWidth])

  const workspaceRef = useRef<HTMLDivElement>(null)

  const startExplorerResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const originalCursor = document.body.style.cursor
    document.body.style.cursor = 'col-resize'

    const onMove = (moveEvent: PointerEvent) => {
      if (!workspaceRef.current) return
      const rect = workspaceRef.current.getBoundingClientRect()
      // Calculate width relative to workspace left edge
      const newWidth = moveEvent.clientX - rect.left
      setExplorerWidth(Math.max(240, Math.min(420, newWidth)))
    }

    const onUp = (upEvent: PointerEvent) => {
      target.releasePointerCapture(upEvent.pointerId)
      document.body.style.cursor = originalCursor
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }, [])

  const startRightPanelResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const originalCursor = document.body.style.cursor
    document.body.style.cursor = 'col-resize'

    const onMove = (moveEvent: PointerEvent) => {
      if (!workspaceRef.current) return
      const rect = workspaceRef.current.getBoundingClientRect()
      // Calculate width relative to workspace right edge
      const newWidth = rect.right - moveEvent.clientX
      setRightPanelWidth(Math.max(280, Math.min(450, newWidth)))
    }

    const onUp = (upEvent: PointerEvent) => {
      target.releasePointerCapture(upEvent.pointerId)
      document.body.style.cursor = originalCursor
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }, [])

  // Time range filter
  const [timeStart, setTimeStart] = useState('')
  const [timeEnd, setTimeEnd] = useState('')

  const loadHeatmap = useCallback(async (start?: string, end?: string) => {
    if (!id) return []
    try {
      const fc = await trackingApi.getHeatmap(id, start || undefined, end || undefined)
      return (fc.features ?? []).map((f) => {
        const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates
        return [lat, lon, Number(f.properties?.weight ?? 0)] as [number, number, number]
      })
    } catch {
      return []
    }
  }, [id])

  const loadRttObservations = useCallback(async () => {
    if (!id) return
    try {
      const res = await trackingApi.getRttObservations(id)
      setRttObservations(res.observations ?? [])
    } catch {
      // RTT mode is optional; silence failures so the UI falls back to multilateration.
    }
  }, [id])

  const loadCaseData = useCallback(async (start?: string, end?: string) => {
    if (!id) return null
    const caseData = await investigationApi.getById(id).catch(() => ({
      id,
      case_name: `Investigation ${id}`,
      case_number: id,
      suspect_name: `Target ${id}`,
      status: 'Active' as const,
      created_by: 'Officer',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    const geo = await trackingApi.getGeoJSON(id, start || undefined, end || undefined).catch(() => null)

    const towerData = await trackingApi.listAllTowers().catch(() => ({ towers: [], total: 0 }))
    const heatmapPoints = await loadHeatmap(start, end)
    const filesData = await fileApi.listCaseFiles(id).catch(() => ({ files: [], total: 0 }))
    return { caseData, geo, towerData, heatmapPoints, filesData }
  }, [id, loadHeatmap])

  const applyLoaded = useCallback((data: NonNullable<Awaited<ReturnType<typeof loadCaseData>>>) => {
    setInvestigation(data.caseData)

    if (data.geo) {
      setGeojson(data.geo)
      setFixes(parseFixes(data.geo, id))
    }

    const parsedTowers: TowerRecord[] = (data.towerData?.towers ?? []).map((t) => ({
      tower_id: t.tower_id,
      operator: t.operator as TowerRecord['operator'],
      radio: t.radio as TowerRecord['radio'],
      mcc: 0, mnc: 0, lac: 0, cell_id: 0,
      cgi: t.cgi,
      latitude: t.latitude,
      longitude: t.longitude,
      azimuth: t.azimuth,
      beamwidth: t.beamwidth,
      range_meters: t.range_meters,
      site_address: t.site_address,
      is_rogue: t.is_rogue ?? false,
    }))

    let allTowers = parsedTowers
    if (ENABLE_ROGUE_BTS_MOCK && !allTowers.some((t) => t.is_rogue)) {
      const parsedFixes = data.geo ? parseFixes(data.geo, id) : []
      const refLat = allTowers[0]?.latitude ?? parsedFixes[0]?.latitude ?? DEFAULT_MAP_CENTER[0]
      const refLon = allTowers[0]?.longitude ?? parsedFixes[0]?.longitude ?? DEFAULT_MAP_CENTER[1]
      allTowers = [...allTowers, createMockRogueTower(refLat, refLon)]
    }

    setTowers(allTowers)
    setKdeHeatPoints(data.heatmapPoints ?? [])
    setFiles(data.filesData.files ?? [])
  }, [id])

  const runLoad = useCallback((start?: string, end?: string) => {
    setError(null)
    setInitialLoading(true)
    loadCaseData(start, end)
      .then((data) => { if (data) applyLoaded(data) })
      .catch((err: unknown) => setError((err as Error)?.message || 'Failed to load case data'))
      .finally(() => setInitialLoading(false))
  }, [loadCaseData, applyLoaded])

  useEffect(() => {
    let ignore = false
    loadCaseData()
      .then((data) => { if (data && !ignore) applyLoaded(data) })
      .catch((err: unknown) => {
        if (!ignore) setError((err as Error)?.message || 'Failed to load case data')
      })
      .finally(() => { if (!ignore) setInitialLoading(false) })
    return () => {
      ignore = true
    }
  }, [loadCaseData, applyLoaded])

  const applyTimeFilter = () => {
    runLoad(timeStart || undefined, timeEnd || undefined)
  }

  const handleDeleteFile = async (uploadId: string) => {
    if (!confirm('Are you sure you want to delete this CDR? All associated tracking fixes will be lost.')) return
    setIsDeletingFile(true)
    try {
      await fileApi.deleteFile(uploadId)
      await loadCaseData().then((data) => { if (data) applyLoaded(data) })
      if (selectedItem.id === uploadId) {
        setSelectedItem({ type: 'overview', id: null })
      }
    } catch (err: unknown) {
      setError(extractErrorMessage(err) || 'Failed to delete file')
    } finally {
      setIsDeletingFile(false)
    }
  }

  const clearTimeFilter = () => {
    setTimeStart('')
    setTimeEnd('')
    runLoad()
  }

  const handleRunLocalization = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await trackingApi.runLocalization(id)
      if (res.geojson) {
        setGeojson(res.geojson)
        setFixes(parseFixes(res.geojson, id))
      }
      const heatmapPoints = await loadHeatmap()
      setKdeHeatPoints(heatmapPoints)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? (err as Error)?.message ?? 'Localization failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Export handlers ──
  const getExportParams = () => {
    const params: Record<string, string> = {}
    if (timeStart) params.start = timeStart
    if (timeEnd) params.end = timeEnd
    return params
  }

  const handleExportCSV = async () => {
    if (!id) return
    setExporting('csv')
    try {
      const blob = await exportApi.downloadCSV(id, getExportParams())
      downloadBlob(blob, `e-rakshak_${id}_fixes.csv`)
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
    } finally { setExporting(null) }
  }

  const handleExportKML = async () => {
    if (!id) return
    setExporting('kml')
    try {
      const blob = await exportApi.downloadKML(id, getExportParams())
      downloadBlob(blob, `e-rakshak_${id}_fixes.kml`)
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
    } finally { setExporting(null) }
  }

  const handleExportPDF = async () => {
    if (!id) return
    setExporting('pdf')
    try {
      const blob = await exportApi.downloadPDF(id, getExportParams())
      downloadBlob(blob, `e-rakshak_${id}_forensic_report.pdf`)
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
    } finally { setExporting(null) }
  }

  const latestFix = fixes.length > 0 ? fixes[fixes.length - 1] : null

  // ── Timeline playback scrubber ──
  const [scrubIdx, setScrubIdx] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const activeFix = scrubIdx != null && fixes[scrubIdx] ? fixes[scrubIdx] : latestFix

  // Single Source of Truth for current suspect location
  const currentSuspectLocation = (() => {
    if (activeFix && typeof activeFix.latitude === 'number' && typeof activeFix.longitude === 'number') {
      return { latitude: activeFix.latitude, longitude: activeFix.longitude }
    }
    if (latestFix && typeof latestFix.latitude === 'number' && typeof latestFix.longitude === 'number') {
      return { latitude: latestFix.latitude, longitude: latestFix.longitude }
    }
    if (fixes.length > 0 && typeof fixes[0].latitude === 'number' && typeof fixes[0].longitude === 'number') {
      return { latitude: fixes[0].latitude, longitude: fixes[0].longitude }
    }
    if (geojson?.features) {
      const pt = geojson.features.find((f) => f.geometry.type === 'Point')
      if (pt) {
        const coords = (pt.geometry as { coordinates: [number, number] }).coordinates
        if (Array.isArray(coords) && typeof coords[1] === 'number' && typeof coords[0] === 'number') {
          return { latitude: coords[1], longitude: coords[0] }
        }
      }
    }
    return null
  })()

  const suspectGoogleMapsUrl = currentSuspectLocation
    ? buildGoogleMapsUrl(currentSuspectLocation.latitude, currentSuspectLocation.longitude)
    : null

  const handleGoogleMapsLink = () => {
    if (!suspectGoogleMapsUrl) return
    copyToClipboard(suspectGoogleMapsUrl).then((ok) => {
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    })
  }

  const openGoogleMaps = () => {
    if (suspectGoogleMapsUrl) {
      window.open(suspectGoogleMapsUrl, '_blank', 'noopener,noreferrer')
    }
  }

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      setScrubIdx((i) => {
        if (i == null) return 0
        return i + 1 < fixes.length ? i + 1 : i
      })
    }, 600)
    return () => clearInterval(timer)
  }, [playing, fixes.length])

  useEffect(() => {
    if (scrubIdx != null && scrubIdx >= fixes.length - 1) setPlaying(false)
  }, [scrubIdx, fixes.length])

  const scrubValue = scrubIdx ?? fixes.length - 1
  const maxScrub = Math.max(fixes.length - 1, 0)

  // ── Multi-SIM / Device Handover Events (Bonus Feature 1) ──
  // Derives swap events only when real timeline fixes exist to map against.
  // Never marks index 0 as a swap event by default on 1/1 cases.
  const timelineSwapEvents: InvestigationSwapEvent[] = useMemo(() => {
    if (!ENABLE_SWAP_EVENT_MOCKS || fixes.length < 2) {
      return []
    }

    const events: InvestigationSwapEvent[] = []

    if (fixes.length >= 3) {
      // Place SIM swap at historical index 1 (timestamp derived from real fixes[1])
      events.push({
        ...MOCK_SWAP_TEMPLATES[0],
        timestamp: fixes[1].timestamp,
        fix_index: 1,
      })

      // If 4 or more fixes, place Device swap at historical index 2 (timestamp from real fixes[2])
      if (fixes.length >= 4) {
        events.push({
          ...MOCK_SWAP_TEMPLATES[1],
          timestamp: fixes[2].timestamp,
          fix_index: 2,
        })
      }
    } else if (fixes.length === 2) {
      // For exactly 2 fixes, map SIM swap to historical index 0
      // Since default load selects index 1 (the latest), no alert is shown on initial load
      events.push({
        ...MOCK_SWAP_TEMPLATES[0],
        timestamp: fixes[0].timestamp,
        fix_index: 0,
      })
    }

    return events
  }, [fixes])

  // Active swap event is determined strictly when the currently selected fix matches a swap event
  const activeSwapEvent = useMemo(() => {
    if (timelineSwapEvents.length === 0) return null
    const currentIdx = scrubIdx != null ? scrubIdx : fixes.length - 1
    return timelineSwapEvents.find((e) => e.fix_index === currentIdx) ?? null
  }, [timelineSwapEvents, scrubIdx, fixes.length])

  const formatEventTime = (isoString: string): string => {
    try {
      const d = new Date(isoString)
      if (isNaN(d.getTime())) return isoString
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    } catch {
      return isoString
    }
  }

  const pathPoints = fixes.map((f) => ({
    latitude: f.latitude,
    longitude: f.longitude,
    timestamp: f.timestamp,
    accuracy_meters: f.confidence_radius_meters,
    algorithm: 'Kalman' as const,
  }))

  const caseName = investigation?.case_name || id
  const caseNumber = investigation?.case_number || id
  const suspectName = investigation?.suspect_name || 'Target'

  const renderDetailsContent = () => (
    <>
      {error && (
        <div className="border-b border-danger/20 bg-danger-light px-4 py-3 text-xs text-danger dark:bg-danger/10 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-danger" />
          <div>
            <p className="font-semibold">Localization Status</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ── Investigation Details ── */}
      <Section icon={<Radio className="h-4 w-4 text-primary-600" />} label="Investigation Details">
        <div className="space-y-2">
          <DataRow label="Case Name" value={investigation?.case_name || caseName} highlight />
          <DataRow label="Case Number" value={caseNumber} />
          <DataRow label="Target Suspect" value={suspectName} />
          <DataRow label="Primary Mobile" value={investigation?.mobile_number || (investigation?.mobile_numbers && investigation.mobile_numbers[0]) || 'N/A'} />
          <DataRow label="Lead Officer" value={investigation?.created_by || 'Officer'} />
          <DataRow label="Status" value={investigation?.status || (fixes.length > 0 ? 'Active' : 'Draft')} />
          <Button
            size="sm"
            variant="secondary"
            className="w-full mt-2 justify-center text-xs"
            onClick={() => navigate(`/investigations/${id}`)}
          >
            Open Full Case Record
          </Button>
        </div>
      </Section>

      {selectedItem.type === 'cdr' && selectedItem.id && (
        <Section icon={<FileText className="h-4 w-4 text-primary-600" />} label="CDR Details">
          {(() => {
            const f = files.find(x => x.upload_id === selectedItem.id)
            if (!f) return <div className="text-xs text-surface-400">File not found.</div>
            return (
              <div className="space-y-3">
                <DataRow label="Filename" value={f.original_filename} highlight />
                <DataRow label="Status" value={f.upload_status} />
                <DataRow label="Uploaded" value={new Date(f.uploaded_at).toLocaleString()} />
                <Button
                  size="sm" variant="danger" className="w-full mt-2"
                  icon={isDeletingFile ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => handleDeleteFile(f.upload_id)}
                  disabled={isDeletingFile}
                >
                  Delete CDR
                </Button>
              </div>
            )
          })()}
        </Section>
      )}

      {/* ── Time Range Filter ── */}
      <Section icon={<Clock className="h-4 w-4 text-primary-600" />} label="Time Range Filter">
        <div className="space-y-2">
          <div>
            <label className="text-2xs text-surface-400 block mb-1">Start</label>
            <input
              type="datetime-local"
              value={timeStart}
              onChange={(e) => setTimeStart(e.target.value)}
              className="w-full rounded-lg border border-surface-300 bg-white px-2.5 py-1.5 text-xs
                         dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200"
            />
          </div>
          <div>
            <label className="text-2xs text-surface-400 block mb-1">End</label>
            <input
              type="datetime-local"
              value={timeEnd}
              onChange={(e) => setTimeEnd(e.target.value)}
              className="w-full rounded-lg border border-surface-300 bg-white px-2.5 py-1.5 text-xs
                         dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" className="flex-1" onClick={applyTimeFilter}>
              Apply
            </Button>
            <Button size="sm" variant="secondary" className="flex-1" onClick={clearTimeFilter}>
              Clear
            </Button>
          </div>
          <p className="text-2xs text-surface-400">
            {fixes.length} fixes{timeStart || timeEnd ? ' in range' : ' total'}
          </p>
        </div>
      </Section>

      {/* ── Suspect Pin Pointer ── */}
      <Section icon={<Navigation className="h-4 w-4 text-primary-600" />} label="Suspect Pin Pointer">
        {activeFix ? (
          <div className="space-y-2">
            <DataRow label="Latitude" value={formatCoordinate(activeFix.latitude)} highlight />
            <DataRow label="Longitude" value={formatCoordinate(activeFix.longitude)} highlight />
            <DataRow label="Accuracy" value={formatAccuracy(activeFix.confidence_radius_meters)} />
            <DataRow label="GDOP" value={(activeFix.gdop ?? 0).toFixed(2)} />
            <DataRow label="RMS Residual" value={(activeFix.residual_rms ?? 0).toFixed(4)} />
            <DataRow label="Timestamp" value={formatDateTime(activeFix.timestamp)} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-6 text-xs text-surface-400">
            <WifiOff className="h-6 w-6 mb-2 text-surface-400" />
            <p className="font-medium text-surface-600 dark:text-surface-300">No localization fixes yet</p>
            <p className="text-2xs text-surface-400 mt-1 mb-3">Click "Run Multilateration Engine" to execute JPL trilateration + Kalman filtering over ingested frames.</p>
            <Button size="sm" variant="primary" icon={<PlayCircle className="h-3.5 w-3.5" />} onClick={handleRunLocalization} disabled={loading}>
              Run Engine
            </Button>
          </div>
        )}
      </Section>

      {/* ── Signal Parameters ── */}
      {activeFix && (activeFix.ta_inner_m != null || activeFix.rss_i_dbm != null) && (
        <Section icon={<Wifi className="h-4 w-4 text-primary-600" />} label="Signal Parameters">
          <div className="space-y-2">
            {activeFix.ta_inner_m != null && (
              <DataRow label="TA Inner" value={`${activeFix.ta_inner_m.toFixed(0)} m`} />
            )}
            {activeFix.ta_outer_m != null && (
              <DataRow label="TA Outer" value={`${activeFix.ta_outer_m.toFixed(0)} m`} />
            )}
            {activeFix.rss_i_dbm != null && (
              <DataRow label="RSSI" value={`${activeFix.rss_i_dbm.toFixed(1)} dBm`} />
            )}
          </div>
        </Section>
      )}

      {/* ── Location Evidence ── */}
      {activeFix && (
        <Section icon={<Share2 className="h-4 w-4 text-primary-600" />} label="Location Evidence">
          <div className="space-y-2">
            <DataRow label="Method" value={activeFix.localization_method || '3-Tower Multilateration'} />
            <DataRow label="Kalman Filtered" value={activeFix.kalman_applied ? 'Yes' : 'No'} />
            {activeFix.geocode && (
              <DataRow label="Resolved Area" value={activeFix.geocode} />
            )}
            {activeFix.measurement_constraints && activeFix.measurement_constraints.length > 0 && (
              <div className="mt-2 text-2xs text-surface-500 bg-surface-100 p-2 rounded-lg border border-surface-200 dark:bg-surface-800 dark:border-surface-700">
                <p className="font-semibold mb-1 text-surface-600 dark:text-surface-300">Constraints Applied:</p>
                <ul className="list-disc pl-3 space-y-1">
                  {activeFix.measurement_constraints.map((c, i) => (
                    <li key={i} className="break-all">{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── RF / SDR Ground Verification ── */}
      <Section icon={<Radio className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />} label="RF / SDR Ground Verification">
        {rfVerifiedFix ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between rounded-lg border border-cyan-200 bg-cyan-50/70 p-2.5 dark:border-cyan-800/60 dark:bg-cyan-950/30">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-600 text-white text-xs font-bold shadow-xs">✓</span>
                <div>
                  <p className="text-xs font-semibold text-cyan-900 dark:text-cyan-200">Target Verified</p>
                  <p className="text-[10px] text-cyan-700 dark:text-cyan-400">High precision field sweep</p>
                </div>
              </div>
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-2xs font-bold text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-300">
                ±{rfVerifiedFix.accuracy_m}m
              </span>
            </div>

            <div className="space-y-1.5">
              <DataRow label="Status" value="✓ Verified" highlight />
              <DataRow label="Peak RSSI" value={`${rfVerifiedFix.rssi_dbm} dBm`} />
              <DataRow label="Accuracy" value={`±${rfVerifiedFix.accuracy_m} meters`} highlight />
              <DataRow label="Confidence" value={`${rfVerifiedFix.confidence}%`} />
              <DataRow label="Source" value="Field SDR Sweep" />
              {rfVerifiedFix.filename && <DataRow label="Scan File" value={rfVerifiedFix.filename} />}
            </div>

            <Button
              size="sm"
              variant="primary"
              className="w-full mt-1.5 justify-center text-xs bg-cyan-600 hover:bg-cyan-700 text-white dark:bg-cyan-600 dark:hover:bg-cyan-700 cursor-pointer"
              onClick={() => setSdrFocusTrigger((v) => !v)}
            >
              <Crosshair className="h-3.5 w-3.5 mr-1.5" />
              Focus Verified Target (±5m)
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-surface-500 dark:text-surface-400">Status</span>
              <span className="font-medium text-surface-600 dark:text-surface-300">Not Verified</span>
            </div>
            <p className="text-2xs text-surface-400 leading-relaxed">
              Upload a field SDR/RF sweep log to narrow the multilateration region down to ±5 meter verified target.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-1 border-cyan-300 text-cyan-700 hover:bg-cyan-50 dark:border-cyan-800 dark:text-cyan-300 dark:hover:bg-cyan-950/40 text-xs justify-center cursor-pointer"
              onClick={() => setSdrModalOpen(true)}
            >
              <Radio className="h-3.5 w-3.5 mr-1.5 text-cyan-600 dark:text-cyan-400" />
              Upload SDR Scan
            </Button>
          </div>
        )}
      </Section>

      {/* ── Multi-SIM & Device Evasion Tactics ── */}
      {timelineSwapEvents.length > 0 && (
        <Section icon={<ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />} label="Evasion Tactics Detected">
          <div className="space-y-2">
            {timelineSwapEvents.map((evt, idx) => (
              <div
                key={evt.id || idx}
                onClick={() => { setScrubIdx(evt.fix_index ?? 0); setPlaying(false) }}
                className={cn(
                  "p-2.5 rounded-lg border text-xs cursor-pointer transition-all",
                  scrubValue === evt.fix_index
                    ? "border-amber-400 bg-amber-50 dark:bg-amber-950/40 ring-1 ring-amber-400/50"
                    : "border-surface-200 bg-white hover:bg-surface-50 dark:border-surface-700 dark:bg-surface-800 dark:hover:bg-surface-750"
                )}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 font-semibold text-surface-900 dark:text-surface-100">
                    {evt.event_type === 'device_swap' ? (
                      <Smartphone className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Radio className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                    )}
                    <span>{evt.event_type === 'device_swap' ? 'Device Handover' : 'SIM Card Swap'}</span>
                  </div>
                  <span className="text-2xs font-mono text-surface-400">
                    {formatDateTime(evt.timestamp)}
                  </span>
                </div>
                <p className="text-2xs text-surface-600 dark:text-surface-300 font-mono break-all">
                  {evt.event_type === 'device_swap'
                    ? (evt.old_imei && evt.new_imei ? `IMEI: ${evt.old_imei} → ${evt.new_imei}` : 'IMEI Swap Detected')
                    : (evt.old_imsi && evt.new_imsi ? `IMSI: ${evt.old_imsi} → ${evt.new_imsi}` : 'SIM Swap Detected')}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Investigation Metadata ── */}
      <Section icon={<Radio className="h-4 w-4 text-primary-600" />} label="Investigation Metadata">
        <div className="space-y-2">
          <DataRow label="Case ID" value={caseNumber} />
          <DataRow label="Officer" value={investigation?.created_by || 'Officer'} />
          <DataRow label="Computed Fixes" value={`${fixes.length} points`} highlight />
          <DataRow label="GeoJSON Features" value={geojson ? `${geojson.features.length} layers` : 'None'} />
        </div>
      </Section>

      {/* ── Export & Share ── */}
      <Section icon={<Download className="h-4 w-4 text-primary-600" />} label="Export & Share">
        <div className="space-y-2">
          <Button
            size="sm" variant="primary" className="w-full justify-start"
            icon={exporting === 'pdf' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            onClick={handleExportPDF}
            disabled={exporting !== null || fixes.length === 0}
          >
            Export PDF Report
          </Button>
          <Button
            size="sm" variant="secondary" className="w-full justify-start"
            icon={exporting === 'csv' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            onClick={handleExportCSV}
            disabled={exporting !== null || fixes.length === 0}
          >
            Export CSV
          </Button>
          <Button
            size="sm" variant="secondary" className="w-full justify-start"
            icon={exporting === 'kml' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Map className="h-3.5 w-3.5" />}
            onClick={handleExportKML}
            disabled={exporting !== null || fixes.length === 0}
          >
            Export KML (Google Earth)
          </Button>
          <div className="border-t border-surface-200 dark:border-surface-700 pt-2 mt-2">
            <Button
              size="sm" variant="secondary" className="w-full justify-start"
              icon={copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              onClick={handleGoogleMapsLink}
              disabled={!suspectGoogleMapsUrl}
            >
              {copied ? 'Link Copied!' : 'Copy Google Maps Link'}
            </Button>
            <Button
              size="sm" variant="secondary" className="w-full justify-start mt-1"
              icon={<Globe className="h-3.5 w-3.5" />}
              onClick={openGoogleMaps}
              disabled={!suspectGoogleMapsUrl}
            >
              Open in Google Maps
            </Button>
          </div>
        </div>
      </Section>
    </>
  )

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col -m-6 max-w-none overflow-hidden relative">

      {/* ── Topbar ── */}
      <div className="relative z-[1001] flex shrink-0 items-center justify-between border-b border-surface-200 bg-white px-3 sm:px-5 py-2.5 sm:py-3 dark:border-surface-700 dark:bg-surface-900">
        
        {/* Left: Back + Case Identity */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2">
          <button
            onClick={() => navigate(`/investigations/${id}`)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-700 dark:hover:text-surface-300 transition-colors shrink-0 cursor-pointer"
            aria-label="Back to investigation"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs sm:text-sm font-bold text-surface-900 dark:text-surface-100 truncate">
                {caseName}
              </span>
              <span className={cn('flex items-center gap-1 text-2xs sm:text-xs font-semibold shrink-0', TRACKING_STATUS_COLORS[fixes.length > 0 ? 'Live' : 'Idle'])}>
                {fixes.length > 0 && (
                  <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-ping-slow" />
                )}
                <span className="hidden xs:inline">{fixes.length > 0 ? 'Live Tracking' : 'Idle / Ingested'}</span>
              </span>
            </div>
            <p className="text-2xs sm:text-xs text-surface-500 dark:text-surface-400 truncate">
              {caseNumber} · {suspectName}
            </p>
          </div>
        </div>

        {/* Desktop Action Toolbar (hidden on mobile/tablet, visible on lg:) */}
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <button
            onClick={() => setAutoFollow((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              autoFollow
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300'
            )}
            title="Toggle auto-follow"
          >
            <Crosshair className="h-3.5 w-3.5" />
            {autoFollow ? 'Following' : 'Follow'}
          </button>

          <div className="flex items-center gap-1 rounded-lg bg-surface-100 p-1 dark:bg-surface-700">
            <button
              onClick={() => setMode('multilateration')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                mode === 'multilateration'
                  ? 'bg-white text-primary-700 shadow-sm dark:bg-surface-600 dark:text-primary-300'
                  : 'text-surface-600 hover:text-surface-900 dark:text-surface-300 dark:hover:text-surface-100'
              )}
            >
              Multilateration
            </button>
            <button
              onClick={() => { setMode('rtt'); loadRttObservations() }}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                mode === 'rtt'
                  ? 'bg-white text-primary-700 shadow-sm dark:bg-surface-600 dark:text-primary-300'
                  : 'text-surface-600 hover:text-surface-900 dark:text-surface-300 dark:hover:text-surface-100'
              )}
            >
              RTT / TA Rings
            </button>
          </div>

          <Button
            size="sm"
            variant="primary"
            icon={loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
            onClick={handleRunLocalization}
            disabled={loading}
          >
            {loading ? 'Running Engine…' : 'Run Multilateration Engine'}
          </Button>

          <Button size="sm" variant="secondary" icon={<Share2 className="h-3.5 w-3.5" />} onClick={() => setShareOpen(true)}>
            Share
          </Button>
        </div>

        {/* Mobile / Tablet Action Toolbar (visible below lg:) */}
        <div className="flex lg:hidden items-center gap-1.5 shrink-0" ref={mobileActionsRef}>
          <button
            onClick={() => setAutoFollow((v) => !v)}
            className={cn(
              'flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors cursor-pointer',
              autoFollow
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'border border-surface-200 bg-white text-surface-600 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300'
            )}
            title="Toggle auto-follow"
            aria-label="Toggle auto-follow"
          >
            <Crosshair className="h-4 w-4" />
            <span className="hidden sm:inline">{autoFollow ? 'Following' : 'Follow'}</span>
          </button>

          <Button
            size="sm"
            variant="primary"
            className="h-10 px-3 text-xs font-semibold"
            icon={loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            onClick={handleRunLocalization}
            disabled={loading}
          >
            <span>{loading ? 'Running…' : 'Run Engine'}</span>
          </Button>

          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setMobileActionsOpen((prev) => !prev)
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-600 hover:bg-surface-100 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700 transition-colors cursor-pointer"
              title="More actions"
              aria-label="More actions"
              aria-expanded={mobileActionsOpen}
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {mobileActionsOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-[1002] w-56 rounded-xl border border-surface-200 bg-white p-2 shadow-2xl dark:border-surface-700 dark:bg-surface-800 animate-fade-in">
                <div className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500">
                  Tracking Mode
                </div>
                <button
                  type="button"
                  onClick={() => { setMode('multilateration'); setMobileActionsOpen(false) }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer min-h-[40px]',
                    mode === 'multilateration'
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 font-semibold'
                      : 'text-surface-700 hover:bg-surface-100 dark:text-surface-200 dark:hover:bg-surface-700'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                    <span>Multilateration</span>
                  </div>
                  {mode === 'multilateration' && <Check className="h-4 w-4 text-primary-600 dark:text-primary-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('rtt'); loadRttObservations(); setMobileActionsOpen(false) }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer min-h-[40px]',
                    mode === 'rtt'
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 font-semibold'
                      : 'text-surface-700 hover:bg-surface-100 dark:text-surface-200 dark:hover:bg-surface-700'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                    <span>RTT / TA Rings</span>
                  </div>
                  {mode === 'rtt' && <Check className="h-4 w-4 text-primary-600 dark:text-primary-400" />}
                </button>

                <div className="my-1.5 border-t border-surface-100 dark:border-surface-700/60" />

                <button
                  type="button"
                  onClick={() => { setShareOpen(true); setMobileActionsOpen(false) }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium text-surface-700 hover:bg-surface-100 dark:text-surface-200 dark:hover:bg-surface-700 transition-colors cursor-pointer min-h-[40px]"
                >
                  <Share2 className="h-4 w-4 text-primary-500" />
                  <span>Share Location</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Multi-SIM / Device Handover Evasion Alert Banner ── */}
      <AnimatePresence>
        {activeSwapEvent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative z-[1000] shrink-0 border-b border-amber-400/40 bg-amber-50 dark:bg-amber-950/60 px-3 sm:px-5 py-2 text-amber-950 dark:text-amber-200 shadow-xs overflow-hidden"
          >
            <div className="flex items-center justify-between gap-2 max-w-full">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 ring-1 ring-amber-400/40">
                  {activeSwapEvent.event_type === 'device_swap' ? (
                    <Smartphone className="h-3.5 w-3.5" />
                  ) : (
                    <Radio className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-200/90 text-amber-900 dark:bg-amber-900/80 dark:text-amber-200 shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Evasion Tactic Detected
                  </span>
                  <span className="text-xs font-semibold truncate">
                    {activeSwapEvent.event_type === 'device_swap'
                      ? `Suspect changed device at ${formatEventTime(activeSwapEvent.timestamp)}`
                      : `Suspect changed SIM card at ${formatEventTime(activeSwapEvent.timestamp)}`}
                    {(activeSwapEvent.old_imei || activeSwapEvent.old_imsi) && (
                      <span className="hidden sm:inline font-mono font-normal text-2xs ml-1.5 text-amber-800/90 dark:text-amber-300/90">
                        ({activeSwapEvent.event_type === 'device_swap' ? `${activeSwapEvent.old_imei} → ${activeSwapEvent.new_imei}` : `${activeSwapEvent.old_imsi} → ${activeSwapEvent.new_imsi}`})
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <span className="text-2xs font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-700/50">
                  {activeSwapEvent.event_type === 'device_swap' ? 'IMEI Swap' : 'SIM Swap'}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Workspace ── */}
      <div ref={workspaceRef} className="flex flex-1 overflow-hidden relative w-full h-full">

        {/* LEFT: Explorer (Desktop only) */}
        <div className="hidden lg:block flex-shrink-0" style={{ width: explorerWidth, flexBasis: explorerWidth }}>
          <InvestigationExplorer 
            width={explorerWidth}
            currentCaseId={id}
            currentCaseName={caseName}
            files={files}
            towersCount={towers.length}
            framesCount={geojson?.features?.filter(f => f.geometry.type === 'Point' && f.properties?.type === 'measurement').length || 0}
            usableFramesCount={geojson?.features?.filter(f => f.geometry.type === 'Point' && f.properties?.type === 'measurement').length || 0}
            fixesCount={fixes.length}
            selectedItem={selectedItem}
            onSelectItem={(type, itemId) => setSelectedItem({ type, id: itemId })}
            onRunMultilateration={handleRunLocalization}
            isLocalizationRunning={loading}
            onExportClick={(type) => {
              if (type === 'pdf') handleExportPDF()
              if (type === 'csv') handleExportCSV()
              if (type === 'kml') handleExportKML()
            }}
            onUploadClick={() => navigate(`/investigations/${id}/upload`)}
            rfVerifiedFix={rfVerifiedFix}
            onUploadSDRClick={() => setSdrModalOpen(true)}
            onSelectVerifiedTarget={() => setSdrFocusTrigger((v) => !v)}
          />
        </div>

        {/* LEFT RESIZE HANDLE (Desktop only) */}
        <div
          onPointerDown={startExplorerResize}
          className="hidden lg:block w-2 bg-surface-200/50 hover:bg-primary-500/50 active:bg-primary-500 cursor-col-resize transition-colors z-30 flex-shrink-0"
        />

        {/* CENTER: Map (Takes full space on mobile, flex-1 on desktop) */}
        <div className="relative flex-1 min-w-0 h-full w-full">
          
          {/* Mobile floating toggle buttons for Explorer & Details */}
          <div className="absolute top-3 left-3 z-[990] flex lg:hidden items-center gap-2">
            <button
              onClick={() => setMobileExplorerOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-surface-200 bg-white/95 px-3.5 py-2 text-xs font-semibold text-surface-800 shadow-md backdrop-blur-sm hover:bg-surface-50 dark:border-surface-700 dark:bg-surface-800/95 dark:text-surface-100 dark:hover:bg-surface-700 transition-all active:scale-95 cursor-pointer min-h-[40px]"
              title="Open Workspace Explorer"
              aria-label="Open Workspace Explorer"
            >
              <FolderOpen className="h-4 w-4 text-primary-600 dark:text-primary-400 shrink-0" />
              <span>Explorer</span>
              {files.length > 0 && (
                <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                  {files.length}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setSelectedItem({ type: 'overview', id: null })
                setMobileDetailsOpen(true)
              }}
              className="flex items-center gap-2 rounded-xl border border-surface-200 bg-white/95 px-3.5 py-2 text-xs font-semibold text-surface-800 shadow-md backdrop-blur-sm hover:bg-surface-50 dark:border-surface-700 dark:bg-surface-800/95 dark:text-surface-100 dark:hover:bg-surface-700 transition-all active:scale-95 cursor-pointer min-h-[40px]"
              title="Open Investigation Details & Results"
              aria-label="Open Investigation Details & Results"
            >
              <SlidersHorizontal className="h-4 w-4 text-primary-600 dark:text-primary-400 shrink-0" />
              <span>Details</span>
              {fixes.length > 0 && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                  {fixes.length}
                </span>
              )}
            </button>
          </div>

          {initialLoading ? (
            <div className="flex h-full flex-col items-center justify-center bg-surface-100 dark:bg-surface-950">
              <RefreshCw className="h-8 w-8 text-primary-500 animate-spin mb-2" />
              <p className="text-sm text-surface-600 dark:text-surface-300">Loading geospatial layers...</p>
            </div>
          ) : (
            <ErrorBoundary>
              <InvestigationMap
                currentLocation={activeFix ? {
                  latitude: activeFix.latitude,
                  longitude: activeFix.longitude,
                  raw_latitude: activeFix.latitude,
                  raw_longitude: activeFix.longitude,
                  velocity_m_s: Math.sqrt(
                    (activeFix.velocity_east ?? 0) ** 2 + (activeFix.velocity_north ?? 0) ** 2
                  ),
                  clock_bias_meters: 0,
                  residual_rms: activeFix.residual_rms ?? 0,
                  gdop: activeFix.gdop ?? 0,
                  adaptive_R_scale: 1,
                  adaptive_Q_scale: 1,
                  geojson_heatmap: null,
                  timestamp: activeFix.timestamp,
                  accuracy_meters: activeFix.confidence_radius_meters,
                  algorithm_used: 'Multilateration',
                  confidence: 0.95,
                  geocode: activeFix.geocode,
                } : undefined}
                pathPoints={pathPoints}
                towers={towers}
                onCenterRequest={() => setCenterTrigger((v) => !v)}
                centerTrigger={centerTrigger}
                autoFollow={autoFollow && fixes.length > 0}
                geojson={geojson ?? undefined}
                kdeHeatPoints={mode === 'multilateration' ? kdeHeatPoints : undefined}
                rttObservations={mode === 'rtt' ? rttObservations : undefined}
                rfVerifiedFix={rfVerifiedFix}
                sdrFocusTrigger={sdrFocusTrigger}
              />
            </ErrorBoundary>
          )}

          {/* Timeline / Playback bar */}
          {fixes.length > 0 && (
            <div className="absolute bottom-16 lg:bottom-4 left-1/2 z-[980] w-[min(520px,calc(100%-1.5rem))] -translate-x-1/2 rounded-xl border border-surface-200 bg-white/95 px-3 py-2 sm:px-4 sm:py-3 shadow-lg backdrop-blur-sm dark:border-surface-700 dark:bg-surface-900/95">
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={() => { setPlaying((v) => !v); setScrubIdx((i) => i ?? 0) }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white hover:bg-primary-700 transition-colors cursor-pointer"
                  aria-label={playing ? 'Pause playback' : 'Play playback'}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                </button>

                <div className="relative flex-1 min-w-0 flex flex-col justify-center">
                  {/* Event Markers above the slider track */}
                  {timelineSwapEvents.length > 0 && (
                    <div className="relative h-3.5 w-full mb-0.5">
                      {timelineSwapEvents.map((evt, idx) => {
                        const targetIdx = evt.fix_index ?? 0
                        const percent = maxScrub > 0 ? (targetIdx / maxScrub) * 100 : 0
                        const isSelected = scrubValue === targetIdx
                        const tooltipText = evt.event_type === 'device_swap'
                          ? (evt.old_imei && evt.new_imei ? `IMEI Swap Detected: ${evt.old_imei} → ${evt.new_imei}` : 'IMEI Swap Detected')
                          : (evt.old_imsi && evt.new_imsi ? `SIM Swap Detected: ${evt.old_imsi} → ${evt.new_imsi}` : 'SIM Swap Detected')

                        return (
                          <button
                            key={evt.id || idx}
                            type="button"
                            onClick={() => { setScrubIdx(targetIdx); setPlaying(false) }}
                            title={tooltipText}
                            aria-label={tooltipText}
                            style={{ left: `${percent}%` }}
                            className={cn(
                              "absolute -translate-x-1/2 top-0 flex items-center justify-center h-3.5 w-3.5 rounded-full border shadow-xs transition-transform cursor-pointer hover:scale-125",
                              isSelected
                                ? "ring-2 ring-amber-500 scale-125 z-10"
                                : "",
                              evt.event_type === 'device_swap'
                                ? "bg-amber-100 border-amber-400 text-amber-700 dark:bg-amber-950 dark:border-amber-500 dark:text-amber-300"
                                : "bg-orange-100 border-orange-400 text-orange-700 dark:bg-orange-950 dark:border-orange-500 dark:text-orange-300"
                            )}
                          >
                            {evt.event_type === 'device_swap' ? (
                              <Smartphone className="h-2 w-2" />
                            ) : (
                              <Radio className="h-2 w-2" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <input
                    type="range"
                    min={0}
                    max={maxScrub}
                    value={scrubValue}
                    disabled={fixes.length < 2}
                    onChange={(e) => { setScrubIdx(Number(e.target.value)); setPlaying(false) }}
                    className="w-full accent-primary-600 min-w-0 h-2 cursor-pointer"
                    aria-label="Timeline playback position"
                  />
                </div>

                <span className="shrink-0 text-xs text-surface-600 dark:text-surface-300 font-mono font-medium">
                  {scrubIdx != null ? scrubIdx + 1 : fixes.length}/{fixes.length}
                </span>
              </div>
              {activeFix && (
                <div className="mt-1 sm:mt-2 flex items-center justify-between gap-2 text-2xs text-surface-500 dark:text-surface-400">
                  <span className="truncate">
                    {formatDateTime(activeFix.timestamp)}
                    {activeFix.geocode && activeFix.geocode !== 'Unknown area' && (
                      <span className="text-blue-600 dark:text-blue-300 font-medium"> · {activeFix.geocode}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono font-semibold">±{activeFix.confidence_radius_meters.toFixed(0)}m</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT RESIZE HANDLE (Desktop only) */}
        <div
          onPointerDown={startRightPanelResize}
          className="hidden lg:block w-1 cursor-col-resize hover:bg-primary-500 active:bg-primary-500 z-30"
        />

        {/* RIGHT: Detail panel (Desktop only) */}
        <div 
          className="hidden lg:flex flex-shrink-0 flex-col overflow-y-auto border-l border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-900"
          style={{ width: rightPanelWidth, flexBasis: rightPanelWidth }}
        >
          {renderDetailsContent()}
        </div>
      </div>

      {/* ── Mobile Collapsed Bottom Sheet Bar ── */}
      <div
        onClick={() => setMobileDetailsOpen(true)}
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between border-t border-surface-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-md dark:border-surface-700 dark:bg-surface-900/95 cursor-pointer active:bg-surface-100 dark:active:bg-surface-800 transition-colors lg:hidden min-h-[48px]"
        role="button"
        tabIndex={0}
        aria-label="Expand Results and Details"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
            <SlidersHorizontal className="h-4 w-4" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-surface-800 dark:text-surface-200">
            Results & Details
          </span>
          {fixes.length > 0 ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {fixes.length} Fixes
            </span>
          ) : (
            <span className="rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-medium text-surface-500 dark:bg-surface-800 dark:text-surface-400">
              Idle
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400">
          <span>Expand</span>
          <ChevronUp className="h-4 w-4 animate-bounce" />
        </div>
      </div>

      {/* Mobile Explorer Drawer Portal (Mounted to document.body to guarantee stacking above Leaflet map) */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {mobileExplorerOpen && (
            <div className="fixed inset-0 z-[9999] lg:hidden">
              {/* Backdrop */}
              <motion.div
                className="fixed inset-0 bg-black/60 backdrop-blur-xs"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setMobileExplorerOpen(false)}
                aria-hidden="true"
              />

              {/* Drawer Panel */}
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Workspace Explorer"
                className="fixed inset-y-0 left-0 z-[10000] flex h-full w-[88vw] max-w-[340px] flex-col bg-surface-50 shadow-2xl dark:bg-surface-900 border-r border-surface-200 dark:border-surface-700"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
              >
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-surface-200 px-4 py-3 bg-white dark:border-surface-700 dark:bg-surface-800">
                  <span className="text-xs font-bold uppercase tracking-wider text-surface-700 dark:text-surface-200">
                    Workspace Explorer
                  </span>
                  <button
                    onClick={() => setMobileExplorerOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-700 dark:hover:text-surface-300 transition-colors cursor-pointer"
                    aria-label="Close explorer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Tree Body */}
                <div className="flex-1 overflow-hidden">
                  <InvestigationExplorer
                    currentCaseId={id}
                    currentCaseName={caseName}
                    files={files}
                    towersCount={towers.length}
                    framesCount={geojson?.features?.filter(f => f.geometry.type === 'Point' && f.properties?.type === 'measurement').length || 0}
                    usableFramesCount={geojson?.features?.filter(f => f.geometry.type === 'Point' && f.properties?.type === 'measurement').length || 0}
                    fixesCount={fixes.length}
                    selectedItem={selectedItem}
                    onSelectItem={(type, itemId) => {
                      setSelectedItem({ type, id: itemId })
                      setMobileExplorerOpen(false)
                      setMobileDetailsOpen(true)
                    }}
                    onRunMultilateration={() => {
                      handleRunLocalization()
                      setMobileExplorerOpen(false)
                    }}
                    isLocalizationRunning={loading}
                    onExportClick={(type) => {
                      if (type === 'pdf') handleExportPDF()
                      if (type === 'csv') handleExportCSV()
                      if (type === 'kml') handleExportKML()
                    }}
                    onUploadClick={() => {
                      navigate(`/investigations/${id}/upload`)
                      setMobileExplorerOpen(false)
                    }}
                    rfVerifiedFix={rfVerifiedFix}
                    onUploadSDRClick={() => {
                      setSdrModalOpen(true)
                      setMobileExplorerOpen(false)
                    }}
                    onSelectVerifiedTarget={() => {
                      setSdrFocusTrigger((v) => !v)
                      setMobileExplorerOpen(false)
                    }}
                  />
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Mobile Details Bottom Sheet Portal (Mounted to document.body) */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {mobileDetailsOpen && (
            <div className="fixed inset-0 z-[9999] flex flex-col justify-end lg:hidden">
              {/* Backdrop */}
              <motion.div
                className="fixed inset-0 bg-black/60 backdrop-blur-xs"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setMobileDetailsOpen(false)}
                aria-hidden="true"
              />

              {/* Bottom Sheet Container */}
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Investigation Details and Results"
                className="relative z-[10000] flex max-h-[82vh] w-full flex-col rounded-t-2xl border-t border-surface-200 bg-surface-50 shadow-2xl dark:border-surface-700 dark:bg-surface-900"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
              >
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-surface-200 px-4 py-3 bg-white dark:border-surface-700 dark:bg-surface-800 rounded-t-2xl">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                      <SlidersHorizontal className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-surface-900 dark:text-surface-100">
                        Results & Details
                      </span>
                      <p className="text-[10px] text-surface-400">
                        {fixes.length} fixes generated · {caseNumber}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setMobileDetailsOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-700 dark:hover:text-surface-300 transition-colors cursor-pointer"
                    aria-label="Collapse details"
                  >
                    <ChevronDown className="h-5 w-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto pb-8">
                  {renderDetailsContent()}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <ShareLocationModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        latitude={currentSuspectLocation?.latitude ?? null}
        longitude={currentSuspectLocation?.longitude ?? null}
        loading={loading}
      />

      <SDRUploadModal
        isOpen={sdrModalOpen}
        onClose={() => setSdrModalOpen(false)}
        currentSuspectLat={activeFix?.latitude ?? fixes[0]?.latitude}
        currentSuspectLon={activeFix?.longitude ?? fixes[0]?.longitude}
        currentTimestamp={activeFix?.timestamp ?? fixes[0]?.timestamp}
        onVerificationComplete={(fix) => {
          setRfVerifiedFix(fix)
          setSdrFocusTrigger((v) => !v)
        }}
      />
    </div>
  )
}

function Section({
  icon, label, children,
}: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-surface-200 dark:border-surface-700 p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <span className="text-2xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}

function DataRow({ label, value, highlight, dim }: {
  label: string; value: string; highlight?: boolean; dim?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-2xs text-surface-400">{label}</span>
      <span className={cn(
        'text-right text-xs font-medium',
        highlight ? 'text-primary-600 dark:text-primary-400 font-bold' :
          dim ? 'text-surface-400' :
            'text-surface-700 dark:text-surface-300'
      )}>
        {value}
      </span>
    </div>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Share2, Download, FileText, Map, Globe,
  Navigation, Radio, Wifi, WifiOff, Clock,
  ArrowLeft, Crosshair, PlayCircle, RefreshCw, AlertCircle,
  Copy, Check, Play, Pause, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { InvestigationMap } from '@/components/map/InvestigationMap'
import { ShareLocationModal } from '@/components/investigation/ShareLocationModal'
import {
  formatCoordinate, formatDateTime, formatAccuracy,
  downloadBlob, extractErrorMessage, cn,
} from '@/utils'
import { TRACKING_STATUS_COLORS, DEFAULT_MAP_CENTER } from '@/constants'
import { investigationApi, trackingApi, exportApi, fileApi } from '@/services/api'
import type { GeoJSONFeatureCollection, Investigation, TowerRecord, RttObservation, CaseFile } from '@/types'
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
    }))
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

    if (data.towerData.towers.length > 0) {
      setTowers(data.towerData.towers.map((t) => ({
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
      })))
    }
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

  const mapsCenter = () => {
    if (fixes.length === 0) return null
    return fixes.length === 1
      ? { lat: fixes[0].latitude, lng: fixes[0].longitude }
      : {
        lat: fixes.reduce((s, f) => s + f.latitude, 0) / fixes.length,
        lng: fixes.reduce((s, f) => s + f.longitude, 0) / fixes.length,
      }
  }

  const googleMapsLink = () => {
    const c = mapsCenter()
    return c ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}` : null
  }

  const handleGoogleMapsLink = () => {
    const url = googleMapsLink()
    if (!url) return
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const openGoogleMaps = () => {
    const url = googleMapsLink()
    if (url) window.open(url, '_blank')
  }

  const latestFix = fixes.length > 0 ? fixes[fixes.length - 1] : null

  // ── Timeline playback scrubber ──
  const [scrubIdx, setScrubIdx] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const activeFix = scrubIdx != null && fixes[scrubIdx] ? fixes[scrubIdx] : latestFix

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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col -m-6">

      {/* ── Topbar ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-surface-200
                      bg-white px-5 py-3 dark:border-surface-700 dark:bg-surface-900">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/investigations/${id}`)}
            className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100
                       hover:text-surface-700 dark:hover:bg-surface-700 dark:hover:text-surface-300 transition-colors"
            aria-label="Back to investigation"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                {caseName}
              </span>
              <span className={cn('flex items-center gap-1.5 text-xs font-medium', TRACKING_STATUS_COLORS[fixes.length > 0 ? 'Live' : 'Idle'])}>
                {fixes.length > 0 && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-ping-slow" />
                )}
                {fixes.length > 0 ? 'Multilateration Active' : 'Idle / Ingested'}
              </span>
            </div>
            <p className="text-xs text-surface-400">
              {caseNumber} · {suspectName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
      </div>

      {/* ── Main split ── */}
      <div ref={workspaceRef} className="flex flex-1 overflow-hidden">

        {/* LEFT: Explorer */}
        <div className="flex-shrink-0" style={{ width: explorerWidth, flexBasis: explorerWidth }}>
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
            onSelectItem={(type, id) => setSelectedItem({ type, id })}
            onRunMultilateration={handleRunLocalization}
            isLocalizationRunning={loading}
            onExportClick={(type) => {
              if (type === 'pdf') handleExportPDF()
              if (type === 'csv') handleExportCSV()
              if (type === 'kml') handleExportKML()
            }}
          />
        </div>

        {/* LEFT RESIZE HANDLE */}
        <div
          onPointerDown={startExplorerResize}
          className="w-2 bg-surface-200/50 hover:bg-primary-500/50 active:bg-primary-500 cursor-col-resize transition-colors z-[9999] flex-shrink-0"
        />

        {/* CENTER: Map */}
        <div className="relative flex-1 min-w-0" style={{ minWidth: 400 }}>
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
              />
            </ErrorBoundary>
          )}
          {fixes.length > 0 && (
            <div className="absolute bottom-4 left-1/2 z-[1000] w-[min(520px,90%)] -translate-x-1/2 rounded-xl border border-surface-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm dark:border-surface-700 dark:bg-surface-900/95">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setPlaying((v) => !v); setScrubIdx((i) => i ?? 0) }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                  aria-label={playing ? 'Pause playback' : 'Play playback'}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={maxScrub}
                  value={scrubValue}
                  disabled={fixes.length < 2}
                  onChange={(e) => { setScrubIdx(Number(e.target.value)); setPlaying(false) }}
                  className="flex-1 accent-primary-600"
                  aria-label="Timeline playback position"
                />
                <span className="shrink-0 text-2xs text-surface-500 dark:text-surface-400">
                  {scrubIdx != null ? scrubIdx + 1 : fixes.length}/{fixes.length}
                </span>
              </div>
              {activeFix && (
                <div className="mt-2 flex items-center justify-between gap-3 text-2xs text-surface-500 dark:text-surface-400">
                  <span className="truncate">
                    {formatDateTime(activeFix.timestamp)}
                    {activeFix.geocode && activeFix.geocode !== 'Unknown area' && (
                      <span className="text-blue-600 dark:text-blue-300 font-medium"> · around {activeFix.geocode}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono">±{activeFix.confidence_radius_meters.toFixed(0)}m</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div
          onPointerDown={startRightPanelResize}
          className="w-1 cursor-col-resize hover:bg-primary-500 active:bg-primary-500 z-[9999]"
        />

        {/* RIGHT: Detail panel */}
        <div 
          className="flex shrink-0 flex-col overflow-y-auto border-l border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-900"
          style={{ width: rightPanelWidth, flexBasis: rightPanelWidth }}
        >

          {error && (
            <div className="border-b border-danger/20 bg-danger-light px-4 py-3 text-xs text-danger dark:bg-danger/10 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-danger" />
              <div>
                <p className="font-semibold">Localization Status</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

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
            {latestFix ? (
              <div className="space-y-2">
                <DataRow label="Latitude" value={formatCoordinate(latestFix.latitude)} highlight />
                <DataRow label="Longitude" value={formatCoordinate(latestFix.longitude)} highlight />
                <DataRow label="Accuracy" value={formatAccuracy(latestFix.confidence_radius_meters)} />
                <DataRow label="GDOP" value={(latestFix.gdop ?? 0).toFixed(2)} />
                <DataRow label="RMS Residual" value={(latestFix.residual_rms ?? 0).toFixed(4)} />
                <DataRow label="Timestamp" value={formatDateTime(latestFix.timestamp)} />
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
          {latestFix && (latestFix.ta_inner_m != null || latestFix.rss_i_dbm != null) && (
            <Section icon={<Wifi className="h-4 w-4 text-primary-600" />} label="Signal Parameters">
              <div className="space-y-2">
                {latestFix.ta_inner_m != null && (
                  <DataRow label="TA Inner" value={`${latestFix.ta_inner_m.toFixed(0)} m`} />
                )}
                {latestFix.ta_outer_m != null && (
                  <DataRow label="TA Outer" value={`${latestFix.ta_outer_m.toFixed(0)} m`} />
                )}
                {latestFix.rss_i_dbm != null && (
                  <DataRow label="RSSI" value={`${latestFix.rss_i_dbm.toFixed(1)} dBm`} />
                )}
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
                  disabled={fixes.length === 0}
                >
                  {copied ? 'Link Copied!' : 'Copy Google Maps Link'}
                </Button>
                <Button
                  size="sm" variant="secondary" className="w-full justify-start mt-1"
                  icon={<Globe className="h-3.5 w-3.5" />}
                  onClick={openGoogleMaps}
                  disabled={fixes.length === 0}
                >
                  Open in Google Maps
                </Button>
              </div>
            </div>
          </Section>

        </div>
      </div>

      <ShareLocationModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        latitude={latestFix?.latitude ?? DEFAULT_MAP_CENTER[0]}
        longitude={latestFix?.longitude ?? DEFAULT_MAP_CENTER[1]}
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

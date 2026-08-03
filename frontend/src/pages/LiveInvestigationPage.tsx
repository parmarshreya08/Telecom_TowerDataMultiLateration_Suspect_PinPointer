import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Share2, Download,
  Navigation, Radio, Wifi, WifiOff, Clock,
  ArrowLeft, Crosshair, PlayCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { InvestigationMap } from '@/components/map/InvestigationMap'
import { InvestigationTimeline } from '@/components/investigation/InvestigationTimeline'
import { ShareLocationModal } from '@/components/investigation/ShareLocationModal'
import { MOCK_INVESTIGATIONS } from '@/mock/investigations'
import { MOCK_PATH_POINTS, MOCK_TOWERS } from '@/mock/tracking'
import {
  formatCoordinate, formatDateTime, formatAccuracy,
  cn,
} from '@/utils'
import { TRACKING_STATUS_COLORS } from '@/constants'
import { trackingApi } from '@/services/api'
import type { LocalizationFix, GeoJSONFeatureCollection } from '@/types'

export default function LiveInvestigationPage() {
  const { id = 'inv-001' } = useParams()
  const navigate = useNavigate()
  const investigation = MOCK_INVESTIGATIONS.find((i) => i.id === id) ?? MOCK_INVESTIGATIONS[0]

  const [fixes, setFixes] = useState<LocalizationFix[]>([])
  const [geojson, setGeojson] = useState<GeoJSONFeatureCollection | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [centerTrigger, setCenterTrigger] = useState(false)
  const [autoFollow, setAutoFollow] = useState(true)

  const loadGeoJSON = useCallback(async () => {
    try {
      const data = await trackingApi.getGeoJSON(id)
      setGeojson(data)
    } catch {
      // No cached data yet
    }
  }, [id])

  useEffect(() => {
    loadGeoJSON()
  }, [loadGeoJSON])

  const handleRunLocalization = async () => {
    setLoading(true)
    setError(null)
    try {
      await trackingApi.runLocalization(id)
      setFixes([])
      await loadGeoJSON()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Localization failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const latestFix = fixes.length > 0 ? fixes[fixes.length - 1] : null

  const pathPoints = fixes.length > 0
    ? fixes.map((f) => ({
        latitude: f.latitude,
        longitude: f.longitude,
        timestamp: f.timestamp,
        accuracy_meters: f.confidence_radius_meters,
        algorithm: 'Kalman' as const,
      }))
    : MOCK_PATH_POINTS

  const towers = MOCK_TOWERS

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col -m-6">

      {/* ── Topbar ─────────────────────────────────────────── */}
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
                {investigation.case_name}
              </span>
              <span className={cn('flex items-center gap-1.5 text-xs font-medium', TRACKING_STATUS_COLORS['Idle'])}>
                {fixes.length > 0 && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-ping-slow" />
                )}
                {fixes.length > 0 ? 'live' : 'idle'}
              </span>
            </div>
            <p className="text-xs text-surface-400">
              {investigation.case_number} · {investigation.suspect_name}
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

          <Button
            size="sm"
            variant="primary"
            icon={loading ? undefined : <PlayCircle className="h-3.5 w-3.5" />}
            onClick={handleRunLocalization}
            disabled={loading}
          >
            {loading ? 'Running…' : 'Run Localization'}
          </Button>

          <Button size="sm" variant="secondary" icon={<Share2 className="h-3.5 w-3.5" />} onClick={() => setShareOpen(true)}>
            Share
          </Button>
          <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={() => navigate('/reports')}>
            Export
          </Button>
        </div>
      </div>

      {/* ── Main split ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Map — 70% */}
        <div className="relative flex-1 min-w-0">
          <InvestigationMap
            currentLocation={latestFix ? {
              latitude: latestFix.latitude,
              longitude: latestFix.longitude,
              raw_latitude: latestFix.latitude,
              raw_longitude: latestFix.longitude,
              velocity_m_s: Math.sqrt(
                (latestFix.velocity_east ?? 0) ** 2 + (latestFix.velocity_north ?? 0) ** 2
              ),
              clock_bias_meters: 0,
              residual_rms: latestFix.residual_rms ?? 0,
              gdop: latestFix.gdop ?? 0,
              adaptive_R_scale: 1,
              adaptive_Q_scale: 1,
              geojson_heatmap: null,
              timestamp: latestFix.timestamp,
              accuracy_meters: latestFix.confidence_radius_meters,
              algorithm_used: 'Kalman',
              confidence: 0.95,
            } : undefined}
            pathPoints={pathPoints}
            towers={towers}
            onCenterRequest={() => setCenterTrigger((v) => !v)}
            centerTrigger={centerTrigger}
            autoFollow={autoFollow && fixes.length > 0}
            geojson={geojson ?? undefined}
          />
        </div>

        {/* RIGHT: Detail panel — 30% / 320px */}
        <div className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-surface-200
                        bg-surface-50 dark:border-surface-700 dark:bg-surface-900 scrollbar-thin">

          {error && (
            <div className="border-b border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger dark:bg-danger/10">
              {error}
            </div>
          )}

          {/* ── Location block ── */}
          <Section icon={<Navigation className="h-4 w-4 text-primary-600" />} label="Current Location">
            {latestFix ? (
              <div className="space-y-2">
                <DataRow label="Latitude" value={formatCoordinate(latestFix.latitude)} />
                <DataRow label="Longitude" value={formatCoordinate(latestFix.longitude)} />
                <DataRow label="Accuracy" value={formatAccuracy(latestFix.confidence_radius_meters)} />
                <DataRow label="GDOP" value={(latestFix.gdop ?? 0).toFixed(2)} />
                <DataRow label="Residual" value={(latestFix.residual_rms ?? 0).toFixed(4)} />
                <DataRow label="Timestamp" value={formatDateTime(latestFix.timestamp)} />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-surface-400 py-2">
                <WifiOff className="h-4 w-4" />
                <span>Click "Run Localization" to start</span>
              </div>
            )}
          </Section>

          {/* ── TA Band / Signal block ── */}
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

          {/* ── Investigation block ── */}
          <Section icon={<Radio className="h-4 w-4 text-primary-600" />} label="Investigation">
            <div className="space-y-2">
              <DataRow label="Case ID" value={investigation.case_number} />
              <DataRow label="Officer" value={investigation.created_by} />
              <DataRow label="Status" value={investigation.status} />
              {latestFix && <DataRow label="Fixes" value={`${fixes.length} points`} highlight />}
            </div>
          </Section>

          {/* ── Timeline ── */}
          <Section icon={<Clock className="h-4 w-4 text-primary-600" />} label="Timeline">
            <InvestigationTimeline events={investigation.timeline} compact />
          </Section>

        </div>
      </div>

      <ShareLocationModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        latitude={latestFix?.latitude ?? MOCK_PATH_POINTS[0].latitude}
        longitude={latestFix?.longitude ?? MOCK_PATH_POINTS[0].longitude}
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
        highlight ? 'text-primary-600 dark:text-primary-400' :
        dim       ? 'text-surface-400'                       :
        'text-surface-700 dark:text-surface-300'
      )}>
        {value}
      </span>
    </div>
  )
}

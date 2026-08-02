import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Pause, Play, Share2, Download,
  Navigation, Radio, Wifi, WifiOff, Clock,
  ArrowLeft, Crosshair,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { InvestigationMap } from '@/components/map/InvestigationMap'
import { AlgorithmResultCard } from '@/components/investigation/AlgorithmResultCard'
import { InvestigationTimeline } from '@/components/investigation/InvestigationTimeline'
import { ShareLocationModal } from '@/components/investigation/ShareLocationModal'
import { useRealtimeTracking } from '@/hooks/useRealtimeTracking'
import { MOCK_INVESTIGATIONS } from '@/mock/investigations'
import { MOCK_PATH_POINTS, MOCK_TOWERS } from '@/mock/tracking'
import {
  formatCoordinate, formatDateTime, formatAccuracy,
  formatSpeed, formatTimeAgo, cn,
} from '@/utils'
import { TRACKING_STATUS_COLORS } from '@/constants'

export default function LiveInvestigationPage() {
  const { id = 'inv-001' } = useParams()
  const navigate = useNavigate()
  const investigation = MOCK_INVESTIGATIONS.find((i) => i.id === id) ?? MOCK_INVESTIGATIONS[0]

  const {
    currentLocation, path, algorithmResults,
    trackingStatus, startTracking, pauseTracking, resumeTracking, isLive,
  } = useRealtimeTracking(id)

  const [shareOpen,   setShareOpen]   = useState(false)
  const [centerTrigger, setCenterTrigger] = useState(false)
  const [autoFollow,  setAutoFollow]  = useState(true)

  // Auto-start on mount
  useEffect(() => {
    startTracking({ duration: '1h' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loc         = currentLocation
  const pathPoints  = path.length > 0 ? path : MOCK_PATH_POINTS
  const towers      = MOCK_TOWERS

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
              <span className={cn('flex items-center gap-1.5 text-xs font-medium', TRACKING_STATUS_COLORS[trackingStatus])}>
                {isLive && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-ping-slow" />
                )}
                {trackingStatus}
              </span>
            </div>
            <p className="text-xs text-surface-400">
              {investigation.case_number} · {investigation.suspect_name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-follow toggle */}
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

          {isLive ? (
            <Button size="sm" variant="secondary" icon={<Pause className="h-3.5 w-3.5" />} onClick={pauseTracking}>
              Pause
            </Button>
          ) : (
            <Button size="sm" variant="primary" icon={<Play className="h-3.5 w-3.5" />} onClick={resumeTracking}>
              Resume
            </Button>
          )}

          <Button size="sm" variant="secondary" icon={<Share2   className="h-3.5 w-3.5" />} onClick={() => setShareOpen(true)}>
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
            currentLocation={loc ?? undefined}
            pathPoints={pathPoints}
            towers={towers}
            onCenterRequest={() => setCenterTrigger((v) => !v)}
            centerTrigger={centerTrigger}
            autoFollow={autoFollow && isLive}
          />
        </div>

        {/* RIGHT: Detail panel — 30% / 320px */}
        <div className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-surface-200
                        bg-surface-50 dark:border-surface-700 dark:bg-surface-900 scrollbar-thin">

          {/* ── Location block ── */}
          <Section icon={<Navigation className="h-4 w-4 text-primary-600" />} label="Current Location">
            {loc ? (
              <div className="space-y-2">
                <DataRow label="Latitude"      value={formatCoordinate(loc.latitude)} />
                <DataRow label="Longitude"     value={formatCoordinate(loc.longitude)} />
                <DataRow label="Raw Latitude"  value={formatCoordinate(loc.raw_latitude)}  dim />
                <DataRow label="Raw Longitude" value={formatCoordinate(loc.raw_longitude)} dim />
                <DataRow label="Accuracy"      value={formatAccuracy(loc.accuracy_meters)} />
                <DataRow label="Speed"         value={formatSpeed(loc.velocity_m_s)} />
                <DataRow label="Heading"       value={loc.heading_degrees != null ? `${loc.heading_degrees}°` : '—'} />
                <DataRow label="Algorithm"     value={loc.algorithm_used}   highlight />
                <DataRow label="Confidence"    value={`${(loc.confidence * 100).toFixed(1)}%`} />
                <DataRow label="Timestamp"     value={formatDateTime(loc.timestamp)} />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-surface-400 py-2">
                <WifiOff className="h-4 w-4" />
                <span>Awaiting location data…</span>
              </div>
            )}
          </Section>

          {/* ── Investigation block ── */}
          <Section icon={<Radio className="h-4 w-4 text-primary-600" />} label="Investigation">
            <div className="space-y-2">
              <DataRow label="Case ID"        value={investigation.case_number} />
              <DataRow label="Officer"        value={investigation.created_by} />
              <DataRow label="Status"         value={investigation.status} />
              <DataRow label="Tracking"       value={trackingStatus} highlight />
              {loc && <DataRow label="Last Updated" value={formatTimeAgo(loc.timestamp)} />}
            </div>
          </Section>

          {/* ── Network / Algo Params ── */}
          {loc && (
            <Section icon={<Wifi className="h-4 w-4 text-primary-600" />} label="Signal Parameters">
              <div className="space-y-2">
                <DataRow label="GDOP"         value={loc.gdop.toFixed(2)} />
                <DataRow label="Residual RMS" value={loc.residual_rms.toFixed(4)} />
                <DataRow label="Clock Bias"   value={`${loc.clock_bias_meters.toFixed(1)} m`} />
                <DataRow label="Adaptive R"   value={loc.adaptive_R_scale.toFixed(3)} dim />
                <DataRow label="Adaptive Q"   value={loc.adaptive_Q_scale.toFixed(3)} dim />
              </div>
            </Section>
          )}

          {/* ── Algorithm Results ── */}
          {algorithmResults.length > 0 && (
            <Section label="Algorithm Results">
              <div className="space-y-2.5">
                {algorithmResults.map((r) => (
                  <AlgorithmResultCard key={r.algorithm} result={r} />
                ))}
              </div>
            </Section>
          )}

          {/* ── Timeline ── */}
          <Section icon={<Clock className="h-4 w-4 text-primary-600" />} label="Timeline">
            <InvestigationTimeline events={investigation.timeline} compact />
          </Section>

        </div>
      </div>

      {/* Share modal */}
      <ShareLocationModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        latitude={loc?.latitude   ?? MOCK_PATH_POINTS[0].latitude}
        longitude={loc?.longitude ?? MOCK_PATH_POINTS[0].longitude}
      />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

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

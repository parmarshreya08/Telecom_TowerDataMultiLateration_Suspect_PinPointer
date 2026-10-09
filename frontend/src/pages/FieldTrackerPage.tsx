import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  Loader2,
  Navigation,
  AlertTriangle,
  Radio,
  Clock,
  MapPin,
  Compass,
  Phone,
  Crosshair,
  Shield,
  Layers,
  Check,
  Copy,
  Activity,
  Maximize2
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { liveTrackingApi } from '@/services/api'
import { DEFAULT_MAP_CENTER, WS_BASE_URL } from '@/constants'
import 'leaflet/dist/leaflet.css'
import { useMapTheme } from '@/hooks/useMapTheme'
import { MapThemeSwitcher } from '@/components/map/MapThemeSwitcher'
import { formatTimeAgo, copyToClipboard } from '@/utils'

interface LocationUpdate {
  lat: number
  lng: number
  timestamp: string
  state: 'MOVING' | 'STATIONARY'
  imsi?: string
}

interface CaseDetails {
  case_id: string
  case_name?: string
  case_number?: string
  suspect_name?: string
  mobile_number?: string
}

// Custom Leaflet Icons using L.divIcon
const currentTargetIcon = L.divIcon({
  className: 'live-target-marker-wrapper',
  html: `
    <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; transform: translate(-50%, -50%);">
      <div style="position: absolute; width: 44px; height: 44px; border-radius: 9999px; background-color: rgba(239, 68, 68, 0.35); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="position: absolute; width: 28px; height: 28px; border-radius: 9999px; background-color: rgba(239, 68, 68, 0.5); animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;"></div>
      <div style="position: relative; width: 22px; height: 22px; border-radius: 9999px; background-color: #dc2626; border: 2.5px solid #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3); display: flex; align-items: center; justify-content: center;">
        <div style="width: 6px; height: 6px; border-radius: 9999px; background-color: #ffffff;"></div>
      </div>
    </div>
  `,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
})

const startPinIcon = L.divIcon({
  className: 'start-point-marker',
  html: `
    <div style="transform: translate(-50%, -50%); display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 9999px; background-color: #059669; color: #ffffff; border: 2px solid #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.3); font-size: 11px; font-weight: bold;">
      S
    </div>
  `,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
})

const breadcrumbIcon = L.divIcon({
  className: 'breadcrumb-marker',
  html: `
    <div style="transform: translate(-50%, -50%); width: 8px; height: 8px; border-radius: 9999px; background-color: #3b82f6; border: 1.5px solid #ffffff; box-shadow: 0 1px 2px rgba(0,0,0,0.2);"></div>
  `,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
})

// Auto-panning controller
function MapFollower({ center, follow }: { center: [number, number]; follow: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (follow) {
      map.panTo(center, { animate: true, duration: 0.8 })
    }
  }, [center, follow, map])
  return null
}

export default function FieldTrackerPage() {
  const { token } = useParams<{ token: string }>()
  const { activeTheme } = useMapTheme()
  const [isValidating, setIsValidating] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [caseDetails, setCaseDetails] = useState<CaseDetails | null>(null)
  const [locations, setLocations] = useState<LocationUpdate[]>([])
  const [currentState, setCurrentState] = useState<'MOVING' | 'STATIONARY'>('STATIONARY')
  const [wsStatus, setWsStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>('CONNECTING')
  
  const [followTarget, setFollowTarget] = useState(true)
  const [copiedCoords, setCopiedCoords] = useState(false)
  const [lastPingTime, setLastPingTime] = useState<string>(new Date().toISOString())
  
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)

  // 1. Initial Token Resolution & Case Hydration
  useEffect(() => {
    let cancelled = false

    const resolveToken = async () => {
      if (!token) {
        setError('Missing tracking link.')
        setIsValidating(false)
        return
      }

      try {
        const data = await liveTrackingApi.resolveToken(token)
        if (cancelled) return

        setCaseDetails({
          case_id: data.case_id,
          case_name: data.case_name,
          case_number: data.case_number,
          suspect_name: data.suspect_name,
          mobile_number: data.mobile_number,
        })

        if (data.recent_fixes && data.recent_fixes.length > 0) {
          setLocations(data.recent_fixes)
          const latest = data.recent_fixes[data.recent_fixes.length - 1]
          setLastPingTime(latest.timestamp)
        }

        if (data.current_state) {
          setCurrentState(data.current_state)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError('Invalid or expired tracking link. Ground links expire after 2 hours.')
        }
      } finally {
        if (!cancelled) {
          setIsValidating(false)
        }
      }
    }

    resolveToken()
    return () => {
      cancelled = true
    }
  }, [token])

  // 2. Real-Time WebSocket Connection
  const caseId = caseDetails?.case_id

  const connectWebSocket = useCallback(() => {
    if (!caseId || !token) return

    const pageIsHttps = window.location.protocol === 'https:'
    const base =
      WS_BASE_URL ||
      (pageIsHttps ? 'wss://' : 'ws://') + window.location.host
    const wsUrl = `${base}/api/ws/tracking/${encodeURIComponent(caseId)}?token=${encodeURIComponent(token)}`

    setWsStatus('CONNECTING')
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setWsStatus('CONNECTED')
    }

    ws.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data)
        // Extract payload from either raw format or { type: 'tracking:fix', payload: { ... } }
        const payload = raw?.type === 'tracking:fix' && raw.payload ? raw.payload : raw

        if (
          payload &&
          (payload.type === 'live_location_update' || raw.type === 'tracking:fix') &&
          (!payload.case_id || payload.case_id === caseId)
        ) {
          const lat = Number(payload.lat)
          const lng = Number(payload.lng)
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const timestamp = payload.timestamp || new Date().toISOString()
            const state: 'MOVING' | 'STATIONARY' = payload.state === 'MOVING' ? 'MOVING' : 'STATIONARY'

            const newLoc: LocationUpdate = {
              lat,
              lng,
              timestamp,
              state,
              imsi: payload.imsi,
            }

            setLocations((prev) => [...prev.slice(-499), newLoc])
            setCurrentState(state)
            setLastPingTime(timestamp)
          }
        }
      } catch (e) {
        console.error('Error parsing live tracking message', e)
      }
    }

    ws.onerror = (e) => {
      console.error('Field Tracker WebSocket error', e)
    }

    ws.onclose = (evt) => {
      setWsStatus('DISCONNECTED')
      // Auto-reconnect if not unmounted
      if (evt.code !== 4401) {
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connectWebSocket()
        }, 3000)
      }
    }

    wsRef.current = ws
  }, [caseId, token])

  useEffect(() => {
    connectWebSocket()
    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current)
      }
      wsRef.current?.close()
    }
  }, [connectWebSocket])

  const latestLocation = locations[locations.length - 1]
  const center: [number, number] = latestLocation
    ? [latestLocation.lat, latestLocation.lng]
    : [...DEFAULT_MAP_CENTER]

  const handleCopyCoords = () => {
    if (!latestLocation) return
    const text = `${latestLocation.lat.toFixed(6)}, ${latestLocation.lng.toFixed(6)}`
    copyToClipboard(text).then((ok) => {
      if (ok) {
        setCopiedCoords(true)
        window.setTimeout(() => setCopiedCoords(false), 2000)
      }
    })
  }

  // Loading Screen
  if (isValidating) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface-950 text-white">
        <div className="flex flex-col items-center gap-4 text-center p-6">
          <div className="relative flex items-center justify-center">
            <div className="h-16 w-16 rounded-full border-4 border-primary-500/20 border-t-primary-500 animate-spin" />
            <Radio className="absolute h-6 w-6 text-primary-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide">E-RAKSHAK FIELD RADAR</h2>
            <p className="mt-1 text-sm text-surface-400">Authenticating secure tracking token...</p>
          </div>
        </div>
      </div>
    )
  }

  // Error Screen
  if (error || !caseDetails) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface-950 p-4">
        <Card className="w-full max-w-md bg-surface-900 border-surface-800 text-surface-100 shadow-2xl">
          <div className="flex flex-col items-center p-6 text-center">
            <div className="h-14 w-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
              <AlertTriangle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Invalid Tracking Link</h2>
            <p className="text-surface-400 text-sm mb-6 leading-relaxed">
              {error || 'The tracking token has expired or is invalid. Please request a fresh ground-officer link from the command center.'}
            </p>
            <div className="w-full pt-4 border-t border-surface-800 flex justify-center">
              <Link
                to="/login"
                className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition-colors flex items-center gap-1.5"
              >
                <Shield className="h-3.5 w-3.5" /> Portal Login
              </Link>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="relative flex h-screen w-full flex-col bg-surface-950 text-surface-100 overflow-hidden font-sans">
      {/* Top Floating Command HUD */}
      <header className="absolute top-3 inset-x-3 md:inset-x-6 z-[1000] pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-6xl rounded-xl border border-surface-700/60 bg-surface-900/85 backdrop-blur-md px-4 py-3 shadow-2xl flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Suspect Info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-primary-600/20 border border-primary-500/40 flex items-center justify-center">
              <Crosshair className="h-5 w-5 text-primary-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white tracking-wide truncate">
                  {caseDetails.suspect_name || 'Suspect Target'}
                </span>
                {caseDetails.mobile_number && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-surface-800 text-primary-300 border border-surface-700">
                    <Phone className="h-3 w-3" />
                    {caseDetails.mobile_number}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-surface-400">
                <span className="truncate">{caseDetails.case_name || caseDetails.case_number || 'Live Operation'}</span>
                <span className="text-surface-600">•</span>
                <span className="font-mono text-[11px] text-surface-400 truncate">
                  {caseDetails.case_id.substring(0, 12)}
                </span>
              </div>
            </div>
          </div>

          {/* Status Indicators & Controls */}
          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            {/* WS Live status badge */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                wsStatus === 'CONNECTED'
                  ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                  : wsStatus === 'CONNECTING'
                  ? 'bg-amber-950/70 border-amber-500/40 text-amber-300 animate-pulse'
                  : 'bg-red-950/70 border-red-500/40 text-red-300'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  wsStatus === 'CONNECTED'
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                    : wsStatus === 'CONNECTING'
                    ? 'bg-amber-400'
                    : 'bg-red-400'
                }`}
              />
              <span className="tracking-wider text-[10px] font-bold">
                {wsStatus === 'CONNECTED' ? 'LIVE RADAR' : wsStatus}
              </span>
            </div>

            {/* Moving / Stationary state */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                currentState === 'MOVING'
                  ? 'bg-blue-500/20 border-blue-400/40 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.3)]'
                  : 'bg-surface-800 border-surface-700 text-surface-300'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span className="tracking-wider text-[10px]">{currentState}</span>
            </div>

            {/* Map Theme Switcher */}
            <div className="hidden sm:block">
              <MapThemeSwitcher />
            </div>
          </div>
        </div>
      </header>

      {/* Map Area */}
      <div className="flex-1 relative z-0 h-full w-full">
        <MapContainer
          center={center}
          zoom={16}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            key={activeTheme.id}
            url={activeTheme.url}
            attribution={activeTheme.attribution}
            subdomains={activeTheme.subdomains || 'abc'}
            maxZoom={activeTheme.maxZoom}
          />

          <MapFollower center={center} follow={followTarget} />

          {/* Target Trail Polyline */}
          {locations.length > 1 && (
            <Polyline
              positions={locations.map((loc) => [loc.lat, loc.lng])}
              pathOptions={{
                color: '#3b82f6',
                weight: 4,
                opacity: 0.85,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          )}

          {/* Historical Breadcrumb Markers */}
          {locations.slice(0, -1).map((loc, idx) => (
            <Marker
              key={`crumb-${idx}-${loc.timestamp}`}
              position={[loc.lat, loc.lng]}
              icon={idx === 0 ? startPinIcon : breadcrumbIcon}
            >
              <Popup className="custom-dark-popup">
                <div className="text-xs p-1">
                  <div className="font-bold text-surface-900">
                    {idx === 0 ? 'Starting Point' : `Fix #${idx + 1}`}
                  </div>
                  <div className="text-surface-600 font-mono text-[10px]">
                    {new Date(loc.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="text-surface-600 text-[10px]">State: {loc.state}</div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Latest Target Position (Pulsing Marker + Confidence Ring) */}
          {latestLocation && (
            <>
              <Circle
                center={[latestLocation.lat, latestLocation.lng]}
                radius={40}
                pathOptions={{
                  color: '#ef4444',
                  fillColor: '#ef4444',
                  fillOpacity: 0.15,
                  weight: 1,
                  dashArray: '3, 6',
                }}
              />
              <Marker position={[latestLocation.lat, latestLocation.lng]} icon={currentTargetIcon}>
                <Popup className="custom-dark-popup" autoPan={false}>
                  <div className="text-xs p-1">
                    <div className="font-bold text-red-600 flex items-center gap-1">
                      <Crosshair className="h-3.5 w-3.5" /> Target Current Position
                    </div>
                    <div className="text-surface-700 mt-1 font-mono text-[10px]">
                      {latestLocation.lat.toFixed(6)}, {latestLocation.lng.toFixed(6)}
                    </div>
                    <div className="text-surface-500 text-[10px] mt-0.5">
                      Last Ping: {new Date(latestLocation.timestamp).toLocaleTimeString()}
                    </div>
                    <div className="mt-1 font-semibold text-surface-900">
                      State:{' '}
                      <span className={latestLocation.state === 'MOVING' ? 'text-blue-600' : 'text-amber-600'}>
                        {latestLocation.state}
                      </span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            </>
          )}
        </MapContainer>

        {/* Empty state overlay while awaiting initial GPS pings */}
        {locations.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-950/40 backdrop-blur-sm z-[1000] pointer-events-none">
            <Card className="pointer-events-auto bg-surface-900/90 border-surface-700 text-white shadow-2xl p-5 max-w-sm text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary-500/20 border border-primary-500/40 flex items-center justify-center animate-pulse">
                  <Radio className="h-6 w-6 text-primary-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Awaiting Real-Time TSP Fixes</h3>
                  <p className="text-xs text-surface-400 mt-1">
                    Connecting to carrier tower triangulation stream for {caseDetails.mobile_number || 'target'}...
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Bottom Status & Floating Actions Bar */}
        <div className="absolute bottom-4 inset-x-3 md:inset-x-6 z-[1000] pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-4xl rounded-xl border border-surface-700/70 bg-surface-900/90 backdrop-blur-md p-3 shadow-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Quick Metrics */}
            <div className="flex items-center gap-4 flex-wrap">
              {/* Fixes count */}
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary-400" />
                <span className="text-surface-400">Fixes:</span>
                <span className="font-bold text-white font-mono">{locations.length}</span>
              </div>

              {/* Latest update */}
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-surface-400" />
                <span className="text-surface-400">Ping:</span>
                <span className="text-surface-200 font-mono">
                  {locations.length > 0 ? formatTimeAgo(lastPingTime) : 'Waiting'}
                </span>
              </div>

              {/* Coordinates with copy */}
              {latestLocation && (
                <button
                  onClick={handleCopyCoords}
                  className="flex items-center gap-1.5 rounded bg-surface-800 hover:bg-surface-700 px-2 py-1 text-surface-200 transition-colors"
                  title="Click to copy coordinates"
                >
                  <Compass className="h-3.5 w-3.5 text-primary-400" />
                  <span className="font-mono text-[11px]">
                    {latestLocation.lat.toFixed(5)}, {latestLocation.lng.toFixed(5)}
                  </span>
                  {copiedCoords ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3 text-surface-400" />
                  )}
                </button>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setFollowTarget((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  followTarget
                    ? 'bg-primary-600 border-primary-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.4)]'
                    : 'bg-surface-800 border-surface-700 text-surface-300 hover:bg-surface-700'
                }`}
              >
                <Crosshair className="h-3.5 w-3.5" />
                <span>{followTarget ? 'Following Target' : 'Free Pan'}</span>
              </button>

              <button
                onClick={() => setFollowTarget(true)}
                className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 border border-surface-700 text-surface-200 transition-colors"
                title="Center on target"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

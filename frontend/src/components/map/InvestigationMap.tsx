import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Maximize2, Target, Eye, EyeOff } from 'lucide-react'
import type { LocalizationResult, PathPoint, TowerRecord } from '@/types'
import { formatCoordinate, cn } from '@/utils'
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@/constants'

// ── Fix Leaflet default icon paths broken by Vite ────────────
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ── Custom icons ─────────────────────────────────────────────
const suspectIcon = L.divIcon({
  html: `<div style="
    width:24px;height:24px;border-radius:50%;
    background:#dc2626;border:3px solid white;
    box-shadow:0 2px 8px rgba(220,38,38,0.5);
    display:flex;align-items:center;justify-content:center;">
    <div style="width:6px;height:6px;border-radius:50%;background:white;"></div>
  </div>`,
  className: '',
  iconSize:   [24, 24],
  iconAnchor: [12, 12],
})

const towerIcon = L.divIcon({
  html: `<div style="
    width:20px;height:20px;border-radius:4px;
    background:#2563eb;border:2px solid white;
    box-shadow:0 1px 4px rgba(37,99,235,0.4);
    display:flex;align-items:center;justify-content:center;">
    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24"
         fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
      <path d="M2 9L12 4l10 5M12 4v16M8 20h8M5 11l7-3.5L19 11"/>
    </svg>
  </div>`,
  className: '',
  iconSize:   [20, 20],
  iconAnchor: [10, 10],
})

// ── Map auto-pan controller ───────────────────────────────────
interface LivePanProps { lat: number; lon: number; enabled: boolean }
function LivePan({ lat, lon, enabled }: LivePanProps) {
  const map = useMap()
  useEffect(() => {
    if (enabled) map.panTo([lat, lon], { animate: true, duration: 0.8 })
  }, [lat, lon, enabled, map])
  return null
}

interface CenterControlProps { lat: number; lon: number; trigger: boolean }
function CenterControl({ lat, lon, trigger }: CenterControlProps) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lon], 15, { animate: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])
  return null
}

// ── Main component ────────────────────────────────────────────
interface InvestigationMapProps {
  currentLocation?: LocalizationResult
  pathPoints:       PathPoint[]
  towers:           TowerRecord[]
  onCenterRequest:  () => void
  centerTrigger:    boolean
  autoFollow?:      boolean
}

export function InvestigationMap({
  currentLocation,
  pathPoints,
  towers,
  onCenterRequest,
  centerTrigger,
  autoFollow = true,
}: InvestigationMapProps) {
  const [showPath,     setShowPath]     = useState(true)
  const [showTowers,   setShowTowers]   = useState(true)
  const [showEllipse,  setShowEllipse]  = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const center: [number, number] = currentLocation
    ? [currentLocation.latitude, currentLocation.longitude]
    : DEFAULT_MAP_CENTER

  const pathCoords = pathPoints.map(
    (p): [number, number] => [p.latitude, p.longitude]
  )

  return (
    <div ref={containerRef} className={cn('relative h-full w-full', isFullscreen && 'fixed inset-0 z-50')}>
      <MapContainer
        center={center}
        zoom={currentLocation ? 14 : DEFAULT_MAP_ZOOM}
        className="h-full w-full"
        zoomControl={false}
      >
        {/* Tile layer */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        {/* Auto-follow live location */}
        {currentLocation && autoFollow && (
          <LivePan
            lat={currentLocation.latitude}
            lon={currentLocation.longitude}
            enabled={autoFollow}
          />
        )}

        {/* Manual center control */}
        {currentLocation && (
          <CenterControl
            lat={currentLocation.latitude}
            lon={currentLocation.longitude}
            trigger={centerTrigger}
          />
        )}

        {/* Confidence ellipse */}
        {showEllipse && currentLocation && (
          <Circle
            center={[currentLocation.latitude, currentLocation.longitude]}
            radius={currentLocation.accuracy_meters}
            pathOptions={{
              color:       '#2563eb',
              fillColor:   '#2563eb',
              fillOpacity: 0.07,
              weight:      1.5,
              dashArray:   '5 5',
            }}
          />
        )}

        {/* Path trail */}
        {showPath && pathCoords.length > 1 && (
          <Polyline
            positions={pathCoords}
            pathOptions={{
              color:     '#dc2626',
              weight:    2.5,
              opacity:   0.75,
              dashArray: '6 4',
            }}
          />
        )}

        {/* Previous path dots */}
        {showPath && pathPoints.slice(0, -1).map((p, i) => (
          <Circle
            key={`trail-${i}`}
            center={[p.latitude, p.longitude]}
            radius={12}
            pathOptions={{
              color:       '#6b7280',
              fillColor:   '#6b7280',
              fillOpacity: 0.4,
              weight:      1,
            }}
          />
        ))}

        {/* Cell towers */}
        {showTowers && towers.map((tower) => (
          <Marker
            key={tower.tower_id}
            position={[tower.latitude, tower.longitude]}
            icon={towerIcon}
          >
            <Popup>
              <div className="text-xs leading-relaxed">
                <p className="font-bold text-blue-700">{tower.cgi}</p>
                <p className="text-gray-600">{tower.operator} · {tower.radio}</p>
                <p>{formatCoordinate(tower.latitude)}°N, {formatCoordinate(tower.longitude)}°E</p>
                {tower.range_meters && <p>Range: {tower.range_meters}m</p>}
                {tower.site_address && <p className="text-gray-400 mt-1">{tower.site_address}</p>}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Current suspect marker */}
        {currentLocation && (
          <Marker
            position={[currentLocation.latitude, currentLocation.longitude]}
            icon={suspectIcon}
          >
            <Popup>
              <div className="text-xs leading-relaxed">
                <p className="font-bold text-red-600">⚠ Suspect Location</p>
                <p>{formatCoordinate(currentLocation.latitude)}°N, {formatCoordinate(currentLocation.longitude)}°E</p>
                <p>Accuracy: ±{currentLocation.accuracy_meters.toFixed(0)}m</p>
                <p>Confidence: {(currentLocation.confidence * 100).toFixed(1)}%</p>
                <p>Algorithm: {currentLocation.algorithm_used}</p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* ── Overlay controls ── */}
      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
        {/* Fullscreen toggle */}
        <button
          onClick={() => setIsFullscreen((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-md
                     hover:bg-primary-50 dark:bg-surface-800 dark:hover:bg-surface-700 transition-colors"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          <Maximize2 className="h-4 w-4 text-surface-600 dark:text-surface-300" />
        </button>

        {/* Center on suspect */}
        <button
          onClick={onCenterRequest}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-md
                     hover:bg-primary-50 dark:bg-surface-800 dark:hover:bg-surface-700 transition-colors"
          title="Center on suspect"
          aria-label="Center map on suspect"
        >
          <Target className="h-4 w-4 text-surface-600 dark:text-surface-300" />
        </button>

        {/* Layer toggles */}
        <div className="overflow-hidden rounded-lg bg-white shadow-md dark:bg-surface-800">
          {[
            { label: 'Path',    state: showPath,    set: setShowPath    },
            { label: 'Towers',  state: showTowers,  set: setShowTowers  },
            { label: 'Ellipse', state: showEllipse, set: setShowEllipse },
          ].map(({ label, state, set }, i, arr) => (
            <button
              key={label}
              onClick={() => set((v) => !v)}
              className={cn(
                'flex h-8 w-full items-center gap-2 px-3 text-xs transition-colors',
                'hover:bg-surface-50 dark:hover:bg-surface-700',
                i < arr.length - 1 && 'border-b border-surface-100 dark:border-surface-700'
              )}
              title={`Toggle ${label}`}
            >
              {state
                ? <Eye     className="h-3.5 w-3.5 text-primary-600" />
                : <EyeOff  className="h-3.5 w-3.5 text-surface-400" />
              }
              <span className={state ? 'text-surface-700 dark:text-surface-300' : 'text-surface-400'}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Bottom-left coordinate overlay ── */}
      {currentLocation && (
        <div className="absolute bottom-4 left-4 z-[1000] rounded-lg bg-black/60 px-3 py-2 backdrop-blur-sm">
          <p className="text-xs font-mono text-white">
            {formatCoordinate(currentLocation.latitude)}°N &nbsp;
            {formatCoordinate(currentLocation.longitude)}°E
          </p>
          <p className="text-2xs text-white/60 mt-0.5">
            ±{currentLocation.accuracy_meters.toFixed(0)}m · {currentLocation.algorithm_used} · {(currentLocation.confidence * 100).toFixed(0)}% conf.
          </p>
        </div>
      )}
    </div>
  )
}

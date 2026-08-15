import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, Polygon, useMap } from 'react-leaflet'
import L from 'leaflet'
import './leaflet-setup'
import 'leaflet.heat'
import { Maximize2, Target, Eye, EyeOff } from 'lucide-react'
import type { LocalizationResult, PathPoint, TowerRecord, GeoJSONFeatureCollection, RttObservation } from '@/types'
import { formatCoordinate, formatDateTime, cn } from '@/utils'
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

// ── Parse sector wedge GeoJSON polygons ──────────────────────
function parseSectorWedges(geojson?: GeoJSONFeatureCollection) {
  if (!geojson?.features) return []
  return geojson.features
    .filter((f) => f.geometry.type === 'Polygon' && f.properties?.azimuth_degrees != null)
    .map((f) => {
      const coords = (f.geometry as { coordinates: [number, number][][] }).coordinates[0]
      const latlngs: [number, number][] = coords.map(([lon, lat]) => [lat, lon])
      return { latlngs, properties: f.properties }
    })
}

// ── Parse confidence ellipses from GeoJSON ────────────────────
function parseEllipses(geojson?: GeoJSONFeatureCollection) {
  if (!geojson?.features) return []
  return geojson.features
    .filter((f) => f.geometry.type === 'Polygon' && f.properties?.semi_major_axis_meters != null)
    .map((f) => {
      const coords = (f.geometry as { coordinates: [number, number][][] }).coordinates[0]
      const latlngs: [number, number][] = coords.map(([lon, lat]) => [lat, lon])
      return { latlngs, properties: f.properties }
    })
}

// ── Heatmap layer (leaflet.heat) ──────────────────────────────
interface HeatLayerProps {
  points: Array<[number, number, number]>
  visible: boolean
}
function HeatLayer({ points, visible }: HeatLayerProps) {
  const map = useMap()
  const layerRef = useRef<L.HeatLayer | null>(null)

  useEffect(() => {
    if (!visible || points.length === 0) {
      layerRef.current?.remove()
      layerRef.current = null
      return
    }
    if (!layerRef.current) {
      layerRef.current = L.heatLayer(points, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        gradient: { 0.4: '#3b82f6', 0.65: '#facc15', 1: '#ef4444' },
      }).addTo(map)
    } else {
      layerRef.current.setLatLngs(points)
    }
  }, [points, visible, map])

  useEffect(() => () => { layerRef.current?.remove() }, [])
  return null
}

// ── RTT observation layer (single-tower mode) ─────────────────
const FILE_COLORS = [
  '#2563eb', '#db2777', '#16a34a', '#ea580c', '#7c3aed',
  '#0891b2', '#ca8a04', '#be123c', '#4d7c0f', '#9333ea',
]

function colorForUpload(uploadId: string): string {
  let hash = 0
  for (let i = 0; i < uploadId.length; i++) hash = (hash * 31 + uploadId.charCodeAt(i)) >>> 0
  return FILE_COLORS[hash % FILE_COLORS.length]
}

/** Polygon arc for a tower sector: azimuth ± beamwidth/2 at RTT radius. */
function sectorArcPositions(
  lat: number, lon: number, azimuth: number, beamwidth: number, radiusM: number, steps = 24
): Array<[number, number]> {
  const half = beamwidth / 2
  const pts: Array<[number, number]> = [ [lat, lon] ]
  for (let i = 0; i <= steps; i++) {
    const bearing = azimuth - half + (beamwidth * i) / steps
    const br = (bearing * Math.PI) / 180
    const dLat = (radiusM / 111320) * Math.cos(br)
    const dLon = (radiusM / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.sin(br)
    pts.push([lat + dLat, lon + dLon])
  }
  pts.push([lat, lon])
  return pts
}

function RttLayer({ observations, uploadId, color }: {
  observations: RttObservation[]; uploadId: string; color: string
}) {
  const obs = useMemo(() => observations.filter((o) => o.upload_id === uploadId), [observations, uploadId])
  return (
    <>
      {obs.map((o) => o.towers.map((t, i) => {
        if (!(t.radius_meters > 0)) return null
        return (
          <Fragment key={`${o.frame_id}-${t.cgi}`}>
            <Circle
              center={[t.latitude, t.longitude]}
              radius={t.radius_meters}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.06, weight: 1.5 }}
            >
              <Popup>
                <div className="text-xs leading-relaxed">
                  <p className="font-bold" style={{ color }}>TA/RTT Ring</p>
                  <p>{o.subscriber_identifier} · {new Date(o.timestamp).toLocaleString()}</p>
                  <p>CGI: {t.cgi}</p>
                  <p>Radius: {t.radius_meters.toFixed(0)}m</p>
                  {t.timing_advance != null && <p>TA: {t.timing_advance}</p>}
                  {t.signal_strength != null && <p>RSRP: {t.signal_strength} dBm</p>}
                </div>
              </Popup>
            </Circle>
            {t.azimuth != null && t.beamwidth != null && t.beamwidth > 0 && (
              <Polygon
                positions={sectorArcPositions(t.latitude, t.longitude, t.azimuth, t.beamwidth, t.radius_meters)}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.12, weight: 1 }}
              >
                <Popup>
                  <div className="text-xs leading-relaxed">
                    <p className="font-bold" style={{ color }}>Sector Arc</p>
                    <p>Azimuth: {t.azimuth}° · Beamwidth: {t.beamwidth}°</p>
                  </div>
                </Popup>
              </Polygon>
            )}
          </Fragment>
        )
      }))}
    </>
  )
}

// ── Main component ────────────────────────────────────────────
interface InvestigationMapProps {
  currentLocation?: LocalizationResult
  pathPoints:       PathPoint[]
  towers:           TowerRecord[]
  onCenterRequest:  () => void
  centerTrigger:    boolean
  autoFollow?:      boolean
  geojson?:         GeoJSONFeatureCollection
  /** KDE heatmap lattice from backend /heatmap (overrides geojson-derived points) */
  kdeHeatPoints?:   Array<[number, number, number]>
  /** Per-frame RTT/TA observations for single-tower mode */
  rttObservations?: RttObservation[]
}

export function InvestigationMap({
  currentLocation,
  pathPoints,
  towers,
  onCenterRequest,
  centerTrigger,
  autoFollow = true,
  geojson,
  kdeHeatPoints,
  rttObservations,
}: InvestigationMapProps) {
  const [showPath,       setShowPath]       = useState(true)
  const [showTowers,     setShowTowers]     = useState(true)
  const [showEllipse,    setShowEllipse]    = useState(true)
  const [showSectors,    setShowSectors]    = useState(true)
  const [showHeatmap,    setShowHeatmap]    = useState(true)
  const [isFullscreen,   setIsFullscreen]   = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  const tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

  const sectorWedges = parseSectorWedges(geojson)
  const ellipses = parseEllipses(geojson)

  // Heatmap points from Point features, weighted by 1/confidence (tighter = hotter)
  const heatPoints = useMemo<Array<[number, number, number]>>(() => {
    if (kdeHeatPoints && kdeHeatPoints.length > 0) return kdeHeatPoints
    if (!geojson?.features) return []
    return geojson.features
      .filter((f) => f.geometry.type === 'Point')
      .map((f) => {
        const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates
        const conf = Number(f.properties?.confidence_radius_meters)
        const weight = Number.isFinite(conf) && conf > 0 ? 1 / conf : 1
        return [lat, lon, weight]
      })
  }, [geojson, kdeHeatPoints])

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
          url={tileUrl}
          attribution={tileAttribution}
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

        {/* Confidence ellipses from GeoJSON */}
        {showEllipse && ellipses.map((e, i) => (
          <Polygon
            key={`ellipse-${i}`}
            positions={e.latlngs}
            pathOptions={{
              color:       '#2563eb',
              fillColor:   '#2563eb',
              fillOpacity: 0.07,
              weight:      1.5,
              dashArray:   '5 5',
            }}
          />
        ))}

        {/* Fallback: simple circle when no GeoJSON ellipses */}
        {showEllipse && currentLocation && ellipses.length === 0 && (
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

        {/* Sector wedge polygons */}
        {showSectors && sectorWedges.map((s, i) => (
          <Polygon
            key={`sector-${i}`}
            positions={s.latlngs}
            pathOptions={{
              color:       '#f59e0b',
              fillColor:   '#f59e0b',
              fillOpacity: 0.10,
              weight:      1,
              dashArray:   '3 3',
            }}
          >
            <Popup>
              <div className="text-xs leading-relaxed">
                <p className="font-bold text-amber-700 dark:text-amber-400">Sector Wedge</p>
                <p>Azimuth: {String(s.properties.azimuth_degrees ?? '')}°</p>
                <p>Beamwidth: {String(s.properties.beamwidth_degrees ?? '')}°</p>
                <p>Radius: {typeof s.properties.radius_meters === 'number' ? s.properties.radius_meters.toFixed(0) : ''}m</p>
              </div>
            </Popup>
          </Polygon>
        ))}

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

        {/* RTT / TA observations (single-tower mode) — per-file color */}
        {rttObservations && [...new Set(rttObservations.map((o) => o.upload_id))].map((uid) => (
          <RttLayer key={`rtt-${uid}`} observations={rttObservations} uploadId={uid} color={colorForUpload(uid)} />
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
                <p className="font-bold text-blue-700 dark:text-blue-400">{tower.cgi}</p>
                <p className="text-surface-600 dark:text-surface-300">{tower.operator} · {tower.radio}</p>
                <p>{formatCoordinate(tower.latitude)}°N, {formatCoordinate(tower.longitude)}°E</p>
                {tower.azimuth != null && <p>Azimuth: {tower.azimuth}°</p>}
                {tower.beamwidth != null && <p>Beamwidth: {tower.beamwidth}°</p>}
                {tower.range_meters && <p>Range: {tower.range_meters}m</p>}
                {tower.site_address && <p className="text-surface-400 dark:text-surface-500 mt-1">{tower.site_address}</p>}
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
                <p className="font-bold text-red-600 dark:text-red-400">⚠ Suspect Location</p>
                <p>{formatCoordinate(currentLocation.latitude)}°N, {formatCoordinate(currentLocation.longitude)}°E</p>
                <p>Accuracy: ±{currentLocation.accuracy_meters.toFixed(0)}m</p>
                <p>Confidence: {currentLocation.confidence != null ? (currentLocation.confidence * 100).toFixed(1) : 'N/A'}%</p>
                <p>Algorithm: {currentLocation.algorithm_used}</p>
                {currentLocation.geocode && String(currentLocation.geocode) !== 'Unknown area' && (
                  <p className="text-blue-700 dark:text-blue-300 font-medium mt-1">≈ {String(currentLocation.geocode)}</p>
                )}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Probability heatmap */}
        <HeatLayer points={heatPoints} visible={showHeatmap} />
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
            { label: 'Sectors', state: showSectors, set: setShowSectors },
            { label: 'Heatmap', state: showHeatmap, set: setShowHeatmap },
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
            ±{currentLocation.accuracy_meters.toFixed(0)}m · {currentLocation.algorithm_used} · {currentLocation.confidence != null ? (currentLocation.confidence * 100).toFixed(0) : 'N/A'}% conf.
          </p>
        </div>
      )}

      {/* ── Geocode narrative banner ── */}
      {currentLocation?.geocode && String(currentLocation.geocode) !== 'Unknown area' && (
        <div className="absolute left-4 top-4 z-[1000] max-w-xs rounded-lg border border-blue-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm dark:border-blue-800/60 dark:bg-surface-900/95">
          <p className="text-2xs text-surface-500 dark:text-surface-400">
            At <span className="font-semibold text-surface-800 dark:text-surface-100">
              {currentLocation.timestamp ? formatDateTime(currentLocation.timestamp) : 'this time'}
            </span>, the suspect was around
          </p>
          <p className="mt-0.5 text-sm font-semibold text-blue-700 dark:text-blue-300">
            {String(currentLocation.geocode)}
          </p>
        </div>
      )}

      {/* ── Heatmap Legend ── */}
      {showHeatmap && heatPoints.length > 0 && (
        <div className="absolute bottom-4 right-4 z-[1000] rounded-lg border border-surface-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm dark:border-surface-700 dark:bg-surface-900/95 flex flex-col gap-1 w-44">
          <p className="text-[10px] font-semibold text-surface-700 dark:text-surface-300">Suspect Likelihood Density</p>
          <div className="h-1.5 w-full rounded-sm bg-gradient-to-r from-[#3b82f6] via-[#facc15] to-[#ef4444]" />
          <div className="flex justify-between text-[8px] font-medium text-surface-500">
            <span>Low Probability</span>
            <span>High Probability</span>
          </div>
        </div>
      )}
    </div>
  )
}

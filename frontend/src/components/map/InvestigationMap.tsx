import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, Circle, Polygon, useMap } from 'react-leaflet'
import L from 'leaflet'
import './leaflet-setup'
import 'leaflet.heat'
import { Maximize2, Target, Eye, EyeOff, Radio } from 'lucide-react'
import type { LocalizationResult, PathPoint, TowerRecord, GeoJSONFeatureCollection, RttObservation, RFVerifiedFix } from '@/types'
import { formatCoordinate, formatDateTime, cn } from '@/utils'
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, SERVICE_AREA_ZOOM_TOLERANCE, SURAT_BOUNDS } from '@/constants'
import { useMapTheme } from '@/hooks/useMapTheme'
import { MapThemeSwitcher } from '@/components/map/MapThemeSwitcher'
import { useToast } from '@/components/ui/Toast'


// ── Fix Leaflet default icon paths broken by Vite ────────────
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

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

const twoTowerIcon = L.divIcon({
  html: `<div style="
    width:24px;height:24px;border-radius:50%;
    background:#ea580c;border:3px solid white;
    box-shadow:0 2px 8px rgba(234,88,12,0.5);
    display:flex;align-items:center;justify-content:center;">
    <div style="width:6px;height:6px;border-radius:50%;background:white;"></div>
  </div>`,
  className: '',
  iconSize:   [24, 24],
  iconAnchor: [12, 12],
})

const singleSectorIcon = L.divIcon({
  html: `<div style="
    width:24px;height:24px;border-radius:50%;
    background:#7c3aed;border:3px solid white;
    box-shadow:0 2px 8px rgba(124,58,237,0.5);
    display:flex;align-items:center;justify-content:center;">
    <div style="width:6px;height:6px;border-radius:50%;background:white;"></div>
  </div>`,
  className: '',
  iconSize:   [24, 24],
  iconAnchor: [12, 12],
})

function getSuspectIcon(fixMethod?: string) {
  if (fixMethod === 'single_sector') return singleSectorIcon
  if (fixMethod === 'two_tower') return twoTowerIcon
  return suspectIcon
}

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

const rogueTowerIcon = L.divIcon({
  html: `<div style="
    width:22px;height:22px;border-radius:4px;
    background:#dc2626;border:2px solid white;
    box-shadow:0 0 10px rgba(220,38,38,0.85), 0 2px 4px rgba(0,0,0,0.3);
    display:flex;align-items:center;justify-content:center;
    position:relative;cursor:pointer;">
    <span style="
      position:absolute;inset:-4px;border-radius:6px;
      border:2px solid #ef4444;opacity:0.75;
      animation:ping 1.6s cubic-bezier(0,0,0.2,1) infinite;"></span>
    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
         fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
      <path d="M2 9L12 4l10 5M12 4v16M8 20h8M5 11l7-3.5L19 11"/>
    </svg>
  </div>`,
  className: '',
  iconSize:   [22, 22],
  iconAnchor: [11, 11],
})

const sdrTargetIcon = L.divIcon({
  html: `<div style="
    width:32px;height:32px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    position:relative;cursor:pointer;z-index:900;">
    <!-- Outer pulse ring -->
    <span style="
      position:absolute;inset:-8px;border-radius:50%;
      border:2px solid #06b6d4;opacity:0.65;
      animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></span>
    <!-- Concentric radar ring -->
    <span style="
      position:absolute;inset:-3px;border-radius:50%;
      border:1.5px dashed #0891b2;opacity:0.85;"></span>
    <!-- Inner cyan core -->
    <div style="
      width:22px;height:22px;border-radius:50%;
      background:#0891b2;border:2.5px solid #ffffff;
      box-shadow:0 0 14px rgba(6,182,212,0.95), 0 2px 6px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
           fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="22" y1="12" x2="18" y2="12"/>
        <line x1="6" y1="12" x2="2" y2="12"/>
        <line x1="12" y1="6" x2="12" y2="2"/>
        <line x1="12" y1="22" x2="12" y2="18"/>
      </svg>
    </div>
  </div>`,
  className: '',
  iconSize:   [32, 32],
  iconAnchor: [16, 16],
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

// ── Surat operating-area guard ────────────────────────────────
// Cell-site/tower data only exists for the Surat district. Warn once when the
// viewport wanders outside that area, then stay quiet until it comes back.
interface SuratBoundsGuardProps { enabled: boolean }
function SuratBoundsGuard({ enabled }: SuratBoundsGuardProps) {
  const map = useMap()
  const { toast } = useToast()
  const warnedRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    const [[sLat, wLon], [nLat, eLon]] = SURAT_BOUNDS
    const serviceSpan = { lat: nLat - sLat, lng: eLon - wLon }

    const outside = () => {
      const b = map.getBounds()
      const c = map.getCenter()

      // Panned away from the district entirely.
      const centreOffArea =
        c.lat < sLat || c.lat > nLat || c.lng < wLon || c.lng > eLon

      // Zoomed out past the point where the service area is usefully visible.
      // The viewport may still be centred on Surat while towers are a speck,
      // so compare the visible span against the district's own span.
      const span = { lat: b.getNorth() - b.getSouth(), lng: b.getEast() - b.getWest() }
      const zoomedOutTooFar =
        span.lat > serviceSpan.lat * SERVICE_AREA_ZOOM_TOLERANCE ||
        span.lng > serviceSpan.lng * SERVICE_AREA_ZOOM_TOLERANCE

      return centreOffArea || zoomedOutTooFar
    }

    const check = () => {
      if (outside()) {
        if (warnedRef.current) return
        warnedRef.current = true
        toast({
          variant: 'warning',
          title: 'Outside the Surat service area',
          description:
            'E-Rakshak holds tower and cell-site records for Surat district only. Return to the service area to continue.',
          actionLabel: 'Return to Surat',
          onAction: () => {
            map.flyToBounds(SURAT_BOUNDS, { padding: [40, 40], duration: 0.8 })
          },
        })
      } else {
        // Back inside — allow the warning to fire again on a future exit.
        warnedRef.current = false
      }
    }

    map.on('moveend', check)
    map.on('zoomend', check)
    check()
    return () => {
      map.off('moveend', check)
      map.off('zoomend', check)
    }
  }, [map, toast, enabled])

  return null
}

interface SdrFocusControlProps { lat: number; lon: number; trigger: boolean }
function SdrFocusControl({ lat, lon, trigger }: SdrFocusControlProps) {
  const map = useMap()
  useEffect(() => {
    map.flyTo([lat, lon], 18, { animate: true, duration: 1.2 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])
  return null
}

function MapResizeHandler() {
  const map = useMap()
  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize()
    }
    window.addEventListener('resize', handleResize)
    const container = map.getContainer()
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && container) {
      ro = new ResizeObserver(() => {
        map.invalidateSize()
      })
      ro.observe(container)
    }
    const timer = setTimeout(() => {
      map.invalidateSize()
    }, 250)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (ro) ro.disconnect()
      clearTimeout(timer)
    }
  }, [map])
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
    // Guard: leaflet.heat chunk may fail to register under Vite code-splitting.
    const heatFactory = (L as unknown as { heatLayer?: typeof L.heatLayer }).heatLayer
    if (typeof heatFactory !== 'function') return
    // Clamp weights to [0,1]: near-zero confidence_radius otherwise saturates red.
    const clamped = points.map(([lat, lng, w]) => [lat, lng, Math.min(1, Math.max(0, w))] as [number, number, number])
    if (!layerRef.current) {
      layerRef.current = heatFactory(clamped, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        minOpacity: 0.3,
        max: 1.0,
        gradient: { 0.4: '#3b82f6', 0.65: '#facc15', 1: '#ef4444' },
      }).addTo(map)
    } else {
      layerRef.current.setLatLngs(clamped)
    }
    return () => {
      layerRef.current?.remove()
      layerRef.current = null
    }
  }, [points, visible, map])

  useEffect(() => () => { layerRef.current?.remove(); layerRef.current = null }, [map])
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
      {obs.map((o) => o.towers.map((t, _i) => {
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
  /** Field SDR / RF Ground Verification result */
  rfVerifiedFix?:   RFVerifiedFix | null
  /** Trigger to pan & zoom to SDR verified target */
  sdrFocusTrigger?: boolean
  /** Px gap from the right edge for the floating control stack (clears side panels). */
  controlsRightOffset?: number
  /** Warn when the viewport leaves the Surat operating area. */
  guardServiceArea?: boolean
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
  rfVerifiedFix,
  sdrFocusTrigger = false,
  controlsRightOffset,
  guardServiceArea = false,
}: InvestigationMapProps) {
  const [showPath,        setShowPath]        = useState(true)
  // Towers are numerous (3,000+ across the city) and clutter the map, so they
  // start hidden and are opt-in via the dedicated tower toggle.
  const [showTowers,      setShowTowers]      = useState(false)
  const [showRogueTowers, setShowRogueTowers] = useState(true)
  const [showSdrTarget,   setShowSdrTarget]   = useState(true)
  const [showEllipse,     setShowEllipse]     = useState(true)
  const [showSectors,     setShowSectors]     = useState(true)
  const [showHeatmap,     setShowHeatmap]     = useState(true)
  const [isFullscreen,    setIsFullscreen]    = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { activeTheme } = useMapTheme()

  // Auto-enable SDR layer when verified fix becomes available
  useEffect(() => {
    if (rfVerifiedFix) setShowSdrTarget(true)
  }, [rfVerifiedFix])

  // Fullscreen must outrank the sidebar, topbar and side islands (z-40..z-[1001]).
  // A `z-index` bump can't do that because an ancestor `relative z-0` wrapper
  // traps this subtree in its own stacking context, so we promote the map into
  // the browser's top layer instead. Esc is handled natively; the state mirror
  // keeps React in sync when the user leaves fullscreen by other means.
  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    if (!isFullscreen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
  }, [isFullscreen])

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await el.requestFullscreen()
        setIsFullscreen(true)
      }
    } catch {
      // Blocked (e.g. an iframe without allow="fullscreen"): fall back to the
      // CSS overlay so the button still does something useful.
      setIsFullscreen((v) => !v)
    }
  }, [])

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

  const mapNode = (
    <div
      ref={containerRef}
      className={cn(
        'relative h-full w-full',
        // The workspace map wrapper must stay z-index:auto so this fixed layer
        // participates in the root stacking context and clears the side islands
        // (z-[1000]) and mobile drawers (z-[10000]).
        isFullscreen && 'fixed inset-0 z-[20000] bg-surface-50 dark:bg-surface-950'
      )}
    >
      <MapContainer
        center={center}
        zoom={currentLocation ? 14 : DEFAULT_MAP_ZOOM}
        className="h-full w-full"
        zoomControl={false}
      >
        {/* Dynamic Tile layer */}
        <TileLayer
          key={activeTheme.id}
          url={activeTheme.url}
          attribution={activeTheme.attribution}
          subdomains={activeTheme.subdomains || 'abc'}
          maxZoom={activeTheme.maxZoom}
          maxNativeZoom={activeTheme.maxNativeZoom ?? activeTheme.maxZoom}
        />

        {/* Optional transparent label/reference overlay (e.g. Esri canvas labels) */}
        {activeTheme.overlayUrl && (
          <TileLayer
            key={`${activeTheme.id}-labels`}
            url={activeTheme.overlayUrl}
            attribution={activeTheme.overlayAttribution ?? ''}
            maxZoom={activeTheme.maxZoom}
            maxNativeZoom={activeTheme.maxNativeZoom ?? activeTheme.maxZoom}
            opacity={0.9}
          />
        )}

        {/* Map resize invalidate handler */}
        <MapResizeHandler />

        {/* Warn when panning/zooming outside the Surat service area */}
        {guardServiceArea && <SuratBoundsGuard enabled={guardServiceArea} />}

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

        {/* SDR Target Focus control */}
        {rfVerifiedFix && (
          <SdrFocusControl
            lat={rfVerifiedFix.latitude}
            lon={rfVerifiedFix.longitude}
            trigger={sdrFocusTrigger}
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

        {/* Cell towers (registered) */}
        {showTowers && towers.filter((t) => !t.is_rogue).map((tower) => (
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

        {/* Rogue BTS / IMSI Catcher Towers */}
        {showRogueTowers && towers.filter((t) => t.is_rogue).map((tower) => (
          <Marker
            key={`rogue-${tower.tower_id}`}
            position={[tower.latitude, tower.longitude]}
            icon={rogueTowerIcon}
          >
            <Tooltip direction="top" offset={[0, -12]} opacity={0.95}>
              <div className="text-xs font-bold text-red-600 dark:text-red-400">
                ROGUE BTS DETECTED
                <span className="block text-[10px] font-medium text-amber-600 dark:text-amber-400">Possible IMSI Catcher</span>
              </div>
            </Tooltip>
            <Popup>
              <div className="text-xs leading-relaxed">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <p className="font-bold text-red-600 dark:text-red-400">ROGUE BTS DETECTED</p>
                </div>
                <p className="font-semibold text-amber-600 dark:text-amber-400">Possible IMSI Catcher</p>
                <p className="font-mono text-surface-800 dark:text-surface-200 mt-1">ID: {tower.cgi || tower.tower_id}</p>
                <p className="text-surface-600 dark:text-surface-300">{tower.operator} · {tower.radio || 'Unknown'}</p>
                <p>{formatCoordinate(tower.latitude)}°N, {formatCoordinate(tower.longitude)}°E</p>
                {tower.range_meters && <p>Range: {tower.range_meters}m</p>}
                {tower.site_address && <p className="text-surface-400 dark:text-surface-500 mt-1">{tower.site_address}</p>}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Current suspect marker (multilateration / two-tower / single-sector result) */}
        {currentLocation && (
          <Marker
            position={[currentLocation.latitude, currentLocation.longitude]}
            icon={getSuspectIcon(currentLocation.fix_method as string)}
          >
            <Popup>
              <div className="text-xs leading-relaxed">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    currentLocation.fix_method === 'single_sector'
                      ? "bg-purple-500 animate-pulse"
                      : currentLocation.fix_method === 'two_tower'
                      ? "bg-amber-500 animate-pulse"
                      : "bg-red-500"
                  )} />
                  <p className={cn(
                    "font-bold",
                    currentLocation.fix_method === 'single_sector'
                      ? "text-purple-700 dark:text-purple-400"
                      : currentLocation.fix_method === 'two_tower'
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-red-600 dark:text-red-400"
                  )}>
                    {currentLocation.fix_method === 'single_sector'
                      ? 'Single-Sector Fix'
                      : currentLocation.fix_method === 'two_tower'
                      ? 'Two-Tower Fix'
                      : 'Suspect Location'}
                  </p>
                </div>
                {/* Confidence Badge */}
                <div className="mb-1.5">
                  {currentLocation.fix_method === 'single_sector' && (
                    <span className="inline-block rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2 py-0.5 text-[10px] font-bold">
                      Coarse (1 sector)
                    </span>
                  )}
                  {currentLocation.fix_method === 'two_tower' && (
                    <span className="inline-block rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold">
                      Low confidence (2 towers)
                    </span>
                  )}
                  {(!currentLocation.fix_method || currentLocation.fix_method === 'multilateration') && (
                    <span className="inline-block rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                      High confidence ({String(currentLocation.n_towers ?? 3)}+ towers)
                    </span>
                  )}
                </div>
                <p>{formatCoordinate(currentLocation.latitude)}°N, {formatCoordinate(currentLocation.longitude)}°E</p>
                <p>Accuracy: ±{currentLocation.accuracy_meters ? currentLocation.accuracy_meters.toFixed(0) : '0'}m</p>
                <p>Confidence: {currentLocation.confidence != null ? (currentLocation.confidence * 100).toFixed(1) : 'N/A'}%</p>
                <p>Algorithm: {String(currentLocation.algorithm_used ?? 'Multilateration')}</p>
                {currentLocation.geocode && String(currentLocation.geocode) !== 'Unknown area' && (
                  <p className="text-blue-700 dark:text-blue-300 font-medium mt-1">≈ {String(currentLocation.geocode)}</p>
                )}
              </div>
            </Popup>
          </Marker>
        )}

        {/* SDR Verified Target (High Precision ±5m) */}
        {showSdrTarget && rfVerifiedFix && (
          <>
            {/* Precision ±5m circle */}
            <Circle
              center={[rfVerifiedFix.latitude, rfVerifiedFix.longitude]}
              radius={rfVerifiedFix.accuracy_m}
              pathOptions={{
                color: '#0891b2',
                fillColor: '#06b6d4',
                fillOpacity: 0.22,
                weight: 2,
                dashArray: '4 4',
              }}
            />

            {/* SDR Target Marker with permanent label */}
            <Marker
              position={[rfVerifiedFix.latitude, rfVerifiedFix.longitude]}
              icon={sdrTargetIcon}
            >
              <Tooltip permanent direction="top" offset={[0, -18]} opacity={0.95}>
                <div className="text-left font-sans leading-tight select-none">
                  <div className="flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
                    <span className="font-bold text-cyan-600 dark:text-cyan-400 text-xs">VERIFIED TARGET</span>
                  </div>
                  <div className="mt-0.5 space-y-0.5 text-[10px] text-surface-700 dark:text-surface-300 font-mono">
                    <div>RSSI: <span className="font-semibold">{rfVerifiedFix.rssi_dbm} dBm</span></div>
                    <div>Accuracy: <span className="font-semibold text-cyan-600 dark:text-cyan-400">±{rfVerifiedFix.accuracy_m} m</span></div>
                    <div>Confidence: <span className="font-semibold text-green-600 dark:text-green-400">{rfVerifiedFix.confidence}%</span></div>
                  </div>
                </div>
              </Tooltip>
              <Popup>
                <div className="text-xs leading-relaxed">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-cyan-500 animate-pulse" />
                    <p className="font-bold text-cyan-700 dark:text-cyan-400">VERIFIED TARGET (SDR)</p>
                  </div>
                  <p className="text-surface-600 dark:text-surface-300 font-medium">Source: Field SDR / RF Sweep</p>
                  <p className="font-mono text-surface-800 dark:text-surface-200 mt-1">
                    {formatCoordinate(rfVerifiedFix.latitude)}°N, {formatCoordinate(rfVerifiedFix.longitude)}°E
                  </p>
                  <p>Accuracy: ±{rfVerifiedFix.accuracy_m}m</p>
                  <p>Signal (RSSI): {rfVerifiedFix.rssi_dbm} dBm</p>
                  <p>Confidence: {rfVerifiedFix.confidence}%</p>
                  {rfVerifiedFix.filename && (
                    <p className="text-surface-400 dark:text-surface-500 mt-1">File: {rfVerifiedFix.filename}</p>
                  )}
                </div>
              </Popup>
            </Marker>
          </>
        )}

        {/* Probability heatmap */}
        <HeatLayer points={heatPoints} visible={showHeatmap} />
      </MapContainer>

      {/* ── Overlay controls ── */}
      <div
        className="absolute top-3 z-[1000] flex flex-col gap-2 items-end"
        style={{ right: isFullscreen ? '0.75rem' : controlsRightOffset ? `${controlsRightOffset}px` : '0.75rem' }}
      >
        {/* Basemap switcher */}
        <div className="pointer-events-auto" data-tour="map-basemap-control">
          <MapThemeSwitcher />
        </div>

        {/* Fullscreen toggle */}
        <button
          onClick={() => { void toggleFullscreen() }}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-md
                     hover:bg-primary-50 dark:bg-surface-800 dark:hover:bg-surface-700 transition-colors cursor-pointer"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          <Maximize2 className="h-4 w-4 text-surface-600 dark:text-surface-300" />
        </button>

        {/* Center on suspect */}
        <button
          onClick={onCenterRequest}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-md
                     hover:bg-primary-50 dark:bg-surface-800 dark:hover:bg-surface-700 transition-colors cursor-pointer"
          title="Center on suspect"
          aria-label="Center map on suspect"
        >
          <Target className="h-4 w-4 text-surface-600 dark:text-surface-300" />
        </button>

        {/* Tower visibility — prominent, since towers are the biggest clutter */}
        <button
          onClick={() => setShowTowers((v) => !v)}
          data-tour="tower-toggle"
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold shadow-md transition-colors cursor-pointer',
            showTowers
              ? 'bg-primary-600 text-white hover:bg-primary-700'
              : 'bg-white text-surface-600 hover:bg-primary-50 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'
          )}
          title={showTowers ? 'Hide cell towers' : 'Show cell towers'}
          aria-pressed={showTowers}
        >
          <Radio className="h-3.5 w-3.5" />
          {showTowers ? 'Towers On' : 'Towers Off'}
          {towers.length > 0 && (
            <span className={cn(
              'rounded-full px-1.5 text-[10px] font-bold tabular-nums',
              showTowers ? 'bg-white/25 text-white' : 'bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-300'
            )}>
              {towers.filter((t) => !t.is_rogue).length}
            </span>
          )}
        </button>

        {/* Layer toggles */}
        <div className="overflow-hidden rounded-lg bg-white shadow-md dark:bg-surface-800">
          {[
            { label: 'Path',                state: showPath,        set: setShowPath        },
            { label: 'Rogue Towers',        state: showRogueTowers, set: setShowRogueTowers },
            ...(rfVerifiedFix ? [{ label: 'SDR Target', state: showSdrTarget, set: setShowSdrTarget }] : []),
            { label: 'Ellipse',             state: showEllipse,     set: setShowEllipse     },
            { label: 'Sectors',             state: showSectors,     set: setShowSectors     },
            { label: 'Heatmap',             state: showHeatmap,     set: setShowHeatmap     },
          ].map(({ label, state, set }, i, arr) => (
            <button
              key={label}
              onClick={() => set((v) => !v)}
              className={cn(
                'flex h-8 w-full items-center gap-2 px-3 text-xs transition-colors cursor-pointer',
                'hover:bg-surface-50 dark:hover:bg-surface-700',
                i < arr.length - 1 && 'border-b border-surface-100 dark:border-surface-700'
              )}
              title={`Toggle ${label}`}
            >
              {state
                ? <Eye     className="h-3.5 w-3.5 text-primary-600" />
                : <EyeOff  className="h-3.5 w-3.5 text-surface-400" />
              }
              <span className={state ? 'text-surface-700 dark:text-surface-300 font-medium' : 'text-surface-400'}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Bottom-left coordinate overlay ── */}
      {currentLocation && (
        <div className="absolute bottom-28 lg:bottom-4 left-3 sm:left-4 z-[970] max-w-[200px] sm:max-w-none rounded-lg bg-black/70 px-2.5 py-1.5 sm:px-3 sm:py-2 backdrop-blur-sm">
          <p className="text-2xs sm:text-xs font-mono text-white truncate">
            {formatCoordinate(currentLocation.latitude)}°N &nbsp;
            {formatCoordinate(currentLocation.longitude)}°E
          </p>
          <p className="text-[10px] sm:text-2xs text-white/70 mt-0.5 truncate">
            ±{currentLocation.accuracy_meters.toFixed(0)}m · {currentLocation.algorithm_used} · {currentLocation.confidence != null ? (currentLocation.confidence * 100).toFixed(0) : 'N/A'}% conf.
          </p>
        </div>
      )}

      {/* ── Geocode narrative banner ── */}
      {currentLocation?.geocode && String(currentLocation.geocode) !== 'Unknown area' && (
        <div className="absolute left-3 sm:left-4 top-14 sm:top-4 z-[990] max-w-[220px] sm:max-w-xs rounded-lg border border-blue-200 bg-white/95 px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-lg backdrop-blur-sm dark:border-blue-800/60 dark:bg-surface-900/95">
          <p className="text-[10px] sm:text-2xs text-surface-500 dark:text-surface-400">
            At <span className="font-semibold text-surface-800 dark:text-surface-100">
              {currentLocation.timestamp ? formatDateTime(currentLocation.timestamp) : 'this time'}
            </span>, the suspect was around
          </p>
          <p className="mt-0.5 text-xs sm:text-sm font-semibold text-blue-700 dark:text-blue-300 truncate">
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

  return mapNode
}

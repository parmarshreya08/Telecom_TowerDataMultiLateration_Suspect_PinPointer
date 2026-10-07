/**
 * Map basemap themes supported across E-Rakshak.
 *
 * IMPORTANT: every provider here is usable WITHOUT an API key.
 * CARTO's public basemaps (basemaps.cartocdn.com) now watermark keyless
 * requests with "API KEY REQUIRED", so they are intentionally NOT used.
 *
 * Providers:
 *  - Esri ArcGIS Online "Canvas" / "World Imagery" / "World Topo" tile services
 *  - OpenStreetMap standard tiles
 */

export interface MapThemeConfig {
  id: string
  name: string
  url: string
  attribution: string
  /** Optional second layer drawn above the base (e.g. transparent labels). */
  overlayUrl?: string
  overlayAttribution?: string
  subdomains?: string[] | string
  /** Leaflet maxZoom (how far the user can zoom). */
  maxZoom: number
  /** Highest zoom the tile server actually serves; beyond this Leaflet upscales. */
  maxNativeZoom?: number
  description: string
  badge: string
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const ESRI_ATTR =
  '&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export const MAP_THEMES: Record<string, MapThemeConfig> = {
  dark: {
    id: 'dark',
    name: 'Tactical Dark',
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    overlayUrl: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    overlayAttribution: '&copy; Esri',
    attribution: ESRI_ATTR,
    maxZoom: 19,
    maxNativeZoom: 16,
    description: 'Dark high-contrast canvas for RF multilateration overlays',
    badge: 'Tactical Night',
  },
  satellite: {
    id: 'satellite',
    name: 'Satellite Imagery',
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    overlayUrl: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    overlayAttribution: '&copy; Esri',
    attribution: ESRI_ATTR,
    maxZoom: 19,
    maxNativeZoom: 19,
    description: 'True-color satellite imagery with place & boundary overlay',
    badge: 'Satellite',
  },
  streets: {
    id: 'streets',
    name: 'Street Map',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19,
    maxNativeZoom: 19,
    description: 'Standard street grid with building footprints and road names',
    badge: 'Streets',
  },
  terrain: {
    id: 'terrain',
    name: 'Terrain & Topography',
    url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_ATTR,
    maxZoom: 19,
    maxNativeZoom: 19,
    description: 'Topographic relief and contour context for terrain-aware analysis',
    badge: 'Topography',
  },
}

export const DEFAULT_MAP_THEME = 'dark'

export function getMapTheme(id?: string): MapThemeConfig {
  if (id && MAP_THEMES[id]) {
    return MAP_THEMES[id]
  }
  return MAP_THEMES[DEFAULT_MAP_THEME]
}

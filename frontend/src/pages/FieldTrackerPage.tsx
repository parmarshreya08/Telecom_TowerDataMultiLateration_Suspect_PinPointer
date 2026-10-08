import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import { Loader2, Navigation, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { apiClient } from '@/services/api'
import { DEFAULT_MAP_CENTER } from '@/constants'
import 'leaflet/dist/leaflet.css'
import { useMapTheme } from '@/hooks/useMapTheme'
import { MapThemeSwitcher } from '@/components/map/MapThemeSwitcher'

interface LocationUpdate {
  lat: number
  lng: number
  timestamp: string
  state: 'MOVING' | 'STATIONARY'
}

export default function FieldTrackerPage() {
  const { token } = useParams<{ token: string }>()
  const { activeTheme } = useMapTheme()
  const [isValidating, setIsValidating] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [caseId, setCaseId] = useState<string | null>(null)
  
  const [locations, setLocations] = useState<LocationUpdate[]>([])
  const [currentState, setCurrentState] = useState<'MOVING' | 'STATIONARY'>('STATIONARY')
  
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    // 1. Resolve token (relative URL → vite proxy in dev, same-origin in prod).
    const resolveToken = async () => {
      if (!token) {
        setError('Missing tracking link.')
        setIsValidating(false)
        return
      }
      try {
        const { data } = await apiClient.get(`/api/v1/live-tracking/resolve-token/${encodeURIComponent(token)}`)
        setCaseId(data.case_id)
      } catch {
        setError('Invalid or expired tracking link.')
      } finally {
        setIsValidating(false)
      }
    }

    resolveToken()
  }, [token])

  useEffect(() => {
    if (!caseId || !token) return

    // 2. Connect to WebSocket (same-origin → vite proxy in dev).
    // Token is encoded: raw JWT interpolation breaks the query on odd chars.
    const pageIsHttps = window.location.protocol === 'https:'
    const wsUrlBase =
      (pageIsHttps ? 'wss://' : 'ws://') + window.location.host
    const ws = new WebSocket(
      `${wsUrlBase}/api/ws/tracking/${encodeURIComponent(caseId)}?token=${encodeURIComponent(token)}`
    )

    ws.onopen = () => {
      console.log('Connected to live tracking')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'live_location_update' && data.case_id === caseId) {
          const newLoc: LocationUpdate = {
            lat: data.lat,
            lng: data.lng,
            timestamp: data.timestamp,
            state: data.state
          }
          // Bounded buffer — an unbounded trail freezes the field phone.
          setLocations(prev => [...prev.slice(-499), newLoc])
          setCurrentState(data.state)
        }
      } catch (e) {
        console.error('Error parsing WS message', e)
      }
    }

    ws.onerror = (e) => {
      console.error('WebSocket error', e)
    }

    ws.onclose = () => {
      console.log('WebSocket closed')
    }
    
    wsRef.current = ws
    
    return () => {
      ws.close()
    }
  }, [caseId, token])

  if (isValidating) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-4 text-sm text-gray-600">Validating tracking link...</p>
        </div>
      </div>
    )
  }

  if (error || !caseId) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md bg-white">
          <div className="flex flex-col items-center p-6 text-center">
            <AlertTriangle className="h-10 w-10 text-red-500 mb-3" />
            <h2 className="text-xl font-bold text-surface-900 dark:text-white mb-2">Invalid Tracking Link</h2>
            <p className="text-surface-600 dark:text-surface-400 text-sm">The tracking token is invalid or has expired.</p>
          </div>
        </Card>
      </div>
    )
  }

  const latestLocation = locations[locations.length - 1]
  const center: [number, number] = latestLocation
    ? [latestLocation.lat, latestLocation.lng]
    : [...DEFAULT_MAP_CENTER] // Surat operating area

  return (
    <div className="flex h-screen w-full flex-col bg-white">
      {/* Header Mobile Friendly */}
      <div className="absolute top-0 w-full flex items-center justify-between border-b border-surface-200/50 px-4 py-3 shadow-sm z-[1000] bg-white/70 backdrop-blur-md dark:bg-surface-900/70 dark:border-surface-700/50">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Navigation className="h-5 w-5 text-blue-600" />
            E-Rakshak Live
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-300">Case ID: {caseId.substring(0, 8)}...</p>
        </div>
        
        <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
          currentState === 'MOVING' ? 'bg-green-100/80 text-green-700 dark:bg-green-900/50 dark:text-green-300' : 'bg-gray-100/80 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300'
        }`}>
          {currentState}
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative z-0 h-full w-full">
        {/* Floating Map Theme Switcher */}
        <div className="absolute top-4 right-4 z-[1000] pointer-events-auto">
          <MapThemeSwitcher />
        </div>

        <MapContainer 
          center={center} 
          zoom={15} 
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
          
          {/* Path */}
          {locations.length > 1 && (
            <Polyline 
              positions={locations.map(loc => [loc.lat, loc.lng])} 
              color="blue" 
              weight={4}
              opacity={0.7}
            />
          )}

          {/* Current Position */}
          {latestLocation && (
            <Marker position={[latestLocation.lat, latestLocation.lng]}>
              <Popup>
                <strong>Last Updated:</strong><br />
                {new Date(latestLocation.timestamp).toLocaleTimeString()}<br />
                State: {latestLocation.state}
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Overlay Data when no locations yet */}
        {locations.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/5 z-[1000] pointer-events-none">
            <Card className="pointer-events-auto bg-white/90 backdrop-blur">
              <div className="p-4 flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <span className="text-sm font-medium">Waiting for TSP pings...</span>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

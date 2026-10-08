import { useState, useEffect } from 'react'
import { Navigation, Play, Square, MapPin, AlertCircle, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { socketService } from '@/services/socket'
import { liveTrackingApi } from '@/services/api'
import { InvestigationMap } from '@/components/map/InvestigationMap'
import type { GeoJSONFeatureCollection } from '@/types'
import { copyToClipboard } from '@/utils'

export default function LiveTrackingPage() {
  const [imsi, setImsi] = useState('')
  const [isTracking, setIsTracking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [demoLink, setDemoLink] = useState<string | null>(null)
  const [fixes, setFixes] = useState<any[]>([])
  const [copied, setCopied] = useState(false)
  
  // Use a derived geojson object for the map
  const geojson: GeoJSONFeatureCollection | null = fixes.length > 0 ? {
    type: 'FeatureCollection',
    features: fixes.map((f, i) => ({
      type: 'Feature',
      id: String(i),
      geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
      properties: {
        timestamp: f.timestamp,
        subscriber_identifier: f.imsi,
        confidence_radius_meters: 50,
      }
    }))
  } : null

  // Connect WebSocket when tracking
  useEffect(() => {
    if (!isTracking || !imsi) return
    const caseId = `LIVE-${imsi}`
    socketService.connect(caseId)
    
    const unsub = socketService.on<any>('tracking:fix', (payload) => {
      if (payload) {
        setFixes(prev => [...prev, payload])
      }
    })
    
    return () => {
      unsub()
      socketService.disconnect()
    }
  }, [isTracking, imsi])

  const handleStart = async () => {
    if (!imsi) return
    setLoading(true)
    setError(null)
    setFixes([])
    try {
      const res = await liveTrackingApi.startTracking(imsi)
      setDemoLink(res.demo_link)
      setIsTracking(true)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to start tracking')
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    if (!imsi) return
    setLoading(true)
    try {
      await liveTrackingApi.stopTracking(imsi)
      setIsTracking(false)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to stop tracking')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = () => {
    if (demoLink) {
      const fullUrl = `${window.location.origin}${demoLink}`
      copyToClipboard(fullUrl).then(ok => {
        if (ok) {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }
      })
    }
  }

  const currentFix = fixes.length > 0 ? fixes[fixes.length - 1] : null

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col lg:flex-row bg-surface-50 dark:bg-surface-900">
      {/* Left Sidebar */}
      <div className="w-full lg:w-[350px] border-b lg:border-b-0 lg:border-r border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-800 p-4 flex flex-col gap-4 z-10 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Navigation className="h-5 w-5 text-primary-500" />
          <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100">Live Tracking</h2>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm border border-red-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Target IMSI</CardTitle>
          </CardHeader>
          <div className="px-4 pb-4 space-y-3">
            <input
              type="text"
              value={imsi}
              onChange={(e) => setImsi(e.target.value)}
              disabled={isTracking || loading}
              placeholder="e.g. 404450123456789"
              className="w-full rounded-md border border-surface-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
            />
            
            {!isTracking ? (
              <Button
                variant="primary"
                className="w-full justify-center"
                onClick={handleStart}
                disabled={!imsi || loading}
                loading={loading}
                icon={<Play className="h-4 w-4" />}
              >
                Start Tracking
              </Button>
            ) : (
              <Button
                variant="danger"
                className="w-full justify-center"
                onClick={handleStop}
                disabled={loading}
                loading={loading}
                icon={<Square className="h-4 w-4" />}
              >
                Stop Tracking
              </Button>
            )}
          </div>
        </Card>

        {isTracking && demoLink && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Ground Officer Link</CardTitle>
            </CardHeader>
            <div className="px-4 pb-4 space-y-2 text-xs">
              <p className="text-surface-500">Share this link with field officers for a distraction-free view.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}${demoLink}`}
                  className="flex-1 rounded-md border border-surface-300 px-2 py-1.5 bg-surface-50 text-surface-600 dark:bg-surface-900 dark:border-surface-700 dark:text-surface-300 truncate"
                />
                <Button size="sm" variant="secondary" onClick={handleCopyLink}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {isTracking && (
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recent Fixes ({fixes.length})</CardTitle>
            </CardHeader>
            <div className="px-4 pb-4 flex-1 overflow-y-auto space-y-2">
              {fixes.slice().reverse().map((fix, idx) => (
                <div key={idx} className="bg-surface-50 dark:bg-surface-900 border border-surface-100 dark:border-surface-700 p-2 rounded text-xs flex gap-3 items-start">
                  <div className="mt-0.5"><MapPin className="h-3.5 w-3.5 text-primary-500" /></div>
                  <div>
                    <div className="font-semibold">{new Date(fix.timestamp).toLocaleTimeString()}</div>
                    <div className="text-surface-500">Lat: {fix.lat.toFixed(6)}</div>
                    <div className="text-surface-500">Lng: {fix.lng.toFixed(6)}</div>
                    <div className="text-surface-400 mt-1 capitalize text-[10px]">State: {fix.state}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Map Area */}
      <div className="flex-1 relative bg-surface-100 dark:bg-surface-900 min-h-[500px] lg:min-h-0">
        <InvestigationMap
          geojson={geojson}
          heatPoints={[]}
          towers={[]}
          centerOn={
            currentFix ? { latitude: currentFix.lat, longitude: currentFix.lng } : undefined
          }
        />
        
        {isTracking && (
          <div className="absolute top-4 right-4 z-[400] bg-white/90 dark:bg-surface-800/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm border border-surface-200 dark:border-surface-700 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            <span className="text-xs font-semibold text-surface-700 dark:text-surface-200">
              Live Connected
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

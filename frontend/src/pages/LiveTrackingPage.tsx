import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Navigation, Play, Square, MapPin, AlertCircle, Copy, Check, Plus, Radio, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { socketService } from '@/services/socket'
import { investigationApi, liveTrackingApi } from '@/services/api'
import { InvestigationMap } from '@/components/map/InvestigationMap'
import { useMapTheme } from '@/hooks/useMapTheme'
import { generateCaseNumber, extractErrorMessage, cn } from '@/utils'
import type { GeoJSONFeatureCollection, Investigation } from '@/types'
import { copyToClipboard } from '@/utils'

interface LiveFix {
  lat: number
  lng: number
  timestamp: string
  state: 'MOVING' | 'STATIONARY'
  imsi?: string
}

const digitsOnly = (v: string) => v.replace(/\D/g, '')

export default function LiveTrackingPage() {
  const [cases, setCases] = useState<Investigation[]>([])
  const [loadingCases, setLoadingCases] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [fixes, setFixes] = useState<LiveFix[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [demoLink, setDemoLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newNumber, setNewNumber] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  // Satellite basemap while on this page (Image 1 look); restore on leave.
  const { themeId, setMapTheme } = useMapTheme()
  const prevTheme = useRef<string | null>(null)
  useEffect(() => {
    prevTheme.current = themeId
    setMapTheme('satellite')
    return () => {
      if (prevTheme.current) setMapTheme(prevTheme.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchCases = useCallback(async () => {
    setLoadingCases(true)
    try {
      const data = await investigationApi.list({ page_size: 100 })
      setCases(data.items ?? [])
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoadingCases(false)
    }
  }, [])

  useEffect(() => {
    fetchCases()
  }, [fetchCases])

  // Refresh per-case live status once cases load.
  useEffect(() => {
    if (cases.length === 0) return
    let cancelled = false
    ;(async () => {
      for (const c of cases) {
        try {
          const st = await liveTrackingApi.getStatus(c.id)
          if (!cancelled && st.active.length > 0) {
            setActiveId(c.id)
            setSelectedId((s) => s ?? c.id)
            if (st.demo_link) {
              setDemoLink(st.demo_link)
            }
            break
          }
        } catch {
          // backend may be unreachable — ignore per-case
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cases])

  const selected = useMemo(
    () => cases.find((c) => c.id === selectedId) ?? null,
    [cases, selectedId]
  )
  const selectedDigits = selected ? digitsOnly(selected.mobile_number ?? '') : ''

  // Live fixes for the active case.
  const geojson: GeoJSONFeatureCollection | null = useMemo(() => {
    if (fixes.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: fixes.map((f, i) => ({
        type: 'Feature',
        id: String(i),
        geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
        properties: {
          timestamp: f.timestamp,
          subscriber_identifier: f.imsi ?? selectedDigits,
          confidence_radius_meters: 50,
        },
      })),
    }
  }, [fixes, selectedDigits])

  // WebSocket for the active case only.
  useEffect(() => {
    if (!activeId) return
    socketService.connect(activeId)
    const unsub = socketService.on<Record<string, unknown>>('tracking:fix', (payload) => {
      if (!payload || payload.case_id !== activeId) return
      const lat = Number(payload.lat)
      const lng = Number(payload.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      setFixes((prev) =>
        [
          ...prev.slice(-499),
          {
            lat,
            lng,
            timestamp: String(payload.timestamp ?? new Date().toISOString()),
            state: payload.state === 'MOVING' ? 'MOVING' : 'STATIONARY',
            imsi: typeof payload.imsi === 'string' ? payload.imsi : undefined,
          },
        ]
      )
    })
    return () => {
      unsub()
      socketService.disconnect()
    }
  }, [activeId])

  const handleSelect = async (id: string) => {
    setSelectedId(id)
    if (id === activeId && !demoLink) {
      try {
        const st = await liveTrackingApi.getStatus(id)
        if (st.demo_link) {
          setDemoLink(st.demo_link)
        }
      } catch {
        // ignore
      }
    }
  }

  const handleToggle = async (c: Investigation, on: boolean) => {
    setBusy(true)
    setError(null)
    try {
      if (on) {
        if (activeId && activeId !== c.id) {
          try {
            await liveTrackingApi.stopTracking(activeId)
          } catch {
            // best-effort
          }
        }
        const res = await liveTrackingApi.startTracking(c.id)
        setActiveId(c.id)
        setSelectedId(c.id)
        setFixes([])
        setDemoLink(res.demo_link)
      } else {
        await liveTrackingApi.stopTracking(c.id)
        if (activeId === c.id) {
          setActiveId(null)
          socketService.disconnect()
        }
        setDemoLink(null)
      }
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleCreateAndTrack = async () => {
    const digits = digitsOnly(newNumber)
    if (digits.length < 10) {
      setError('Enter a valid 10-digit mobile number.')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const created = await investigationApi.create({
        case_name: newName.trim() || `Live Trace ${digits}`,
        case_number: generateCaseNumber(),
        suspect_name: newName.trim(),
        mobile_number: digits,
        description: `Live tracking case for ${digits}.`,
      })
      await fetchCases()
      setNewNumber('')
      setNewName('')
      setShowNew(false)
      await handleToggle(created, true)
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  const handleCopyLink = () => {
    if (demoLink) {
      copyToClipboard(`${window.location.origin}${demoLink}`).then((ok) => {
        if (ok) {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        }
      })
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col lg:flex-row bg-surface-50 dark:bg-surface-900">
      {/* Left panel — investigations with per-case live toggle */}
      <div className="w-full lg:w-[380px] shrink-0 border-b lg:border-b-0 lg:border-r border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-center gap-2">
          <Navigation className="h-5 w-5 text-primary-500" />
          <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100">Live Tracking</h2>
          {activeId && (
            <span className="ml-auto rounded bg-green-500/15 px-2 py-0.5 text-[11px] font-bold text-green-600 dark:text-green-400">
              LIVE
            </span>
          )}
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm border border-red-200 flex items-start gap-2 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-surface-500">
            Investigations
          </span>
          <button
            onClick={() => setShowNew((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-500"
          >
            <Plus className="h-3.5 w-3.5" /> New number
          </button>
        </div>

        {showNew && (
          <Card className="p-3 space-y-2">
            <p className="text-xs text-surface-500">
              Enter the fugitive&apos;s mobile number — a case is created for it, like the
              normal CDR flow, then live tracking starts on that case.
            </p>
            <input
              type="tel"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              placeholder="e.g. 9876543210"
              className="w-full rounded-md border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900"
            />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Suspect name (optional)"
              className="w-full rounded-md border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900"
            />
            <Button
              variant="primary"
              className="w-full justify-center"
              loading={creating}
              onClick={handleCreateAndTrack}
            >
              Create case & start tracking
            </Button>
          </Card>
        )}

        {loadingCases ? (
          <p className="text-sm text-surface-500">Loading investigations…</p>
        ) : cases.length === 0 ? (
          <p className="text-sm text-surface-500">
            No investigations yet. Create one from a mobile number above.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {cases.map((c) => {
              const isActive = c.id === activeId
              const isSelected = c.id === (selectedId ?? activeId)
              const hasNumber = digitsOnly(c.mobile_number ?? '').length >= 10
              return (
                <div
                  key={c.id}
                  className={cn(
                    'rounded-lg border p-3 transition-colors',
                    isActive
                      ? 'border-green-500/50 bg-green-50/50 dark:bg-green-900/10'
                      : isSelected
                        ? 'border-primary-500/50'
                        : 'border-surface-200 dark:border-surface-800'
                  )}
                >
                  <button
                    onClick={() => handleSelect(c.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate">
                        {c.case_name || c.case_number || c.id}
                      </span>
                      {isActive && <Radio className="h-3.5 w-3.5 text-green-500 animate-pulse" />}
                    </div>
                    <div className="mt-0.5 text-xs text-surface-500 truncate">
                      {[c.case_number, c.suspect_name, c.mobile_number].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Link
                      to={`/investigations/${c.id}`}
                      className="text-xs text-primary-600 hover:text-primary-500"
                    >
                      Open investigation
                    </Link>
                    <label className="flex items-center gap-2 text-xs font-medium text-surface-600 dark:text-surface-300">
                      <span>{isActive ? 'Live on' : 'Live off'}</span>
                      <button
                        role="switch"
                        aria-checked={isActive}
                        aria-label={`Live tracking for ${c.case_name || c.id}`}
                        disabled={busy || (!hasNumber && !isActive)}
                        title={!hasNumber ? 'Case needs a mobile number' : undefined}
                        onClick={() => handleToggle(c, !isActive)}
                        className={cn(
                          'relative h-6 w-11 rounded-full transition-colors disabled:opacity-40',
                          isActive ? 'bg-green-500' : 'bg-surface-300 dark:bg-surface-700'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                            isActive ? 'left-[22px]' : 'left-0.5'
                          )}
                        />
                      </button>
                    </label>
                  </div>
                  {!hasNumber && !isActive && (
                    <p className="mt-1 text-[11px] text-surface-400">
                      Add a mobile number to this case to enable live tracking.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Active-case controls (Image 1 left card) */}
        {selected && (
          <Card className="p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-surface-500">
              Target number
            </div>
            <div className="rounded-md border border-surface-300 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 px-3 py-2 text-sm font-mono">
              {selectedDigits || '—'}
            </div>
            {activeId === selected.id ? (
              <Button
                variant="danger"
                className="w-full justify-center"
                loading={busy}
                onClick={() => handleToggle(selected, false)}
                icon={<Square className="h-4 w-4" />}
              >
                Stop Tracking
              </Button>
            ) : (
              <Button
                variant="primary"
                className="w-full justify-center"
                loading={busy}
                disabled={!selectedDigits}
                onClick={() => handleToggle(selected, true)}
                icon={<Play className="h-4 w-4" />}
              >
                Start Tracking
              </Button>
            )}
            {activeId === selected.id && demoLink && (
              <div className="space-y-1.5 pt-1 border-t border-surface-200 dark:border-surface-800">
                <div className="flex items-center justify-between text-xs text-surface-500">
                  <span>Ground-officer link <span className="text-surface-400">(lightweight field view)</span></span>
                  <span className="text-[10px] text-emerald-500 font-medium">Valid 2 hrs</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    onFocus={(e) => e.target.select()}
                    value={`${window.location.origin}${demoLink}`}
                    className="flex-1 min-w-0 rounded-md border border-surface-300 px-2.5 py-1.5 text-xs bg-surface-50 dark:bg-surface-900 dark:border-surface-700 font-mono text-surface-700 dark:text-surface-300 select-all"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleCopyLink}
                    title="Copy link to clipboard"
                    className="shrink-0"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <a
                    href={`${window.location.origin}${demoLink}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center justify-center p-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white transition-colors shadow-sm"
                    title="Open live tracking view in new tab"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            )}
          </Card>
        )}

        {activeId && fixes.length > 0 && (
          <div className="text-xs text-surface-500 flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {fixes.length} live fixes
          </div>
        )}
      </div>

      {/* Map area — InvestigationMap chrome (Path / Rogue / Ellipse / Sectors / Heatmap) */}
      <div className="flex-1 relative bg-surface-100 dark:bg-surface-900 min-h-[500px] lg:min-h-0">
        <InvestigationMap
          pathPoints={fixes.map((f) => ({
            latitude: f.lat,
            longitude: f.lng,
            timestamp: f.timestamp,
            accuracy_meters: 50,
            algorithm: 'Multilateration',
          }))}
          towers={[]}
          onCenterRequest={() => {}}
          centerTrigger={false}
          geojson={geojson ?? undefined}
        />
        {!activeId && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="rounded-lg bg-black/60 px-4 py-2 text-sm text-white backdrop-blur">
              Select an investigation and toggle live tracking on
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

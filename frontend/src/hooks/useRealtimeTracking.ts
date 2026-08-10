// ============================================================
// E-Rakshak — Realtime Tracking Hook
// All real-time data flows through the engine abstraction.
// TODO: Replace simulation with actual engine once backend WebSocket
//       and trilateration endpoints are implemented.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  initializeEngine,
  runEngine,
  stopEngine,
  resumeEngine,
  destroyEngine,
  subscribeEngine,
} from '@/engine/engine'
import { trackingApi } from '@/services/api'
import type {
  LocalizationResult,
  PathPoint,
  AlgorithmResult,
  TrackingSettings,
  TrackingStatus,
} from '@/types'

interface RealtimeTrackingState {
  currentLocation: LocalizationResult | null
  path: PathPoint[]
  algorithmResults: AlgorithmResult[]
  trackingStatus: TrackingStatus
  isLoading: boolean
  error: string | null
  lastUpdated: string | null
}



export function useRealtimeTracking(investigationId: string) {
  const [state, setState] = useState<RealtimeTrackingState>({
    currentLocation:  null,
    path:             [],
    algorithmResults: [],
    trackingStatus:   'Idle',
    isLoading:        false,
    error:            null,
    lastUpdated:      null,
  })

  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const isLiveRef  = useRef(false)

  useEffect(() => {
    initializeEngine(investigationId)

    // Subscribe to real-time location updates from engine
    // TODO: These will fire once backend WebSocket is implemented
    const unsubLocation = subscribeEngine('tracking:location_update', (data) => {
      const loc = data as LocalizationResult
      setState((s) => ({
        ...s,
        currentLocation: loc,
        lastUpdated: new Date().toISOString(),
        path: [
          ...s.path,
          {
            latitude:        loc.latitude,
            longitude:       loc.longitude,
            timestamp:       loc.timestamp,
            accuracy_meters: loc.accuracy_meters,
            algorithm:       loc.algorithm_used,
          },
        ],
      }))
    })

    const unsubTower      = subscribeEngine('tracking:tower_change', () => {
      // TODO: Refresh tower data on tower change event
    })
    const unsubSignalLost = subscribeEngine('tracking:signal_lost', () => {
      setState((s) => ({ ...s, trackingStatus: 'Paused' }))
      isLiveRef.current = false
    })
    const unsubResumed    = subscribeEngine('tracking:resumed', () => {
      setState((s) => ({ ...s, trackingStatus: 'Live' }))
      isLiveRef.current = true
    })

    return () => {
      unsubLocation()
      unsubTower()
      unsubSignalLost()
      unsubResumed()
      destroyEngine()
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [investigationId])

  // ── Live polling via API ────────────────────────────────────
  const startLivePolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    isLiveRef.current = true

    pollRef.current = setInterval(async () => {
      if (!isLiveRef.current) return
      try {
        const res = await trackingApi.runLocalization(investigationId)
        const geojson = res.geojson
        const pointFeatures = geojson?.features.filter((f: { geometry: { type: string } }) => f.geometry.type === 'Point') ?? []
        if (pointFeatures.length === 0) return

        const lastF = pointFeatures[pointFeatures.length - 1]
        const coords = (lastF.geometry as { coordinates: [number, number] }).coordinates
        const next: LocalizationResult = {
          latitude: coords[1],
          longitude: coords[0],
          raw_latitude: coords[1],
          raw_longitude: coords[0],
          velocity_m_s: 0,
          clock_bias_meters: 0,
          residual_rms: Number(lastF.properties?.residual_rms || 0),
          gdop: Number(lastF.properties?.gdop || 0),
          adaptive_R_scale: 1,
          adaptive_Q_scale: 1,
          geojson_heatmap: geojson,
          timestamp: String(lastF.properties?.timestamp || new Date().toISOString()),
          accuracy_meters: Number(lastF.properties?.confidence_radius_meters || 100),
          algorithm_used: 'Multilateration',
          confidence: 0.95,
        }

        setState((s) => ({
          ...s,
          currentLocation: next,
          lastUpdated: new Date().toISOString(),
          path: [
            ...s.path.slice(-49),
            {
              latitude: next.latitude,
              longitude: next.longitude,
              timestamp: next.timestamp,
              accuracy_meters: next.accuracy_meters,
              algorithm: next.algorithm_used,
            },
          ],
        }))
      } catch {
        // silently skip failed polls; UI shows stale data
      }
    }, 4000)
  }, [investigationId])

  const startTracking = useCallback(
    async (settings: TrackingSettings) => {
      setState((s) => ({ ...s, isLoading: true, error: null, trackingStatus: 'Processing' }))
      try {
        await runEngine(investigationId, settings)

        // Run real multilateration engine on backend
        const res = await trackingApi.runLocalization(investigationId)
        const geojson = res.geojson
        const pointFeatures = geojson?.features.filter((f: { geometry: { type: string } }) => f.geometry.type === 'Point') ?? []

        let locResult: LocalizationResult | null = null
        let points: PathPoint[] = []

        if (pointFeatures.length > 0) {
          const lastF = pointFeatures[pointFeatures.length - 1]
          const coords = (lastF.geometry as { coordinates: [number, number] }).coordinates
          locResult = {
            latitude: coords[1],
            longitude: coords[0],
            raw_latitude: coords[1],
            raw_longitude: coords[0],
            velocity_m_s: 0,
            clock_bias_meters: 0,
            residual_rms: Number(lastF.properties?.residual_rms || 0),
            gdop: Number(lastF.properties?.gdop || 0),
            adaptive_R_scale: 1,
            adaptive_Q_scale: 1,
            geojson_heatmap: geojson,
            timestamp: String(lastF.properties?.timestamp || new Date().toISOString()),
            accuracy_meters: Number(lastF.properties?.confidence_radius_meters || 100),
            algorithm_used: 'Multilateration',
            confidence: 0.95,
          }

          points = pointFeatures.map((f) => {
            const c = (f.geometry as { coordinates: [number, number] }).coordinates
            return {
              latitude: c[1],
              longitude: c[0],
              timestamp: String(f.properties?.timestamp || new Date().toISOString()),
              accuracy_meters: Number(f.properties?.confidence_radius_meters || 100),
              algorithm: 'Multilateration' as const,
            }
          })
        }

        setState((s) => ({
          ...s,
          isLoading: false,
          trackingStatus: 'Completed',
          currentLocation: locResult,
          algorithmResults: [
            {
              algorithm: 'Multilateration',
              status: 'success',
              execution_time_ms: 120,
              accuracy_meters: locResult?.accuracy_meters ?? 100,
              residual_rms: locResult?.residual_rms ?? 0,
              gdop: locResult?.gdop ?? 0,
            },
          ],
          lastUpdated: new Date().toISOString(),
          path: points,
        }))
      } catch (err) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? (err as Error)?.message ?? 'Failed to execute localization engine'
        setState((s) => ({
          ...s,
          isLoading: false,
          error: msg,
          trackingStatus: 'Error',
        }))
      }
    },
    [investigationId]
  )


  const pauseTracking = useCallback(async () => {
    await stopEngine(investigationId)
    isLiveRef.current = false
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setState((s) => ({ ...s, trackingStatus: 'Paused' }))
  }, [investigationId])

  const resumeTracking = useCallback(async () => {
    await resumeEngine(investigationId)
    isLiveRef.current = true
    startLivePolling()
    setState((s) => ({ ...s, trackingStatus: 'Live' }))
  }, [investigationId, startLivePolling])

  return {
    ...state,
    startTracking,
    pauseTracking,
    resumeTracking,
    isLive: state.trackingStatus === 'Live',
  }
}

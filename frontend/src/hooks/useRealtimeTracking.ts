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
import type {
  LocalizationResult,
  PathPoint,
  AlgorithmResult,
  TrackingSettings,
  TrackingStatus,
} from '@/types'
import { MOCK_LOCALIZATION, MOCK_ALGORITHM_RESULTS } from '@/mock/tracking'

interface RealtimeTrackingState {
  currentLocation: LocalizationResult | null
  path: PathPoint[]
  algorithmResults: AlgorithmResult[]
  trackingStatus: TrackingStatus
  isLoading: boolean
  error: string | null
  lastUpdated: string | null
}

// Small random drift to simulate movement (mock only)
function drift(val: number, scale = 0.0003): number {
  return val + (Math.random() - 0.5) * scale
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

  // ── Mock live simulation ───────────────────────────────────
  // TODO: Remove once real engine pushes location updates via socket
  const startMockSimulation = useCallback((_base: LocalizationResult) => {
    if (pollRef.current) clearInterval(pollRef.current)
    isLiveRef.current = true

    pollRef.current = setInterval(() => {
      if (!isLiveRef.current) return
      setState((s) => {
        if (!s.currentLocation) return s
        const prev = s.currentLocation
        const next: LocalizationResult = {
          ...prev,
          latitude:       drift(prev.latitude, 0.0004),
          longitude:      drift(prev.longitude, 0.0004),
          raw_latitude:   drift(prev.raw_latitude, 0.0005),
          raw_longitude:  drift(prev.raw_longitude, 0.0005),
          accuracy_meters: Math.max(40, prev.accuracy_meters - Math.random() * 2),
          velocity_m_s:   Math.abs(drift(prev.velocity_m_s, 0.3)),
          confidence:     Math.min(0.99, prev.confidence + (Math.random() - 0.3) * 0.01),
          timestamp:      new Date().toISOString(),
        }
        return {
          ...s,
          currentLocation: next,
          lastUpdated:     new Date().toISOString(),
          path: [
            ...s.path.slice(-49), // keep last 50 points
            {
              latitude:        next.latitude,
              longitude:       next.longitude,
              timestamp:       next.timestamp,
              accuracy_meters: next.accuracy_meters,
              algorithm:       next.algorithm_used,
            },
          ],
        }
      })
    }, 4000) // update every 4 seconds
  }, [])

  const startTracking = useCallback(
    async (settings: TrackingSettings) => {
      setState((s) => ({ ...s, isLoading: true, error: null, trackingStatus: 'Processing' }))
      try {
        await runEngine(investigationId, settings)

        // TODO: Remove mock data + simulation once backend engine is implemented
        setState((s) => ({
          ...s,
          isLoading:        false,
          trackingStatus:   'Live',
          currentLocation:  MOCK_LOCALIZATION,
          algorithmResults: MOCK_ALGORITHM_RESULTS,
          lastUpdated:      new Date().toISOString(),
          path: [
            {
              latitude:        MOCK_LOCALIZATION.latitude,
              longitude:       MOCK_LOCALIZATION.longitude,
              timestamp:       MOCK_LOCALIZATION.timestamp,
              accuracy_meters: MOCK_LOCALIZATION.accuracy_meters,
              algorithm:       MOCK_LOCALIZATION.algorithm_used,
            },
          ],
        }))

        // Start mock position simulation
        startMockSimulation(MOCK_LOCALIZATION)
      } catch (err) {
        setState((s) => ({
          ...s,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to start tracking',
          trackingStatus: 'Error',
        }))
      }
    },
    [investigationId, startMockSimulation]
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
    setState((s) => {
      if (s.currentLocation) startMockSimulation(s.currentLocation)
      return { ...s, trackingStatus: 'Live' }
    })
  }, [investigationId, startMockSimulation])

  return {
    ...state,
    startTracking,
    pauseTracking,
    resumeTracking,
    isLive: state.trackingStatus === 'Live',
  }
}

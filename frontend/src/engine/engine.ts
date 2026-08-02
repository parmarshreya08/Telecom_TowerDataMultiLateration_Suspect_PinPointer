// ============================================================
// E-Rakshak — Investigation Engine Abstraction
//
// Every real-time component must communicate ONLY through
// this engine abstraction. A teammate will implement the
// actual engine logic later.
//
// TODO: Implement actual engine once backend real-time
//       tracking endpoints (WebSocket + trilateration) are ready.
// ============================================================

import { socketService } from '@/services/socket'
import type {
  LiveTrackingData,
  LocalizationResult,
  AlgorithmResult,
  TrackingSettings,
  SocketEventType,
} from '@/types'

type EngineEventCallback<T = unknown> = (data: T) => void
type EngineUnsubscribeFn = () => void

// Engine internal state
let engineInitialized = false
let currentInvestigationId: string | null = null

// ── Core lifecycle ─────────────────────────────────────────

/**
 * Initialize the investigation engine for a given investigation.
 * TODO: Connect to backend WebSocket and load initial state.
 */
export function initializeEngine(investigationId: string): void {
  if (engineInitialized && currentInvestigationId === investigationId) return

  console.info('[Engine] Initializing for investigation:', investigationId)
  currentInvestigationId = investigationId
  engineInitialized = true

  // TODO: Connect socket, load initial tracking state from backend
  socketService.connect(investigationId)
}

/**
 * Run/start the tracking engine.
 * TODO: Trigger backend trilateration pipeline.
 */
export async function runEngine(
  investigationId: string,
  settings: TrackingSettings
): Promise<void> {
  console.info('[Engine] Starting engine with settings:', settings)

  // TODO: Call trackingApi.startTracking(investigationId, settings)
  // TODO: Begin listening to socket events
  void investigationId
  void settings

  return Promise.resolve()
}

/**
 * Stop/pause the tracking engine.
 * TODO: Call backend tracking pause endpoint.
 */
export async function stopEngine(investigationId: string): Promise<void> {
  console.info('[Engine] Stopping engine for investigation:', investigationId)

  // TODO: Call trackingApi.pauseTracking(investigationId)
  void investigationId

  return Promise.resolve()
}

/**
 * Resume a paused tracking engine.
 * TODO: Call backend tracking resume endpoint.
 */
export async function resumeEngine(investigationId: string): Promise<void> {
  console.info('[Engine] Resuming engine for investigation:', investigationId)

  // TODO: Call trackingApi.resumeTracking(investigationId)
  void investigationId

  return Promise.resolve()
}

/**
 * Tear down the engine completely and disconnect socket.
 * Call this when leaving the investigation page.
 */
export function destroyEngine(): void {
  console.info('[Engine] Destroying engine')
  socketService.disconnect()
  engineInitialized = false
  currentInvestigationId = null
}

// ── Event subscription ─────────────────────────────────────

/**
 * Subscribe to location update events from the engine.
 * TODO: Wire to actual socket event 'tracking:location_update'
 */
export function subscribeEngine(
  event: SocketEventType,
  callback: EngineEventCallback
): EngineUnsubscribeFn {
  return socketService.on(event, callback)
}

/**
 * Unsubscribe from engine events.
 */
export function unsubscribeEngine(
  event: SocketEventType,
  callback: EngineEventCallback
): void {
  socketService.off(event, callback)
}

// ── Data access ────────────────────────────────────────────

/**
 * Get the current live tracking data snapshot.
 * TODO: Fetch from backend GET /api/investigations/:id/location
 */
export async function getEngineSnapshot(
  investigationId: string
): Promise<LiveTrackingData | null> {
  console.info('[Engine] Fetching snapshot for:', investigationId)
  // TODO: return trackingApi.getLocation(investigationId)
  return null
}

/**
 * Get the latest localization result computed by the trilateration engine.
 * TODO: Fetch from backend once trilateration engine is implemented.
 */
export async function getLatestLocalization(
  investigationId: string
): Promise<LocalizationResult | null> {
  console.info('[Engine] Fetching latest localization for:', investigationId)
  // TODO: return trackingApi.getLocation(investigationId)
  void investigationId
  return null
}

/**
 * Get algorithm execution results (trilateration, multilateration, Kalman).
 * TODO: Fetch from backend once algorithms are implemented.
 */
export async function getAlgorithmResults(
  investigationId: string
): Promise<AlgorithmResult[]> {
  console.info('[Engine] Fetching algorithm results for:', investigationId)
  // TODO: return trackingApi.getAlgorithmResults(investigationId)
  void investigationId
  return []
}

/**
 * Request a manual location refresh from backend.
 * TODO: Wire to backend force-refresh endpoint.
 */
export async function refreshLocation(investigationId: string): Promise<void> {
  socketService.emit('tracking:refresh', { investigation_id: investigationId })
}

// ── Engine status ──────────────────────────────────────────

export function isEngineRunning(): boolean {
  return engineInitialized && socketService.isConnected
}

export function getCurrentInvestigationId(): string | null {
  return currentInvestigationId
}

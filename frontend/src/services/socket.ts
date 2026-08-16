// ============================================================
// E-Rakshak — Native WebSocket Client Service
// Talks to the backend at /api/ws/tracking/{case_id}?token=<jwt>.
// Incoming frames are {"type": <event>, "payload": <data>} and are
// dispatched to listeners keyed by event name.
// ============================================================

import { WS_BASE_URL } from '@/constants'
import type { SocketEventType } from '@/types'

type EventCallback<T = unknown> = (data: T) => void
type ListenerMap = Map<string, Set<EventCallback>>

const TOKEN_KEY = 'erakshak_access_token'

class ErakshakSocketService {
  private ws: WebSocket | null = null
  private listeners: ListenerMap = new Map()
  private investigationId?: string
  private reconnectAttempts = 0
  private reconnectTimer: number | null = null
  private readonly maxReconnectAttempts = 5

  connect(investigationId?: string): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.investigationId = investigationId

    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return // not signed in — stay disconnected

    const base =
      WS_BASE_URL ||
      (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host
    const path = investigationId ? `/api/ws/tracking/${encodeURIComponent(investigationId)}` : ''
    const url = `${base}${path}?token=${encodeURIComponent(token)}`

    this.ws = new WebSocket(url)
    this.registerCoreHandlers()
  }

  disconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.listeners.clear()
    this.reconnectAttempts = 0
  }

  on<T = unknown>(event: SocketEventType, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback as EventCallback)
    return () => this.off(event, callback as EventCallback)
  }

  off(event: SocketEventType, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback)
  }

  emit<T = unknown>(event: string, data?: T): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: event, payload: data ?? null }))
    }
    // ponytail: silent drop offline, add queue if needed
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  get socketId(): string | undefined {
    return undefined
  }

  private registerCoreHandlers(): void {
    if (!this.ws) return

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.dispatch('connect', undefined)
    }

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        if (msg && typeof msg.type === 'string') {
          this.dispatch(msg.type, msg.payload)
        }
      } catch {
        // non-JSON frame — ignore
      }
    }

    this.ws.onclose = (evt) => {
      this.ws = null
      this.dispatch('disconnect', undefined)
      // 4401 = unauthorised (expired/revoked token) — do not retry.
      if (evt.code !== 4401 && this.investigationId && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        this.reconnectTimer = window.setTimeout(() => {
          this.connect(this.investigationId)
        }, 2000)
      }
    }

    this.ws.onerror = () => {
      // handled by onclose
    }
  }

  private dispatch(event: string, payload: unknown): void {
    this.listeners.get(event)?.forEach((cb) => cb(payload))
  }
}

export const socketService = new ErakshakSocketService()
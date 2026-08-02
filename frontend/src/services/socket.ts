// ============================================================
// E-Rakshak — Socket.io Client Service
// TODO: Connect to backend WebSocket server once implemented
// All methods are frontend-only stubs.
// ============================================================

import { io, Socket } from 'socket.io-client'
import { WS_BASE_URL, LS_KEYS } from '@/constants'
import type { SocketEventType } from '@/types'

type EventCallback<T = unknown> = (data: T) => void
type ListenerMap = Map<string, Set<EventCallback>>

class ErakshakSocketService {
  private socket: Socket | null = null
  private listeners: ListenerMap = new Map()
  private reconnectAttempts = 0
  private readonly maxReconnectAttempts = 5

  /**
   * TODO: Connect to backend WebSocket server.
   * Backend WebSocket endpoint not yet implemented.
   * Call this once auth token is available.
   */
  connect(investigationId?: string): void {
    if (this.socket?.connected) return

    const token = localStorage.getItem(LS_KEYS.AUTH_TOKEN)

    // TODO: Replace with actual backend WS endpoint
    this.socket = io(WS_BASE_URL, {
      auth: { token },
      query: investigationId ? { investigation_id: investigationId } : undefined,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 2000,
      autoConnect: false,
    })

    this.registerCoreHandlers()
    this.socket.connect()
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.listeners.clear()
    this.reconnectAttempts = 0
  }

  /**
   * Subscribe to a specific socket event.
   * Returns an unsubscribe function.
   */
  on<T = unknown>(event: SocketEventType, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback as EventCallback)

    if (this.socket) {
      this.socket.on(event, callback as EventCallback)
    }

    return () => this.off(event, callback as EventCallback)
  }

  off(event: SocketEventType, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback)
    this.socket?.off(event, callback)
  }

  /**
   * Emit an event to the server.
   * TODO: Wire to backend socket event handlers.
   */
  emit<T = unknown>(event: string, data?: T): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data)
    } else {
      console.warn('[Socket] Not connected. Event not sent:', event)
    }
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false
  }

  get socketId(): string | undefined {
    return this.socket?.id
  }

  private registerCoreHandlers(): void {
    if (!this.socket) return

    this.socket.on('connect', () => {
      console.info('[Socket] Connected:', this.socket?.id)
      this.reconnectAttempts = 0
      this.reattachListeners()
    })

    this.socket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected:', reason)
    })

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message)
      this.reconnectAttempts++
    })
  }

  private reattachListeners(): void {
    if (!this.socket) return
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach((cb) => {
        this.socket!.on(event, cb)
      })
    })
  }
}

// Singleton instance — import and use throughout the app
export const socketService = new ErakshakSocketService()

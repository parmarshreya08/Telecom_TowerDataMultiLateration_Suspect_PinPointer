// ============================================================
// E-Rakshak — Socket Hook
// TODO: Full functionality depends on backend WebSocket server
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { socketService } from '@/services/socket'
import type { SocketEventType } from '@/types'

interface UseSocketOptions {
  investigationId?: string
  autoConnect?: boolean
}

export function useSocket(options: UseSocketOptions = {}) {
  const { investigationId, autoConnect = false } = options
  const [isConnected, setIsConnected] = useState(() => socketService.isConnected)

  useEffect(() => {
    if (!autoConnect) return

    // TODO: Connect once auth token is available
    socketService.connect(investigationId)

    const unsubConnect    = socketService.on('connect',    () => setIsConnected(true))
    const unsubDisconnect = socketService.on('disconnect', () => setIsConnected(false))

    return () => {
      unsubConnect()
      unsubDisconnect()
    }
  }, [investigationId, autoConnect])

  const subscribe = useCallback(
    <T = unknown>(event: SocketEventType, cb: (data: T) => void) =>
      socketService.on<T>(event, cb),
    []
  )

  const emit = useCallback(<T = unknown>(event: string, data?: T) => {
    socketService.emit(event, data)
  }, [])

  return { isConnected, subscribe, emit }
}

// ── Single event subscription hook ────────────────────────
export function useSocketEvent<T = unknown>(
  event: SocketEventType,
  callback: (data: T) => void,
  deps: React.DependencyList = []
) {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    const unsub = socketService.on<T>(event, (data) => callbackRef.current(data))
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps])
}

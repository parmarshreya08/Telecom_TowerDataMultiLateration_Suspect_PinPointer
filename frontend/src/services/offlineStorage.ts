// ============================================================
// E-Rakshak — Offline Storage & IndexedDB Synchronization
// Enables field officers to operate without active network connection.
// ============================================================

import type { Investigation } from '@/types'

const DB_NAME = 'erakshak_offline_db'
const DB_VERSION = 1

interface DBSchema {
  cases: Investigation
  towers: { cgi: string; lat: number; lng: number; operator: string; azimuth?: number }
  fixes: { case_id: string; fixes: Array<{ lat: number; lng: number; timestamp: string; state?: string }> }
  syncQueue: { id: string; action: string; payload: unknown; timestamp: number }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported on this platform.'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains('cases')) {
        db.createObjectStore('cases', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('towers')) {
        db.createObjectStore('towers', { keyPath: 'cgi' })
      }
      if (!db.objectStoreNames.contains('fixes')) {
        db.createObjectStore('fixes', { keyPath: 'case_id' })
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ── Cases Cache ──────────────────────────────────────────────
export async function cacheCasesOffline(cases: Investigation[]): Promise<void> {
  try {
    const db = await openDatabase()
    const tx = db.transaction('cases', 'readwrite')
    const store = tx.objectStore('cases')
    for (const c of cases) {
      if (c && c.id) {
        store.put(c)
      }
    }
  } catch (err) {
    console.warn('[OfflineStorage] Failed to cache cases:', err)
  }
}

export async function cacheCaseOffline(item: Investigation): Promise<void> {
  try {
    const db = await openDatabase()
    const tx = db.transaction('cases', 'readwrite')
    const store = tx.objectStore('cases')
    store.put(item)
  } catch (err) {
    console.warn('[OfflineStorage] Failed to cache single case:', err)
  }
}

export async function getCachedCasesOffline(): Promise<Investigation[]> {
  try {
    const db = await openDatabase()
    const tx = db.transaction('cases', 'readonly')
    const store = tx.objectStore('cases')
    const req = store.getAll()
    return new Promise((resolve) => {
      req.onsuccess = () => resolve((req.result as Investigation[]) || [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

export async function getCachedCaseOffline(id: string): Promise<Investigation | null> {
  try {
    const db = await openDatabase()
    const tx = db.transaction('cases', 'readonly')
    const store = tx.objectStore('cases')
    const req = store.get(id)
    return new Promise((resolve) => {
      req.onsuccess = () => resolve((req.result as Investigation) || null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

// ── Fixes Cache ──────────────────────────────────────────────
export async function cacheFixesOffline(caseId: string, fixes: Array<{ lat: number; lng: number; timestamp: string; state?: string }>): Promise<void> {
  try {
    const db = await openDatabase()
    const tx = db.transaction('fixes', 'readwrite')
    const store = tx.objectStore('fixes')
    store.put({ case_id: caseId, fixes })
  } catch (err) {
    console.warn('[OfflineStorage] Failed to cache fixes:', err)
  }
}

export async function getCachedFixesOffline(caseId: string): Promise<Array<{ lat: number; lng: number; timestamp: string; state?: string }>> {
  try {
    const db = await openDatabase()
    const tx = db.transaction('fixes', 'readonly')
    const store = tx.objectStore('fixes')
    const req = store.get(caseId)
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const row = req.result as { case_id: string; fixes: Array<{ lat: number; lng: number; timestamp: string; state?: string }> } | undefined
        resolve(row?.fixes || [])
      }
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

// ── Offline Action Sync Queue ────────────────────────────────
export async function queueOfflineAction(action: string, payload: unknown): Promise<void> {
  try {
    const db = await openDatabase()
    const tx = db.transaction('syncQueue', 'readwrite')
    const store = tx.objectStore('syncQueue')
    const item = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      action,
      payload,
      timestamp: Date.now(),
    }
    store.add(item)
  } catch (err) {
    console.warn('[OfflineStorage] Failed to queue offline action:', err)
  }
}

export async function getOfflineQueue(): Promise<Array<{ id: string; action: string; payload: unknown; timestamp: number }>> {
  try {
    const db = await openDatabase()
    const tx = db.transaction('syncQueue', 'readonly')
    const store = tx.objectStore('syncQueue')
    const req = store.getAll()
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

export async function removeQueueItem(id: string): Promise<void> {
  try {
    const db = await openDatabase()
    const tx = db.transaction('syncQueue', 'readwrite')
    const store = tx.objectStore('syncQueue')
    store.delete(id)
  } catch (err) {
    console.warn('[OfflineStorage] Failed to delete queue item:', err)
  }
}

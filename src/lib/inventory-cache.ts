import { demoEnabled, supabase } from '@/lib/supabase'
import type { InventorySnapshot } from '@/lib/types'

const DB_NAME = 'inventory-v2-cache'
const DB_VERSION = 1
const STORE_NAME = 'snapshots'
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

type CachedInventory = {
  key: string
  savedAt: number
  snapshot: InventorySnapshot
}

function hasIndexedDb() {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

async function cacheScope() {
  if (demoEnabled) return 'demo'
  if (!supabase) return ''
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.user.id ? `user:${data.session.user.id}` : ''
  } catch {
    return ''
  }
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB tidak tersedia'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Cache inventory gagal dibuka'))
  })
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Operasi cache inventory gagal'))
  })
}

export async function readInventoryCache(storeId?: string): Promise<CachedInventory | null> {
  const scope = await cacheScope()
  const selectedStoreId = storeId ?? localStorage.getItem('activeStoreId') ?? ''
  if (!scope || !selectedStoreId || !hasIndexedDb()) return null

  let db: IDBDatabase | null = null
  try {
    db = await openDatabase()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const cached = await requestResult(transaction.objectStore(STORE_NAME).get(`${scope}:${selectedStoreId}`)) as CachedInventory | undefined
    if (!cached) return null
    if (Date.now() - cached.savedAt > CACHE_MAX_AGE_MS) return null
    if (cached.snapshot.activeStore?.id !== selectedStoreId) return null
    return cached
  } catch {
    return null
  } finally {
    db?.close()
  }
}

export async function writeInventoryCache(snapshot: InventorySnapshot) {
  const scope = await cacheScope()
  const storeId = snapshot.activeStore?.id
  if (!scope || !storeId || !hasIndexedDb()) return

  let db: IDBDatabase | null = null
  try {
    db = await openDatabase()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const record: CachedInventory = {
      key: `${scope}:${storeId}`,
      savedAt: Date.now(),
      snapshot,
    }
    transaction.objectStore(STORE_NAME).put(record)
  } catch {
    // Cache is an acceleration layer only. Network data remains the source of truth.
  } finally {
    db?.close()
  }
}

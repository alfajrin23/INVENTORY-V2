import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { readInventoryCache, writeInventoryCache } from '@/lib/inventory-cache'
import { getInventoryRepository } from '@/lib/inventory-service'
import type {
  HistoryItem,
  InventorySnapshot,
  ProductInput,
  StoreInput,
  StoreRecord,
  TransactionChange,
  TransactionInput,
  TransactionResult,
} from '@/lib/types'

type InventoryContextValue = InventorySnapshot & {
  loading: boolean
  productsReady: boolean
  error: string | null
  mode: 'supabase' | 'demo'
  refresh: () => Promise<void>
  setActiveStore: (storeId: string) => Promise<void>
  addStore: (store: StoreInput) => Promise<StoreRecord>
  updateStore: (id: string, store: StoreInput) => Promise<void>
  deleteStore: (id: string) => Promise<void>
  addProduct: (product: ProductInput) => Promise<void>
  updateProduct: (id: string, product: ProductInput, expectedStock?: number) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  processTransaction: (input: TransactionInput) => Promise<HistoryItem[]>
  reviseTransaction: (current: HistoryItem, change: TransactionChange | null) => Promise<void>
}

const emptySnapshot: InventorySnapshot = {
  stores: [],
  activeStore: null,
  products: [],
  history: [],
}

const BACKGROUND_REFRESH_STALE_MS = 2 * 60 * 1000
const BACKGROUND_REFRESH_INTERVAL_MS = 5 * 60 * 1000
const RECONNECT_REFRESH_STALE_MS = 30 * 1000

const InventoryContext = createContext<InventoryContextValue | null>(null)
const repository = getInventoryRepository()

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<InventorySnapshot>(emptySnapshot)
  const [loading, setLoading] = useState(true)
  const [productsReady, setProductsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generation = useRef(0)
  const mutation = useRef(false)
  const snapshotRequest = useRef<Promise<InventorySnapshot> | null>(null)
  const requestEpoch = useRef(0)
  const productsReadyRef = useRef(false)
  const lastRefreshAt = useRef(0)

  const commitSnapshot = useCallback((next: InventorySnapshot) => {
    setSnapshot(next)
    void writeInventoryCache(next)
  }, [])

  const updateSnapshot = useCallback((updater: (current: InventorySnapshot) => InventorySnapshot) => {
    setSnapshot(current => {
      const next = updater(current)
      void writeInventoryCache(next)
      return next
    })
  }, [])

  const refresh = useCallback(async (background = false) => {
    const version = ++generation.current
    if (!background) setLoading(true)
    setError(null)
    let request = snapshotRequest.current
    if (!request) {
      const epoch = ++requestEpoch.current
      request = repository.getSnapshot((partial) => {
        if (epoch !== requestEpoch.current || productsReadyRef.current) return
        productsReadyRef.current = true
        setProductsReady(true)
        setSnapshot(partial)
      })
      snapshotRequest.current = request
    }
    try {
      const next = await request
      if (version === generation.current) {
        lastRefreshAt.current = Date.now()
        productsReadyRef.current = true
        setProductsReady(true)
        commitSnapshot(next)
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Gagal memuat data inventory'
      if (version === generation.current) setError(message)
    } finally {
      if (snapshotRequest.current === request) snapshotRequest.current = null
      if (version === generation.current) setLoading(false)
    }
  }, [commitSnapshot])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const cached = await readInventoryCache()
      if (cancelled) return

      if (cached) {
        productsReadyRef.current = true
        setProductsReady(true)
        setSnapshot(cached.snapshot)
        setLoading(false)
        lastRefreshAt.current = cached.savedAt
        void refresh(true)
      } else {
        void refresh()
      }
    })()

    return () => { cancelled = true }
  }, [refresh])

  const mergeResult = useCallback((result: TransactionResult & { deletedId?: string }) => {
    updateSnapshot(current => ({
      ...current,
      products: current.products.map(p => result.products.find(next => next.id === p.id && next.storeId === current.activeStore?.id) ?? p),
      history: [
        ...result.history.filter(h => h.storeId === current.activeStore?.id),
        ...current.history.filter(h => h.id !== result.deletedId && !result.history.some(n => n.id === h.id)),
      ].sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    }))
  }, [updateSnapshot])

  const exclusive = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    if (mutation.current) throw new Error('Permintaan sedang diproses. Tunggu sebentar.')
    mutation.current = true
    ++generation.current
    ++requestEpoch.current
    snapshotRequest.current = null
    try { return await action() } finally { mutation.current = false; setLoading(false) }
  }, [])

  useEffect(() => {
    const update = () => {
      if (
        !mutation.current
        && !snapshotRequest.current
        && document.visibilityState === 'visible'
        && Date.now() - lastRefreshAt.current > BACKGROUND_REFRESH_STALE_MS
      ) void refresh(true)
    }
    const reconnect = () => {
      if (
        !mutation.current
        && !snapshotRequest.current
        && Date.now() - lastRefreshAt.current > RECONNECT_REFRESH_STALE_MS
      ) void refresh(true)
    }
    window.addEventListener('focus', update)
    window.addEventListener('online', reconnect)
    const timer = window.setInterval(update, BACKGROUND_REFRESH_INTERVAL_MS)
    return () => {
      window.removeEventListener('focus', update)
      window.removeEventListener('online', reconnect)
      window.clearInterval(timer)
    }
  }, [refresh])

  const value = useMemo<InventoryContextValue>(() => ({
    ...snapshot, loading, productsReady, error, mode: repository.mode, refresh,
    setActiveStore: storeId => exclusive(async () => {
      if (snapshot.activeStore?.id === storeId) return
      const activeStore = snapshot.stores.find(s => s.id === storeId)
      if (!activeStore) throw new Error('Toko tidak ditemukan')

      await repository.setActiveStore(storeId)
      const cached = await readInventoryCache(storeId)
      productsReadyRef.current = Boolean(cached)
      setProductsReady(Boolean(cached))
      setSnapshot(current => ({
        ...current,
        activeStore,
        products: cached?.snapshot.products ?? [],
        history: cached?.snapshot.history ?? [],
      }))
      if (cached) setLoading(false)
      await refresh(Boolean(cached))
    }),
    addStore: store => exclusive(async () => {
      const created = await repository.addStore(store)
      productsReadyRef.current = true
      setProductsReady(true)
      updateSnapshot(current => ({
        stores: [created, ...current.stores.filter(item => item.id !== created.id)],
        activeStore: created,
        products: [],
        history: [],
      }))
      return created
    }),
    updateStore: (id, store) => exclusive(async () => {
      await repository.updateStore(id, store)
      updateSnapshot(current => {
        const stores = current.stores.map(item => item.id === id ? { ...item, ...store } : item)
        return {
          ...current,
          stores,
          activeStore: current.activeStore?.id === id ? stores.find(item => item.id === id) ?? null : current.activeStore,
        }
      })
    }),
    deleteStore: id => exclusive(async () => { await repository.deleteStore(id); await refresh() }),
    addProduct: product => exclusive(async () => {
      const created = await repository.addProduct(product)
      updateSnapshot(current => ({ ...current, products: current.activeStore?.id === created.storeId ? [created, ...current.products] : current.products }))
    }),
    updateProduct: (id, product, expectedStock) => exclusive(async () => {
      const old = snapshot.products.find(p => p.id === id)
      if (!old) throw new Error('Produk tidak ditemukan')
      mergeResult(await repository.updateProduct(id, product, expectedStock ?? old.stok))
    }),
    deleteProduct: id => exclusive(async () => {
      await repository.deleteProduct(id)
      updateSnapshot(current => ({ ...current, products: current.products.filter(p => p.id !== id) }))
    }),
    processTransaction: input => exclusive(async () => {
      if (!snapshot.activeStore) throw new Error('Pilih toko terlebih dahulu')
      if (!['masuk', 'keluar'].includes(input.category) || !input.items.length || input.items.length > 100) throw new Error('Transaksi tidak valid')
      for (const item of input.items) {
        if (item.product.storeId !== snapshot.activeStore.id) throw new Error('Produk bukan milik toko aktif')
        if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > 1000000) throw new Error('Jumlah harus bilangan bulat 1 sampai 1000000')
      }
      if (input.date && !Number.isFinite(Date.parse(input.date))) throw new Error('Tanggal tidak valid')
      // Preserve the request ID across a lost response, retry, and page reload.
      const signature = JSON.stringify({ storeId: snapshot.activeStore.id, category: input.category, items: input.items.map(i => ({ id: i.product.id, quantity: i.quantity })).sort((a, b) => a.id.localeCompare(b.id)), note: input.note ?? null, operator: input.operator ?? null, date: input.date ?? null })
      const saved = sessionStorage.getItem('inventory-pending-transaction')
      const pending: Record<string, string> = saved ? JSON.parse(saved) : {}
      const id = pending[signature] ?? crypto.randomUUID()
      pending[signature] = id
      sessionStorage.setItem('inventory-pending-transaction', JSON.stringify(pending))
      const result = await repository.processTransaction({ ...input, requestId: id })
      mergeResult(result)
      delete pending[signature]
      sessionStorage.setItem('inventory-pending-transaction', JSON.stringify(pending))
      return result.history
    }),
    reviseTransaction: (current, change) => exclusive(async () => {
      if (current.storeId !== snapshot.activeStore?.id) throw new Error('Transaksi bukan milik toko aktif')
      mergeResult(await repository.reviseTransaction(current, change))
    }),
  }), [snapshot, loading, productsReady, error, refresh, mergeResult, exclusive, updateSnapshot])

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>
}

export function useInventory() {
  const value = useContext(InventoryContext)
  if (!value) throw new Error('useInventory harus dipakai di dalam InventoryProvider')
  return value
}

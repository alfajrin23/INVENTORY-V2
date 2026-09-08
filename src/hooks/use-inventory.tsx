import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { getInventoryRepository } from '@/lib/inventory-service'
import type {
  HistoryItem,
  InventorySnapshot,
  ProductInput,
  StoreInput,
  StoreRecord,
  TransactionInput,
  TransactionResult,
} from '@/lib/types'

type InventoryContextValue = InventorySnapshot & {
  loading: boolean
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
}

const emptySnapshot: InventorySnapshot = {
  stores: [],
  activeStore: null,
  products: [],
  history: [],
}

const InventoryContext = createContext<InventoryContextValue | null>(null)
const repository = getInventoryRepository()

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<InventorySnapshot>(emptySnapshot)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const generation = useRef(0)
  const mutation = useRef(false)
  const snapshotRequest = useRef<Promise<InventorySnapshot> | null>(null)

  const refresh = useCallback(async (background = false) => {
    const version = ++generation.current
    if (!background) setLoading(true)
    setError(null)
    const request = snapshotRequest.current ?? repository.getSnapshot()
    snapshotRequest.current = request
    try {
      const next = await request
      if (version === generation.current) setSnapshot(next)
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Gagal memuat data inventory'
      if (version === generation.current) setError(message)
    } finally {
      if (snapshotRequest.current === request) snapshotRequest.current = null
      if (version === generation.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const mergeResult = useCallback((result: TransactionResult) => {
    setSnapshot(current => ({
      ...current,
      products: current.products.map(p => result.products.find(next => next.id === p.id && next.storeId === current.activeStore?.id) ?? p),
      history: [...result.history.filter(h => h.storeId === current.activeStore?.id), ...current.history.filter(h => !result.history.some(n => n.id === h.id))]
        .sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    }))
  }, [])

  const exclusive = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    if (mutation.current) throw new Error('Permintaan sedang diproses. Tunggu sebentar.')
    mutation.current = true
    ++generation.current
    snapshotRequest.current = null
    try { return await action() } finally { mutation.current = false; setLoading(false) }
  }, [])

  useEffect(() => {
    const update = () => { if (!mutation.current && document.visibilityState === 'visible') void refresh(true) }
    window.addEventListener('focus', update)
    window.addEventListener('online', update)
    const timer = window.setInterval(update, 60000)
    return () => { window.removeEventListener('focus', update); window.removeEventListener('online', update); window.clearInterval(timer) }
  }, [refresh])

  const value = useMemo<InventoryContextValue>(() => ({
    ...snapshot, loading, error, mode: repository.mode, refresh,
    setActiveStore: storeId => exclusive(async () => {
      if (snapshot.activeStore?.id === storeId) return
      if (!snapshot.stores.some(s => s.id === storeId)) throw new Error('Toko tidak ditemukan')
      await repository.setActiveStore(storeId)
      setSnapshot(current => ({ ...current, activeStore: current.stores.find(s => s.id === storeId) ?? null, products: [], history: [] }))
      await refresh()
    }),
    addStore: store => exclusive(async () => { const created = await repository.addStore(store); await refresh(); return created }),
    updateStore: (id, store) => exclusive(async () => { await repository.updateStore(id, store); await refresh() }),
    deleteStore: id => exclusive(async () => { await repository.deleteStore(id); await refresh() }),
    addProduct: product => exclusive(async () => {
      const created = await repository.addProduct(product)
      setSnapshot(current => ({ ...current, products: current.activeStore?.id === created.storeId ? [created, ...current.products] : current.products }))
    }),
    updateProduct: (id, product, expectedStock) => exclusive(async () => {
      const old = snapshot.products.find(p => p.id === id)
      if (!old) throw new Error('Produk tidak ditemukan')
      mergeResult(await repository.updateProduct(id, product, expectedStock ?? old.stok))
    }),
    deleteProduct: id => exclusive(async () => {
      await repository.deleteProduct(id)
      setSnapshot(current => ({ ...current, products: current.products.filter(p => p.id !== id) }))
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
  }), [snapshot, loading, error, refresh, mergeResult, exclusive])

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>
}

export function useInventory() {
  const value = useContext(InventoryContext)
  if (!value) throw new Error('useInventory harus dipakai di dalam InventoryProvider')
  return value
}

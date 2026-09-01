import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { getInventoryRepository } from '@/lib/inventory-service'
import type {
  HistoryItem,
  InventorySnapshot,
  ProductInput,
  StoreInput,
  StoreRecord,
  TransactionInput,
} from '@/lib/types'

type InventoryContextValue = InventorySnapshot & {
  loading: boolean
  error: string | null
  mode: 'firebase' | 'demo'
  refresh: () => Promise<void>
  setActiveStore: (storeId: string) => Promise<void>
  addStore: (store: StoreInput) => Promise<StoreRecord>
  updateStore: (id: string, store: StoreInput) => Promise<void>
  deleteStore: (id: string) => Promise<void>
  addProduct: (product: ProductInput) => Promise<void>
  updateProduct: (id: string, product: ProductInput) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  addHistoryItem: (item: Omit<HistoryItem, 'id'>) => Promise<void>
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

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSnapshot(await repository.getSnapshot())
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Gagal memuat data inventory'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<InventoryContextValue>(
    () => ({
      ...snapshot,
      loading,
      error,
      mode: repository.mode,
      refresh,
      async setActiveStore(storeId) {
        await repository.setActiveStore(storeId)
        await refresh()
      },
      async addStore(store) {
        const created = await repository.addStore(store)
        await refresh()
        return created
      },
      async updateStore(id, store) {
        await repository.updateStore(id, store)
        await refresh()
      },
      async deleteStore(id) {
        await repository.deleteStore(id)
        await refresh()
      },
      async addProduct(product) {
        await repository.addProduct(product)
        await refresh()
      },
      async updateProduct(id, product) {
        await repository.updateProduct(id, product)
        await refresh()
      },
      async deleteProduct(id) {
        await repository.deleteProduct(id)
        await refresh()
      },
      async addHistoryItem(item) {
        await repository.addHistoryItem(item)
        await refresh()
      },
      async processTransaction(input) {
        const created = await repository.processTransaction(input)
        await refresh()
        return created
      },
    }),
    [error, loading, refresh, snapshot],
  )

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>
}

export function useInventory() {
  const value = useContext(InventoryContext)
  if (!value) {
    throw new Error('useInventory harus dipakai di dalam InventoryProvider')
  }

  return value
}

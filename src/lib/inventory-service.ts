import { createSeedData } from '@/data/seed'
import { demoEnabled } from '@/lib/supabase'
import { supabaseRepository } from '@/lib/supabase-repository'
import type {
  HistoryItem,
  InventorySnapshot,
  Product,
  ProductInput,
  StoreInput,
  StoreRecord,
  TransactionInput,
  TransactionResult,
} from '@/lib/types'

type LocalData = {
  stores: StoreRecord[]
  products: Product[]
  history: HistoryItem[]
}

export type InventoryRepository = {
  mode: 'supabase' | 'demo'
  getSnapshot: () => Promise<InventorySnapshot>
  fetchStores: () => Promise<StoreRecord[]>
  setActiveStore: (storeId: string) => Promise<void>
  addStore: (store: StoreInput) => Promise<StoreRecord>
  updateStore: (id: string, store: StoreInput) => Promise<void>
  deleteStore: (id: string) => Promise<void>
  addProduct: (product: ProductInput) => Promise<Product>
  updateProduct: (id: string, product: ProductInput, expectedStock: number) => Promise<TransactionResult>
  deleteProduct: (id: string) => Promise<void>
  processTransaction: (input: TransactionInput) => Promise<TransactionResult>
}

const STORAGE_KEY = 'ab-elektronik-v2-data'
const ACTIVE_STORE_KEY = 'activeStoreId'
const STORE_NAME_KEY = 'storeName'
const STORE_ADDRESS_KEY = 'storeAddress'
const ADDRESS_LINK_KEY = 'addressLink'

function hasBrowserStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function uniqueId(prefix: string) {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)

  return `${prefix}-${Date.now().toString(36)}-${random}`
}

function hydrateStoreStorage(store: StoreRecord | null) {
  if (!hasBrowserStorage() || !store) {
    return
  }

  localStorage.setItem(ACTIVE_STORE_KEY, store.id)
  localStorage.setItem(STORE_NAME_KEY, store.name)
  localStorage.setItem(STORE_ADDRESS_KEY, store.address)
  localStorage.setItem(ADDRESS_LINK_KEY, store.addressLink)
}

function getStoredActiveStoreId(stores: StoreRecord[]) {
  if (!hasBrowserStorage()) {
    return stores[0]?.id ?? ''
  }

  const stored = localStorage.getItem(ACTIVE_STORE_KEY)
  const activeStore = stores.find((store) => store.id === stored) ?? stores[0] ?? null
  hydrateStoreStorage(activeStore)
  return activeStore?.id ?? ''
}

function readLocalData(): LocalData {
  if (!hasBrowserStorage()) {
    return createSeedData()
  }

  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seed = createSeedData()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed))
    hydrateStoreStorage(seed.stores[0] ?? null)
    return seed
  }

  try {
    const data = JSON.parse(raw) as LocalData
    if (!Array.isArray(data.stores) || !Array.isArray(data.products) || !Array.isArray(data.history)) {
      throw new Error('Invalid inventory payload')
    }
    return data
  } catch {
    throw new Error('Data demo tidak dapat dibaca. Backup localStorage sebelum memperbaikinya.')
  }
}

function writeLocalData(data: LocalData) {
  if (hasBrowserStorage()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }
}

function getActiveLocalSnapshot(data: LocalData): InventorySnapshot {
  const activeStoreId = getStoredActiveStoreId(data.stores)
  const activeStore = data.stores.find((store) => store.id === activeStoreId) ?? data.stores[0] ?? null
  hydrateStoreStorage(activeStore)

  return {
    stores: data.stores,
    activeStore,
    products: data.products.filter((product) => product.storeId === activeStore?.id),
    history: data.history.filter((item) => item.storeId === activeStore?.id),
  }
}

const localRepository: InventoryRepository = {
  mode: 'demo',
  async getSnapshot() {
    return getActiveLocalSnapshot(readLocalData())
  },
  async fetchStores() {
    return readLocalData().stores
  },
  async setActiveStore(storeId) {
    const store = readLocalData().stores.find((item) => item.id === storeId) ?? null
    hydrateStoreStorage(store)
  },
  async addStore(store) {
    const data = readLocalData()
    const now = new Date().toISOString()
    const created: StoreRecord = {
      ...store,
      id: uniqueId('store'),
      createdAt: now,
    }

    data.stores = [created, ...data.stores]
    writeLocalData(data)
    hydrateStoreStorage(created)
    return created
  },
  async updateStore(id, store) {
    const data = readLocalData()
    const updatedAt = new Date().toISOString()
    data.stores = data.stores.map((item) => (item.id === id ? { ...item, ...store, updatedAt } : item))
    writeLocalData(data)
    const updated = data.stores.find((item) => item.id === id) ?? null
    hydrateStoreStorage(updated)
  },
  async deleteStore(id) {
    const data = readLocalData()
    data.stores = data.stores.filter((store) => store.id !== id)
    data.products = data.products.filter((product) => product.storeId !== id)
    data.history = data.history.filter((item) => item.storeId !== id)
    writeLocalData(data)

    const activeId = hasBrowserStorage() ? localStorage.getItem(ACTIVE_STORE_KEY) : ''
    if (activeId === id || !activeId) {
      hydrateStoreStorage(data.stores[0] ?? null)
    }
  },
  async addProduct(product) {
    const data = readLocalData()
    const created: Product = {
      ...product,
      id: uniqueId('prd'),
      createdAt: new Date().toISOString(),
    }

    data.products = [created, ...data.products]
    writeLocalData(data)
    return created
  },
  async updateProduct(id, product, expectedStock) {
    const data = readLocalData()
    const old = data.products.find(item => item.id === id)
    if (!old || old.stok !== expectedStock) throw new Error('Stok berubah. Muat ulang produk sebelum mengedit.')
    const delta = product.stok - old.stok
    const history: HistoryItem[] = delta ? [{ ...old, id: uniqueId('hst'), tanggal: new Date().toISOString(), kategori: delta > 0 ? 'masuk' : 'keluar', jumlah: Math.abs(delta), keterangan: 'Koreksi stok melalui edit produk' }] : []
    data.history = [...history, ...data.history]
    data.products = data.products.map((item) =>
      item.id === id ? { ...item, ...product, updatedAt: new Date().toISOString() } : item,
    )
    writeLocalData(data)
    return { products: data.products.filter(item => item.id === id), history }
  },
  async deleteProduct(id) {
    const data = readLocalData()
    data.products = data.products.filter((product) => product.id !== id)
    writeLocalData(data)
  },
  async processTransaction(input) {
    const data = readLocalData()
    const now = input.date ? new Date(input.date).toISOString() : new Date().toISOString()
    const createdItems: HistoryItem[] = []

    input.items.forEach((cartItem) => {
      const productIndex = data.products.findIndex((product) => product.id === cartItem.product.id)
      if (productIndex < 0) {
        throw new Error(`${cartItem.product.namaBarang} tidak ditemukan`)
      }

      const currentProduct = data.products[productIndex]
      const delta = input.category === 'keluar' ? -cartItem.quantity : cartItem.quantity
      const nextStock = currentProduct.stok + delta
      if (nextStock < 0) {
        throw new Error(`Stok ${currentProduct.namaBarang} tidak cukup`)
      }

      data.products[productIndex] = {
        ...currentProduct,
        stok: nextStock,
        updatedAt: now,
      }

      createdItems.push({
        id: uniqueId('hst'),
        barcode: currentProduct.barcode,
        tanggal: now,
        namaBarang: currentProduct.namaBarang,
        brand: currentProduct.brand,
        kategori: input.category,
        jumlah: cartItem.quantity,
        harga: currentProduct.harga,
        keterangan: input.note || (input.category === 'keluar' ? 'Penjualan' : 'Restock'),
        storeId: currentProduct.storeId,
        oleh: input.operator || 'Kasir',
      })
    })

    data.history = [...createdItems, ...data.history]
    writeLocalData(data)
    return { history: createdItems, products: data.products.filter(p => input.items.some(i => i.product.id === p.id)) }
  },
}


export function getInventoryRepository(): InventoryRepository {
  return demoEnabled ? localRepository : supabaseRepository
}

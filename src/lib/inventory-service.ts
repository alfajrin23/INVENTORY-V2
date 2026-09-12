import { createSeedData } from '@/data/seed'
import { demoEnabled } from '@/lib/supabase'
import { supabaseRepository } from '@/lib/supabase-repository'
import type {
  AuditLog,
  HistoryItem,
  InventorySnapshot,
  Product,
  ProductInput,
  StoreInput,
  StoreRecord,
  TransactionInput,
  TransactionChange,
  TransactionRevisionResult,
  TransactionResult,
} from '@/lib/types'

type LocalData = {
  stores: StoreRecord[]
  products: Product[]
  history: HistoryItem[]
  audit?: AuditLog[]
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
  reviseTransaction: (current: HistoryItem, change: TransactionChange | null) => Promise<TransactionRevisionResult>
  getAuditLogs: (storeId: string) => Promise<AuditLog[]>
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

function recordLocalAudit(data: LocalData, entity: AuditLog['entity'], action: AuditLog['action'], storeId: string, recordId: string, beforeData: object | null, afterData: object | null) {
  data.audit = [{
    id: uniqueId('log'), storeId, actorId: null, entity, action, recordId,
    beforeData: beforeData as Record<string, unknown> | null,
    afterData: afterData as Record<string, unknown> | null,
    createdAt: new Date().toISOString(),
  }, ...(data.audit ?? [])]
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
    recordLocalAudit(data, 'store', 'insert', created.id, created.id, null, created)
    writeLocalData(data)
    hydrateStoreStorage(created)
    return created
  },
  async updateStore(id, store) {
    const data = readLocalData()
    const previous = data.stores.find(item => item.id === id)
    const updatedAt = new Date().toISOString()
    data.stores = data.stores.map((item) => (item.id === id ? { ...item, ...store, updatedAt } : item))
    const updated = data.stores.find((item) => item.id === id) ?? null
    if (previous && updated) recordLocalAudit(data, 'store', 'update', id, id, previous, updated)
    writeLocalData(data)
    hydrateStoreStorage(updated)
  },
  async deleteStore(id) {
    const data = readLocalData()
    const previous = data.stores.find(store => store.id === id)
    data.stores = data.stores.filter((store) => store.id !== id)
    data.products = data.products.filter((product) => product.storeId !== id)
    data.history = data.history.filter((item) => item.storeId !== id)
    if (previous) recordLocalAudit(data, 'store', 'delete', id, id, previous, null)
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
    recordLocalAudit(data, 'product', 'insert', created.storeId, created.id, null, created)
    writeLocalData(data)
    return created
  },
  async updateProduct(id, product, expectedStock) {
    const data = readLocalData()
    const old = data.products.find(item => item.id === id)
    if (!old || old.stok !== expectedStock) throw new Error('Stok berubah. Muat ulang produk sebelum mengedit.')
    const delta = product.stok - old.stok
    const now = new Date().toISOString()
    const history: HistoryItem[] = delta ? [{ ...old, id: uniqueId('hst'), productId: id, tanggal: now, updatedAt: now, kategori: delta > 0 ? 'masuk' : 'keluar', jumlah: Math.abs(delta), keterangan: 'Koreksi stok melalui edit produk', oleh: 'Admin' }] : []
    data.history = [...history, ...data.history]
    data.products = data.products.map((item) =>
      item.id === id ? { ...item, ...product, updatedAt: now } : item,
    )
    recordLocalAudit(data, 'product', 'update', old.storeId, id, old, data.products.find(item => item.id === id)!)
    for (const item of history) recordLocalAudit(data, 'transaction', 'insert', item.storeId, item.id, null, item)
    writeLocalData(data)
    return { products: data.products.filter(item => item.id === id), history }
  },
  async deleteProduct(id) {
    const data = readLocalData()
    const previous = data.products.find(product => product.id === id)
    data.products = data.products.filter((product) => product.id !== id)
    data.history = data.history.map(item => item.productId === id ? { ...item, productId: null } : item)
    if (previous) recordLocalAudit(data, 'product', 'delete', previous.storeId, id, previous, null)
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
      recordLocalAudit(data, 'product', 'update', currentProduct.storeId, currentProduct.id, currentProduct, data.products[productIndex])

      createdItems.push({
        id: uniqueId('hst'),
        productId: currentProduct.id,
        barcode: currentProduct.barcode,
        tanggal: now,
        updatedAt: now,
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
    for (const item of createdItems) recordLocalAudit(data, 'transaction', 'insert', item.storeId, item.id, null, item)
    writeLocalData(data)
    return { history: createdItems, products: data.products.filter(p => input.items.some(i => i.product.id === p.id)) }
  },
  async reviseTransaction(current, change) {
    const data = readLocalData()
    const previous = data.history.find(item => item.id === current.id && item.storeId === current.storeId)
    if (!previous) throw new Error('Transaksi tidak ditemukan. Muat ulang data.')
    if (JSON.stringify(previous) !== JSON.stringify(current)) throw new Error('Transaksi sudah berubah. Muat ulang sebelum mengedit.')
    const oldProduct = data.products.find(product => product.id === previous.productId && product.storeId === previous.storeId)
      ?? (!previous.productId ? data.products.find(product => product.barcode === previous.barcode && product.storeId === previous.storeId) : undefined)
    if (!oldProduct) throw new Error('Produk asal transaksi sudah dihapus. Stok tidak dapat dikoreksi otomatis.')
    const oldReversal = previous.kategori === 'masuk' ? -previous.jumlah : previous.jumlah
    const newProduct = change ? data.products.find(product => product.id === change.productId && product.storeId === current.storeId) : null
    if (change && !newProduct) throw new Error('Produk baru tidak ditemukan di toko aktif')
    if (change && (!['masuk', 'keluar'].includes(change.category) || !Number.isSafeInteger(change.quantity) || change.quantity < 1 || change.quantity > 1000000 || !Number.isFinite(change.price) || change.price < 0 || change.price > 99999999999999.99 || !Number.isFinite(Date.parse(change.date)))) {
      throw new Error('Perubahan transaksi tidak valid')
    }
    const newEffect = change ? (change.category === 'masuk' ? change.quantity : -change.quantity) : 0
    const oldStock = oldProduct.stok + oldReversal + (newProduct?.id === oldProduct.id ? newEffect : 0)
    const nextStock = newProduct && newProduct.id !== oldProduct.id ? newProduct.stok + newEffect : null
    if (oldStock < 0 || oldStock > 2147483647 || (nextStock !== null && (nextStock < 0 || nextStock > 2147483647))) {
      throw new Error('Stok tidak cukup untuk perubahan ini')
    }
    const now = new Date().toISOString()
    const updatedProducts: Product[] = []
    if (oldStock !== oldProduct.stok) {
      const updated = { ...oldProduct, stok: oldStock, updatedAt: now }
      data.products = data.products.map(product => product.id === updated.id ? updated : product)
      recordLocalAudit(data, 'product', 'update', updated.storeId, updated.id, oldProduct, updated)
      updatedProducts.push(updated)
    }
    if (newProduct && nextStock !== null) {
      const updated = { ...newProduct, stok: nextStock, updatedAt: now }
      data.products = data.products.map(product => product.id === updated.id ? updated : product)
      recordLocalAudit(data, 'product', 'update', updated.storeId, updated.id, newProduct, updated)
      updatedProducts.push(updated)
    }
    if (change && newProduct) {
      const updated: HistoryItem = {
        ...previous, productId: newProduct.id, barcode: newProduct.barcode,
        namaBarang: newProduct.namaBarang, brand: newProduct.brand,
        kategori: change.category, jumlah: change.quantity, harga: change.price,
        tanggal: new Date(change.date).toISOString(), keterangan: change.note,
        oleh: change.operator, updatedAt: now,
      }
      data.history = data.history.map(item => item.id === updated.id ? updated : item)
      recordLocalAudit(data, 'transaction', 'update', updated.storeId, updated.id, previous, updated)
      writeLocalData(data)
      return { products: updatedProducts, history: [updated] }
    }
    data.history = data.history.filter(item => item.id !== previous.id)
    recordLocalAudit(data, 'transaction', 'delete', previous.storeId, previous.id, previous, null)
    writeLocalData(data)
    return { products: updatedProducts, history: [], deletedId: previous.id }
  },
  async getAuditLogs(storeId) {
    return (readLocalData().audit ?? []).filter(log => log.storeId === storeId).slice(0, 200)
  },
}


export function getInventoryRepository(): InventoryRepository {
  return demoEnabled ? localRepository : supabaseRepository
}

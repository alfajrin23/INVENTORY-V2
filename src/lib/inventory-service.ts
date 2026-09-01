import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'

import { createSeedData } from '@/data/seed'
import { db, firebaseReady } from '@/lib/firebase'
import type {
  HistoryItem,
  InventorySnapshot,
  Product,
  ProductInput,
  StoreInput,
  StoreRecord,
  TransactionInput,
} from '@/lib/types'

type LocalData = {
  stores: StoreRecord[]
  products: Product[]
  history: HistoryItem[]
}

export type InventoryRepository = {
  mode: 'firebase' | 'demo'
  getSnapshot: () => Promise<InventorySnapshot>
  fetchStores: () => Promise<StoreRecord[]>
  setActiveStore: (storeId: string) => Promise<void>
  addStore: (store: StoreInput) => Promise<StoreRecord>
  updateStore: (id: string, store: StoreInput) => Promise<void>
  deleteStore: (id: string) => Promise<void>
  addProduct: (product: ProductInput) => Promise<Product>
  updateProduct: (id: string, product: ProductInput) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  addHistoryItem: (item: Omit<HistoryItem, 'id'>) => Promise<HistoryItem>
  processTransaction: (input: TransactionInput) => Promise<HistoryItem[]>
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

function normalizeDate(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
  }

  return new Date().toISOString()
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
    const seed = createSeedData()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed))
    hydrateStoreStorage(seed.stores[0] ?? null)
    return seed
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
  async updateProduct(id, product) {
    const data = readLocalData()
    data.products = data.products.map((item) =>
      item.id === id ? { ...item, ...product, updatedAt: new Date().toISOString() } : item,
    )
    writeLocalData(data)
  },
  async deleteProduct(id) {
    const data = readLocalData()
    data.products = data.products.filter((product) => product.id !== id)
    writeLocalData(data)
  },
  async addHistoryItem(item) {
    const data = readLocalData()
    const created: HistoryItem = { ...item, id: uniqueId('hst') }
    data.history = [created, ...data.history]
    writeLocalData(data)
    return created
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
    return createdItems
  },
}

function assertDb() {
  if (!db) {
    throw new Error('Firebase belum dikonfigurasi')
  }

  return db
}

function storeFromDoc(snapshot: QueryDocumentSnapshot<DocumentData>): StoreRecord {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    name: String(data.name ?? data.storeName ?? 'ABElektronik'),
    address: String(data.address ?? data.storeAddress ?? ''),
    addressLink: String(data.addressLink ?? ''),
    photo: typeof data.photo === 'string' ? data.photo : undefined,
    createdAt: normalizeDate(data.createdAt),
    updatedAt: data.updatedAt ? normalizeDate(data.updatedAt) : undefined,
  }
}

function productFromDoc(snapshot: QueryDocumentSnapshot<DocumentData>): Product {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    namaBarang: String(data.namaBarang ?? ''),
    brand: String(data.brand ?? ''),
    harga: Number(data.harga ?? 0),
    stok: Number(data.stok ?? 0),
    barcode: String(data.barcode ?? ''),
    storeId: String(data.storeId ?? ''),
    createdAt: normalizeDate(data.createdAt),
    updatedAt: data.updatedAt ? normalizeDate(data.updatedAt) : undefined,
  }
}

function historyFromDoc(snapshot: QueryDocumentSnapshot<DocumentData>): HistoryItem {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    barcode: String(data.barcode ?? ''),
    tanggal: normalizeDate(data.tanggal),
    namaBarang: String(data.namaBarang ?? ''),
    brand: String(data.brand ?? ''),
    kategori: data.kategori === 'masuk' ? 'masuk' : 'keluar',
    jumlah: Number(data.jumlah ?? 0),
    harga: Number(data.harga ?? 0),
    keterangan: typeof data.keterangan === 'string' ? data.keterangan : undefined,
    storeId: String(data.storeId ?? ''),
    oleh: typeof data.oleh === 'string' ? data.oleh : undefined,
  }
}

async function getFirebaseStores() {
  const database = assertDb()
  const snapshots = await getDocs(query(collection(database, 'stores'), orderBy('createdAt', 'desc')))
  return snapshots.docs.map(storeFromDoc)
}

const firebaseRepository: InventoryRepository = {
  mode: 'firebase',
  async getSnapshot() {
    const database = assertDb()
    const stores = await getFirebaseStores()
    const activeStoreId = getStoredActiveStoreId(stores)
    const activeStore = stores.find((store) => store.id === activeStoreId) ?? stores[0] ?? null
    hydrateStoreStorage(activeStore)

    if (!activeStore) {
      return {
        stores,
        activeStore: null,
        products: [],
        history: [],
      }
    }

    const productsSnapshot = await getDocs(
      query(collection(database, 'products'), where('storeId', '==', activeStore.id), orderBy('brand')),
    )
    const historySnapshot = await getDocs(
      query(collection(database, 'history'), where('storeId', '==', activeStore.id), orderBy('tanggal', 'desc')),
    )

    return {
      stores,
      activeStore,
      products: productsSnapshot.docs.map(productFromDoc),
      history: historySnapshot.docs.map(historyFromDoc),
    }
  },
  async fetchStores() {
    return getFirebaseStores()
  },
  async setActiveStore(storeId) {
    const stores = await getFirebaseStores()
    const store = stores.find((item) => item.id === storeId) ?? null
    hydrateStoreStorage(store)
  },
  async addStore(store) {
    const database = assertDb()
    const created = await addDoc(collection(database, 'stores'), {
      ...store,
      createdAt: serverTimestamp(),
    })

    const storeRecord: StoreRecord = {
      ...store,
      id: created.id,
      createdAt: new Date().toISOString(),
    }
    hydrateStoreStorage(storeRecord)
    return storeRecord
  },
  async updateStore(id, store) {
    const database = assertDb()
    await updateDoc(doc(database, 'stores', id), {
      ...store,
      updatedAt: serverTimestamp(),
    })
  },
  async deleteStore(id) {
    const database = assertDb()
    const productsSnapshot = await getDocs(query(collection(database, 'products'), where('storeId', '==', id)))
    const historySnapshot = await getDocs(query(collection(database, 'history'), where('storeId', '==', id)))
    const batch = writeBatch(database)

    productsSnapshot.docs.forEach((item) => batch.delete(item.ref))
    historySnapshot.docs.forEach((item) => batch.delete(item.ref))
    batch.delete(doc(database, 'stores', id))
    await batch.commit()
  },
  async addProduct(product) {
    const database = assertDb()
    const created = await addDoc(collection(database, 'products'), {
      ...product,
      createdAt: serverTimestamp(),
    })

    return {
      ...product,
      id: created.id,
      createdAt: new Date().toISOString(),
    }
  },
  async updateProduct(id, product) {
    const database = assertDb()
    await updateDoc(doc(database, 'products', id), {
      ...product,
      updatedAt: serverTimestamp(),
    })
  },
  async deleteProduct(id) {
    const database = assertDb()
    await deleteDoc(doc(database, 'products', id))
  },
  async addHistoryItem(item) {
    const database = assertDb()
    const created = await addDoc(collection(database, 'history'), {
      ...item,
      tanggal: Timestamp.fromDate(new Date(item.tanggal)),
      createdAt: serverTimestamp(),
    })

    return {
      ...item,
      id: created.id,
    }
  },
  async processTransaction(input) {
    const database = assertDb()
    const batch = writeBatch(database)
    const now = input.date ? new Date(input.date) : new Date()
    const createdItems: HistoryItem[] = []

    input.items.forEach((cartItem) => {
      const delta = input.category === 'keluar' ? -cartItem.quantity : cartItem.quantity
      if (cartItem.product.stok + delta < 0) {
        throw new Error(`Stok ${cartItem.product.namaBarang} tidak cukup`)
      }

      const productRef = doc(database, 'products', cartItem.product.id)
      const historyRef = doc(collection(database, 'history'))
      batch.update(productRef, {
        stok: increment(delta),
        updatedAt: serverTimestamp(),
      })
      batch.set(historyRef, {
        barcode: cartItem.product.barcode,
        tanggal: Timestamp.fromDate(now),
        namaBarang: cartItem.product.namaBarang,
        brand: cartItem.product.brand,
        kategori: input.category,
        jumlah: cartItem.quantity,
        harga: cartItem.product.harga,
        keterangan: input.note || (input.category === 'keluar' ? 'Penjualan' : 'Restock'),
        storeId: cartItem.product.storeId,
        oleh: input.operator || 'Kasir',
        createdAt: serverTimestamp(),
      })

      createdItems.push({
        id: historyRef.id,
        barcode: cartItem.product.barcode,
        tanggal: now.toISOString(),
        namaBarang: cartItem.product.namaBarang,
        brand: cartItem.product.brand,
        kategori: input.category,
        jumlah: cartItem.quantity,
        harga: cartItem.product.harga,
        keterangan: input.note || (input.category === 'keluar' ? 'Penjualan' : 'Restock'),
        storeId: cartItem.product.storeId,
        oleh: input.operator || 'Kasir',
      })
    })

    await batch.commit()
    return createdItems
  },
}

export function getInventoryRepository(): InventoryRepository {
  return firebaseReady ? firebaseRepository : localRepository
}

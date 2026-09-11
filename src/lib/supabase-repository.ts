import { supabase } from '@/lib/supabase'
import type { InventoryRepository } from '@/lib/inventory-service'
import type { HistoryItem, Product, StoreRecord, TransactionResult } from '@/lib/types'

type StoreRow = {
  id: string
  name: string
  address: string
  address_link: string
  photo: string | null
  created_at: string
  updated_at: string | null
}

type ProductRow = {
  id: string
  nama_barang: string
  brand: string
  harga: number
  stok: number
  barcode: string | null
  store_id: string
  created_at: string
  updated_at: string | null
}

type HistoryRow = {
  id: string
  barcode: string | null
  tanggal: string
  nama_barang: string
  brand: string
  kategori: 'masuk' | 'keluar'
  jumlah: number
  harga: number
  keterangan: string | null
  store_id: string
  oleh: string | null
}

type RpcResult = {
  products?: ProductRow[]
  history?: HistoryRow[]
}

const ACTIVE_STORE_KEY = 'activeStoreId'
const STORE_NAME_KEY = 'storeName'
const STORE_ADDRESS_KEY = 'storeAddress'
const ADDRESS_LINK_KEY = 'addressLink'

function client() {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi')
  return supabase
}

function mapStore(row: StoreRow): StoreRecord {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    addressLink: row.address_link,
    photo: row.photo ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  }
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    namaBarang: row.nama_barang,
    brand: row.brand,
    harga: Number(row.harga),
    stok: Number(row.stok),
    barcode: row.barcode ?? '',
    storeId: row.store_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  }
}

function mapHistory(row: HistoryRow): HistoryItem {
  return {
    id: row.id,
    barcode: row.barcode ?? '',
    tanggal: row.tanggal,
    namaBarang: row.nama_barang,
    brand: row.brand,
    kategori: row.kategori,
    jumlah: Number(row.jumlah),
    harga: Number(row.harga),
    keterangan: row.keterangan ?? undefined,
    storeId: row.store_id,
    oleh: row.oleh ?? undefined,
  }
}

function hydrateStoreStorage(store: StoreRecord | null) {
  if (typeof window === 'undefined' || !store) return
  localStorage.setItem(ACTIVE_STORE_KEY, store.id)
  localStorage.setItem(STORE_NAME_KEY, store.name)
  localStorage.setItem(STORE_ADDRESS_KEY, store.address)
  localStorage.setItem(ADDRESS_LINK_KEY, store.addressLink)
}

function activeStoreFrom(stores: StoreRecord[]) {
  if (!stores.length) return null
  const storedId = typeof window === 'undefined' ? '' : localStorage.getItem(ACTIVE_STORE_KEY)
  const store = stores.find((item) => item.id === storedId) ?? stores[0]
  hydrateStoreStorage(store)
  return store
}

function rpcResult(data: unknown): TransactionResult {
  const value = (data ?? {}) as RpcResult
  return {
    products: (value.products ?? []).map(mapProduct),
    history: (value.history ?? []).map(mapHistory),
  }
}

async function fetchStoresInternal() {
  const { data, error } = await client()
    .from('stores')
    .select('id,name,address,address_link,photo,created_at,updated_at')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as StoreRow[]).map(mapStore)
}

export const supabaseRepository: InventoryRepository = {
  mode: 'supabase',

  async getSnapshot() {
    const stores = await fetchStoresInternal()
    const activeStore = activeStoreFrom(stores)
    if (!activeStore) return { stores, activeStore: null, products: [], history: [] }

    const [productsResponse, historyResponse] = await Promise.all([
      client()
        .from('products')
        .select('id,nama_barang,brand,harga,stok,barcode,store_id,created_at,updated_at')
        .eq('store_id', activeStore.id)
        .order('nama_barang', { ascending: true }),
      client()
        .from('history')
        .select('id,barcode,tanggal,nama_barang,brand,kategori,jumlah,harga,keterangan,store_id,oleh')
        .eq('store_id', activeStore.id)
        .order('tanggal', { ascending: false })
        .limit(500),
    ])

    if (productsResponse.error) throw new Error(productsResponse.error.message)
    if (historyResponse.error) throw new Error(historyResponse.error.message)

    return {
      stores,
      activeStore,
      products: ((productsResponse.data ?? []) as ProductRow[]).map(mapProduct),
      history: ((historyResponse.data ?? []) as HistoryRow[]).map(mapHistory),
    }
  },

  fetchStores: fetchStoresInternal,

  async setActiveStore(storeId) {
    const stores = await fetchStoresInternal()
    const store = stores.find((item) => item.id === storeId)
    if (!store) throw new Error('Toko tidak ditemukan atau tidak dapat diakses')
    hydrateStoreStorage(store)
  },

  async addStore(store) {
    const { data, error } = await client()
      .from('stores')
      .insert({
        name: store.name.trim(),
        address: store.address.trim(),
        address_link: store.addressLink.trim(),
        photo: store.photo || null,
      })
      .select('id,name,address,address_link,photo,created_at,updated_at')
      .single()
    if (error) throw new Error(error.message)
    const created = mapStore(data as StoreRow)
    hydrateStoreStorage(created)
    return created
  },

  async updateStore(id, store) {
    const { error } = await client()
      .from('stores')
      .update({
        name: store.name.trim(),
        address: store.address.trim(),
        address_link: store.addressLink.trim(),
        photo: store.photo || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw new Error(error.message)
  },

  async deleteStore(id) {
    const { error } = await client().from('stores').delete().eq('id', id)
    if (error) throw new Error(error.message)
  },

  async addProduct(product) {
    const { data, error } = await client()
      .from('products')
      .insert({
        store_id: product.storeId,
        nama_barang: product.namaBarang.trim(),
        brand: product.brand.trim(),
        harga: product.harga,
        stok: product.stok,
        barcode: product.barcode.trim() || null,
      })
      .select('id,nama_barang,brand,harga,stok,barcode,store_id,created_at,updated_at')
      .single()
    if (error) throw new Error(error.message)
    return mapProduct(data as ProductRow)
  },

  async updateProduct(id, product, expectedStock) {
    const { data, error } = await client().rpc('update_inventory_product', {
      p_product_id: id,
      p_store_id: product.storeId,
      p_name: product.namaBarang.trim(),
      p_brand: product.brand.trim(),
      p_price: product.harga,
      p_stock: product.stok,
      p_barcode: product.barcode.trim() || null,
      p_expected_stock: expectedStock,
    })
    if (error) throw new Error(error.message)
    return rpcResult(data)
  },

  async deleteProduct(id) {
    const { error } = await client().from('products').delete().eq('id', id)
    if (error) throw new Error(error.message)
  },

  async processTransaction(input) {
    const storeIds = new Set(input.items.map((item) => item.product.storeId))
    if (storeIds.size !== 1) throw new Error('Semua item transaksi harus berasal dari toko yang sama')
    const storeId = input.items[0]?.product.storeId
    if (!storeId) throw new Error('Toko transaksi tidak ditemukan')

    const { data, error } = await client().rpc('process_inventory_transaction', {
      p_request_id: input.requestId ?? crypto.randomUUID(),
      p_store_id: storeId,
      p_category: input.category,
      p_items: input.items.map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
      p_note: input.note ?? null,
      p_operator: input.operator ?? 'Kasir',
      p_date: input.date ? new Date(input.date).toISOString() : new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
    return rpcResult(data)
  },
}

import { databaseError, requireSupabase } from '@/lib/supabase'
import type { InventoryRepository } from '@/lib/inventory-service'
import type { AuditLog, HistoryItem, Product, ProductInput, StoreInput, StoreRecord, StoreRole, TransactionResult } from '@/lib/types'

const PAGE_SIZE = 1000
const STORE_COLUMNS = 'id,owner_id,name,address,address_link,photo,created_at,updated_at'
const PRODUCT_COLUMNS = 'id,store_id,nama_barang,brand,harga,stok,barcode,created_at,updated_at'
const HISTORY_COLUMNS = 'id,store_id,product_id,barcode,tanggal,nama_barang,brand,kategori,jumlah,harga,keterangan,oleh,updated_at'
const AUDIT_COLUMNS = 'id,store_id,actor_id,actor_name,entity,action,record_id,before_data,after_data,created_at'

const selectColumns = {
  stores: STORE_COLUMNS,
  products: PRODUCT_COLUMNS,
  history: HISTORY_COLUMNS,
} as const

const names: Record<string, string> = { store_id: 'storeId', owner_id: 'ownerId', product_id: 'productId', actor_id: 'actorId', actor_name: 'actorName', record_id: 'recordId', before_data: 'beforeData', after_data: 'afterData', nama_barang: 'namaBarang', address_link: 'addressLink', created_at: 'createdAt', updated_at: 'updatedAt' }
function fromRow<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [names[key] ?? key, value])) as T
}
function storeRow(s: StoreInput) { return { name: s.name, address: s.address, address_link: s.addressLink, photo: s.photo ?? null } }
function productRow(p: ProductInput) { return { store_id: p.storeId, nama_barang: p.namaBarang, brand: p.brand, harga: p.harga, stok: p.stok, barcode: p.barcode } }
function result(data: { products: Record<string, unknown>[]; history: Record<string, unknown>[] }): TransactionResult {
  return { products: data.products.map(fromRow<Product>), history: data.history.map(fromRow<HistoryItem>) }
}

type ReadRowsOptions = {
  storeId?: string
  pageSize?: number
  onFirstPage?: (rows: Record<string, unknown>[]) => void
}

// Supabase defaults to a row limit. Page explicitly so reports never silently omit rows.
// PAGE_SIZE=1000 cuts request count while onFirstPage keeps the UI responsive.
async function readRows(table: 'stores' | 'products' | 'history', options: ReadRowsOptions = {}) {
  const rows: Record<string, unknown>[] = []
  const pageSize = options.pageSize ?? PAGE_SIZE
  for (let offset = 0; ; offset += pageSize) {
    const client: any = requireSupabase()
    let query = client.from(table).select(selectColumns[table])
    if (options.storeId) query = query.eq('store_id', options.storeId)
    if (table === 'history') {
      query = query.order('tanggal', { ascending: false }).order('id')
    } else {
      query = query.order('id')
    }
    const { data, error } = await query.range(offset, offset + pageSize - 1)
    if (error) throw databaseError(error)
    const pageRows = (data ?? []) as unknown as Record<string, unknown>[]
    rows.push(...pageRows)
    if (offset === 0) options.onFirstPage?.([...rows])
    if (pageRows.length < pageSize) return rows
  }
}
async function stores() { return (await readRows('stores')).map(fromRow<StoreRecord>) }

export const supabaseRepository: InventoryRepository = {
  mode: 'supabase',
  fetchStores: stores,
  async getSnapshot(onPartial) {
    const storedId = localStorage.getItem('activeStoreId')
    const storesRequest = stores()
    const productRequest = storedId ? readRows('products', { storeId: storedId }) : null
    // A store can be removed while its cached ID remains in this browser.
    void productRequest?.catch(() => undefined)
    const allStores = await storesRequest
    const activeStore = allStores.find(s => s.id === storedId) ?? allStores[0] ?? null
    if (!activeStore) {
      const empty = { stores: allStores, activeStore: null, storeRole: null, products: [], history: [] }
      onPartial?.(empty)
      return empty
    }
    localStorage.setItem('activeStoreId', activeStore.id)
    const client = requireSupabase()
    const roleRequest = client.rpc('current_store_role', { p_store_id: activeStore.id })
    const userRequest = client.auth.getUser()
    const productRows = await (storedId === activeStore.id ? productRequest! : readRows('products', { storeId: activeStore.id }))
    const roleResult = await roleRequest
    const userResult = await userRequest
    if (userResult.error || !userResult.data.user) throw new Error('Sesi login tidak valid. Silakan masuk kembali.')
    const storeRole = (roleResult.data as StoreRole | null)
      ?? (activeStore.ownerId === userResult.data.user.id ? 'owner' : null)
    if (roleResult.error && !storeRole) throw databaseError(roleResult.error)
    if (!storeRole) throw new Error('Akses ke cabang ini sudah tidak aktif. Pilih cabang lain atau hubungi pemilik toko.')
    const products = productRows.map(fromRow<Product>)
    onPartial?.({ stores: allStores, activeStore, storeRole, products, history: [] })
    const historyRows = await readRows('history', {
      storeId: activeStore.id,
      onFirstPage: rows => onPartial?.({ stores: allStores, activeStore, storeRole, products, history: rows.map(fromRow<HistoryItem>) }),
    })
    return { stores: allStores, activeStore, storeRole, products, history: historyRows.map(fromRow<HistoryItem>) }
  },
  async setActiveStore(id) { localStorage.setItem('activeStoreId', id) },
  async addStore(store) {
    const { data, error } = await requireSupabase().from('stores').insert(storeRow(store)).select(STORE_COLUMNS).single()
    if (error) throw databaseError(error)
    localStorage.setItem('activeStoreId', data.id)
    return fromRow<StoreRecord>(data)
  },
  async updateStore(id, store) {
    const { error } = await requireSupabase().from('stores').update(storeRow(store)).eq('id', id).select('id').single()
    if (error) throw databaseError(error)
  },
  async deleteStore(id) {
    const { error } = await requireSupabase().from('stores').delete().eq('id', id).select('id').single()
    if (error) throw databaseError(error)
  },
  async addProduct(product) {
    const { data, error } = await requireSupabase().from('products').insert(productRow(product)).select(PRODUCT_COLUMNS).single()
    if (error) throw databaseError(error)
    return fromRow<Product>(data)
  },
  async updateProduct(id, product, expectedStock) {
    const { data, error } = await requireSupabase().rpc('update_inventory_product', {
      p_id: id, p_store_id: product.storeId, p_expected_stock: expectedStock, p_product: productRow(product),
    })
    if (error) throw databaseError(error)
    return result(data)
  },
  async deleteProduct(id) {
    const { error } = await requireSupabase().from('products').delete().eq('id', id).select('id').single()
    if (error) throw databaseError(error)
  },
  async processTransaction(input) {
    const { data, error } = await requireSupabase().rpc('process_inventory_transaction', {
      p_store_id: input.items[0].product.storeId, p_request_id: input.requestId,
      p_category: input.category, p_items: input.items.map(i => ({ productId: i.product.id, quantity: i.quantity })),
      p_note: input.note ?? null, p_operator: input.operator ?? null, p_date: input.date ?? null,
    })
    if (error) throw databaseError(error)
    return result(data)
  },
  async reviseTransaction(current, change) {
    if (!current.updatedAt) throw new Error('Migrasi transaksi terbaru belum terpasang. Hubungi administrator.')
    const { data, error } = await requireSupabase().rpc('revise_inventory_transaction', {
      p_store_id: current.storeId,
      p_history_id: current.id,
      p_expected_updated_at: current.updatedAt,
      p_change: change,
      p_delete: change === null,
    })
    if (error) throw databaseError(error)
    return { ...result(data), deletedId: data.deletedId }
  },
  async getAuditLogs(storeId) {
    const { data, error } = await requireSupabase().from('audit_logs').select(AUDIT_COLUMNS).eq('store_id', storeId).order('created_at', { ascending: false }).limit(200)
    if (error) throw databaseError(error)
    return data.map(fromRow<AuditLog>)
  },
}

import { databaseError, requireSupabase } from '@/lib/supabase'
import type { InventoryRepository } from '@/lib/inventory-service'
import type { HistoryItem, Product, ProductInput, StoreInput, StoreRecord, TransactionResult } from '@/lib/types'

const names: Record<string, string> = { store_id: 'storeId', nama_barang: 'namaBarang', address_link: 'addressLink', created_at: 'createdAt', updated_at: 'updatedAt' }
function fromRow<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [names[key] ?? key, value])) as T
}
function storeRow(s: StoreInput) { return { name: s.name, address: s.address, address_link: s.addressLink, photo: s.photo ?? null } }
function productRow(p: ProductInput) { return { store_id: p.storeId, nama_barang: p.namaBarang, brand: p.brand, harga: p.harga, stok: p.stok, barcode: p.barcode } }
function result(data: { products: Record<string, unknown>[]; history: Record<string, unknown>[] }): TransactionResult {
  return { products: data.products.map(fromRow<Product>), history: data.history.map(fromRow<HistoryItem>) }
}

// Supabase defaults to a row limit. Page explicitly so reports never silently omit rows after 1000.
async function readRows(table: 'stores' | 'products' | 'history', storeId?: string) {
  const rows: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += 500) {
    let query = requireSupabase().from(table).select('*')
    if (storeId) query = query.eq('store_id', storeId)
    if (table === 'history') query = query.order('tanggal', { ascending: false })
    const { data, error } = await query.order('id').range(offset, offset + 499)
    if (error) throw databaseError(error)
    rows.push(...data)
    if (data.length < 500) return rows
  }
}
async function stores() { return (await readRows('stores')).map(fromRow<StoreRecord>) }

export const supabaseRepository: InventoryRepository = {
  mode: 'supabase',
  fetchStores: stores,
  async getSnapshot() {
    const allStores = await stores()
    const activeStore = allStores.find(s => s.id === localStorage.getItem('activeStoreId')) ?? allStores[0] ?? null
    if (!activeStore) return { stores: allStores, activeStore, products: [], history: [] }
    localStorage.setItem('activeStoreId', activeStore.id)
    const [products, history] = await Promise.all([readRows('products', activeStore.id), readRows('history', activeStore.id)])
    return { stores: allStores, activeStore, products: products.map(fromRow<Product>), history: history.map(fromRow<HistoryItem>) }
  },
  async setActiveStore(id) { localStorage.setItem('activeStoreId', id) },
  async addStore(store) {
    const { data, error } = await requireSupabase().from('stores').insert(storeRow(store)).select().single()
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
    const { data, error } = await requireSupabase().from('products').insert(productRow(product)).select().single()
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
}

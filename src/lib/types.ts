export type TransactionCategory = 'masuk' | 'keluar'

export type StoreRecord = {
  id: string
  name: string
  address: string
  addressLink: string
  photo?: string
  createdAt: string
  updatedAt?: string
}

export type Product = {
  id: string
  namaBarang: string
  brand: string
  harga: number
  stok: number
  barcode: string
  storeId: string
  createdAt: string
  updatedAt?: string
}

export type HistoryItem = {
  id: string
  productId?: string | null
  barcode: string
  tanggal: string
  namaBarang: string
  brand: string
  kategori: TransactionCategory
  jumlah: number
  harga: number
  keterangan?: string
  storeId: string
  oleh?: string
  updatedAt?: string
}

export type AuditLog = {
  id: string
  storeId: string
  actorId?: string | null
  entity: 'store' | 'product' | 'transaction'
  action: 'insert' | 'update' | 'delete'
  recordId: string
  beforeData: Record<string, unknown> | null
  afterData: Record<string, unknown> | null
  createdAt: string
}

export type TransactionChange = {
  productId: string
  category: TransactionCategory
  quantity: number
  price: number
  date: string
  note: string
  operator: string
}

export type TransactionRevisionResult = TransactionResult & { deletedId?: string }

export type CartItem = {
  product: Product
  quantity: number
}

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>

export type StoreInput = Omit<StoreRecord, 'id' | 'createdAt' | 'updatedAt'>

export type TransactionResult = { products: Product[]; history: HistoryItem[] }

export type TransactionInput = {
  requestId?: string
  category: TransactionCategory
  items: CartItem[]
  note?: string
  operator?: string
  date?: string
}

export type InventorySnapshot = {
  stores: StoreRecord[]
  activeStore: StoreRecord | null
  products: Product[]
  history: HistoryItem[]
}

export type RevenueRow = {
  id: string
  tanggal: string
  namaBarang: string
  qty: number
  harga: number
  total: number
}

export type ReportPeriod = 'harian' | 'mingguan' | 'bulanan' | 'tahunan'

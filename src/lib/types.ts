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
}

export type CartItem = {
  product: Product
  quantity: number
}

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>

export type StoreInput = Omit<StoreRecord, 'id' | 'createdAt' | 'updatedAt'>

export type TransactionInput = {
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

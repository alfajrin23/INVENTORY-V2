import type { HistoryItem, Product, StoreRecord } from '@/lib/types'

type SeedData = {
  stores: StoreRecord[]
  products: Product[]
  history: HistoryItem[]
}

const today = () => new Date()

function isoDaysAgo(days: number, hour = 10, minute = 0) {
  const date = today()
  date.setDate(date.getDate() - days)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

export function createSeedData(): SeedData {
  const now = today().toISOString()
  const stores: StoreRecord[] = [
    {
      id: 'store-main',
      name: 'ABElektronik Pusat',
      address: 'Jl. Pasar Baru No. 18, Jakarta',
      addressLink: 'https://maps.google.com/?q=ABElektronik',
      createdAt: now,
    },
    {
      id: 'store-service',
      name: 'ABElektronik Service',
      address: 'Jl. Merdeka Raya No. 7, Bekasi',
      addressLink: 'https://maps.google.com/?q=Bekasi',
      createdAt: now,
    },
  ]

  const products: Product[] = [
    {
      id: 'prd-001',
      namaBarang: 'Charger USB-C 33W',
      brand: 'Anker',
      harga: 185000,
      stok: 42,
      barcode: '8991001000011',
      storeId: 'store-main',
      createdAt: now,
    },
    {
      id: 'prd-002',
      namaBarang: 'Kabel HDMI 2 Meter',
      brand: 'Vention',
      harga: 72000,
      stok: 16,
      barcode: '8991001000028',
      storeId: 'store-main',
      createdAt: now,
    },
    {
      id: 'prd-003',
      namaBarang: 'Speaker Bluetooth Mini',
      brand: 'JBL',
      harga: 325000,
      stok: 8,
      barcode: '8991001000035',
      storeId: 'store-main',
      createdAt: now,
    },
    {
      id: 'prd-004',
      namaBarang: 'Powerbank 20000 mAh',
      brand: 'Baseus',
      harga: 298000,
      stok: 5,
      barcode: '8991001000042',
      storeId: 'store-main',
      createdAt: now,
    },
    {
      id: 'prd-005',
      namaBarang: 'Earphone TWS Air Lite',
      brand: 'Soundcore',
      harga: 245000,
      stok: 23,
      barcode: '8991001000059',
      storeId: 'store-main',
      createdAt: now,
    },
    {
      id: 'prd-006',
      namaBarang: 'Stop Kontak 6 Lubang',
      brand: 'Krisbow',
      harga: 118000,
      stok: 3,
      barcode: '8991001000066',
      storeId: 'store-main',
      createdAt: now,
    },
    {
      id: 'prd-007',
      namaBarang: 'Mouse Wireless Silent',
      brand: 'Logitech',
      harga: 159000,
      stok: 31,
      barcode: '8991001000073',
      storeId: 'store-service',
      createdAt: now,
    },
    {
      id: 'prd-008',
      namaBarang: 'Keyboard Mechanical TKL',
      brand: 'Keychron',
      harga: 785000,
      stok: 7,
      barcode: '8991001000080',
      storeId: 'store-service',
      createdAt: now,
    },
  ]

  const history: HistoryItem[] = [
    {
      id: 'hst-001',
      barcode: '8991001000011',
      tanggal: isoDaysAgo(0, 9, 12),
      namaBarang: 'Charger USB-C 33W',
      brand: 'Anker',
      kategori: 'keluar',
      jumlah: 3,
      harga: 185000,
      keterangan: 'Penjualan',
      storeId: 'store-main',
      oleh: 'Kasir Utama',
    },
    {
      id: 'hst-002',
      barcode: '8991001000035',
      tanggal: isoDaysAgo(0, 11, 25),
      namaBarang: 'Speaker Bluetooth Mini',
      brand: 'JBL',
      kategori: 'keluar',
      jumlah: 1,
      harga: 325000,
      keterangan: 'Penjualan',
      storeId: 'store-main',
      oleh: 'Kasir Utama',
    },
    {
      id: 'hst-003',
      barcode: '8991001000042',
      tanggal: isoDaysAgo(1, 15, 5),
      namaBarang: 'Powerbank 20000 mAh',
      brand: 'Baseus',
      kategori: 'keluar',
      jumlah: 2,
      harga: 298000,
      keterangan: 'Penjualan',
      storeId: 'store-main',
      oleh: 'Admin',
    },
    {
      id: 'hst-004',
      barcode: '8991001000028',
      tanggal: isoDaysAgo(2, 14, 45),
      namaBarang: 'Kabel HDMI 2 Meter',
      brand: 'Vention',
      kategori: 'keluar',
      jumlah: 5,
      harga: 72000,
      keterangan: 'Penjualan',
      storeId: 'store-main',
      oleh: 'Kasir Utama',
    },
    {
      id: 'hst-005',
      barcode: '8991001000066',
      tanggal: isoDaysAgo(3, 10, 18),
      namaBarang: 'Stop Kontak 6 Lubang',
      brand: 'Krisbow',
      kategori: 'keluar',
      jumlah: 1,
      harga: 118000,
      keterangan: 'Penjualan',
      storeId: 'store-main',
      oleh: 'Admin',
    },
    {
      id: 'hst-006',
      barcode: '8991001000011',
      tanggal: isoDaysAgo(4, 13, 40),
      namaBarang: 'Charger USB-C 33W',
      brand: 'Anker',
      kategori: 'keluar',
      jumlah: 4,
      harga: 185000,
      keterangan: 'Penjualan',
      storeId: 'store-main',
      oleh: 'Kasir Utama',
    },
    {
      id: 'hst-007',
      barcode: '8991001000059',
      tanggal: isoDaysAgo(5, 16, 22),
      namaBarang: 'Earphone TWS Air Lite',
      brand: 'Soundcore',
      kategori: 'keluar',
      jumlah: 3,
      harga: 245000,
      keterangan: 'Penjualan',
      storeId: 'store-main',
      oleh: 'Kasir Utama',
    },
    {
      id: 'hst-008',
      barcode: '8991001000035',
      tanggal: isoDaysAgo(6, 12, 3),
      namaBarang: 'Speaker Bluetooth Mini',
      brand: 'JBL',
      kategori: 'masuk',
      jumlah: 8,
      harga: 325000,
      keterangan: 'Restock distributor',
      storeId: 'store-main',
      oleh: 'Admin',
    },
    {
      id: 'hst-009',
      barcode: '8991001000073',
      tanggal: isoDaysAgo(0, 12, 16),
      namaBarang: 'Mouse Wireless Silent',
      brand: 'Logitech',
      kategori: 'keluar',
      jumlah: 2,
      harga: 159000,
      keterangan: 'Penjualan',
      storeId: 'store-service',
      oleh: 'Kasir Service',
    },
    {
      id: 'hst-010',
      barcode: '8991001000080',
      tanggal: isoDaysAgo(7, 12, 16),
      namaBarang: 'Keyboard Mechanical TKL',
      brand: 'Keychron',
      kategori: 'masuk',
      jumlah: 4,
      harga: 785000,
      keterangan: 'Stok awal',
      storeId: 'store-service',
      oleh: 'Kasir Service',
    },
  ]

  return { stores, products, history }
}

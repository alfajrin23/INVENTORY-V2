import {
  endOfDay,
  endOfMonth,
  formatCurrency,
  getTodaySales,
  indonesiaDays,
  isWithinDateRange,
  startOfDay,
  startOfMonth,
  toInputDate,
  trendFromValues,
} from '@/lib/format'
import type { HistoryItem, Product, RevenueRow } from '@/lib/types'

export function getDashboardMetrics(products: Product[], history: HistoryItem[]) {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const todaySales = getTodaySales(history)
  const yesterdaySales = history.filter(
    (item) =>
      item.kategori === 'keluar' &&
      isWithinDateRange(item.tanggal, startOfDay(yesterday), endOfDay(yesterday)),
  )

  const todayRevenue = todaySales.reduce((sum, item) => sum + item.harga * item.jumlah, 0)
  const yesterdayRevenue = yesterdaySales.reduce((sum, item) => sum + item.harga * item.jumlah, 0)
  const lowStockCount = products.filter((product) => product.stok <= 5).length

  return {
    todayRevenue,
    todayRevenueLabel: formatCurrency(todayRevenue),
    totalProducts: products.length,
    todayTransactions: todaySales.length,
    lowStockCount,
    revenueTrend: trendFromValues(todayRevenue, yesterdayRevenue),
  }
}

export function getDailyRevenueSeries(history: HistoryItem[]) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - index))
    return { tanggal: toInputDate(date), hari: indonesiaDays[date.getDay()], pendapatan: 0, transaksi: 0 }
  })
  const byDate = new Map(days.map(day => [day.tanggal, day]))
  for (const item of history) {
    if (item.kategori !== 'keluar') continue
    const day = byDate.get(toInputDate(new Date(item.tanggal)))
    if (!day) continue
    day.pendapatan += item.harga * item.jumlah
    day.transaksi++
  }
  return days
}

export function getTopProductsThisMonth(history: HistoryItem[]) {
  const now = new Date()
  const start = startOfMonth(now.getFullYear(), now.getMonth())
  const end = endOfMonth(now.getFullYear(), now.getMonth())
  const sold = new Map<string, { namaBarang: string; brand: string; jumlah: number; pendapatan: number }>()

  history
    .filter((item) => item.kategori === 'keluar' && isWithinDateRange(item.tanggal, start, end))
    .forEach((item) => {
      const key = `${item.brand}-${item.namaBarang}`
      const current = sold.get(key) ?? {
        namaBarang: item.namaBarang,
        brand: item.brand,
        jumlah: 0,
        pendapatan: 0,
      }
      current.jumlah += item.jumlah
      current.pendapatan += item.harga * item.jumlah
      sold.set(key, current)
    })

  return Array.from(sold.values())
    .sort((a, b) => b.jumlah - a.jumlah)
    .slice(0, 10)
}

export function getRevenueRowsByRange(history: HistoryItem[], start: Date, end: Date): RevenueRow[] {
  return history
    .filter((item) => item.kategori === 'keluar' && isWithinDateRange(item.tanggal, start, end))
    .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
    .map((item) => ({
      id: item.id,
      tanggal: item.tanggal,
      namaBarang: item.namaBarang,
      qty: item.jumlah,
      harga: item.harga,
      total: item.harga * item.jumlah,
    }))
}

export function getTotalRevenue(rows: RevenueRow[]) {
  return rows.reduce((sum, row) => sum + row.total, 0)
}

export function getStockValue(products: Product[]) {
  return products.reduce((sum, product) => sum + product.harga * product.stok, 0)
}

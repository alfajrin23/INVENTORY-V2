import type { HistoryItem, Product, RevenueRow } from '@/lib/types'

export const indonesiaMonths = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

export const indonesiaDays = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
]

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('id-ID').format(Number.isFinite(value) ? value : 0)
}

export function toInputDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateLabel(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function dateTimeLabel(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

export function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

export function startOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1, 0, 0, 0, 0)
}

export function endOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
}

export function getWeekRange(year: number, monthIndex: number, week: number) {
  const startDay = (week - 1) * 7 + 1
  const endDay = week === 4 ? new Date(year, monthIndex + 1, 0).getDate() : week * 7

  return {
    start: new Date(year, monthIndex, startDay, 0, 0, 0, 0),
    end: new Date(year, monthIndex, endDay, 23, 59, 59, 999),
  }
}

export function isWithinDateRange(value: string, start: Date, end: Date) {
  const date = new Date(value)
  return date >= start && date <= end
}

export function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase('id-ID')
}

export function matchProduct(product: Product, query: string) {
  const normalized = normalizeSearch(query)
  return (
    normalizeSearch(product.namaBarang).includes(normalized) ||
    normalizeSearch(product.brand).includes(normalized) ||
    normalizeSearch(product.barcode).includes(normalized)
  )
}

export function makeRevenueRows(history: HistoryItem[]): RevenueRow[] {
  return history
    .filter((item) => item.kategori === 'keluar')
    .map((item) => ({
      id: item.id,
      tanggal: item.tanggal,
      namaBarang: item.namaBarang,
      qty: item.jumlah,
      harga: item.harga,
      total: item.harga * item.jumlah,
    }))
}

export function getTodaySales(history: HistoryItem[]) {
  const today = new Date()
  const start = startOfDay(today)
  const end = endOfDay(today)
  return history.filter((item) => item.kategori === 'keluar' && isWithinDateRange(item.tanggal, start, end))
}

export function buildWhatsAppSummary(history: HistoryItem[], storeName: string) {
  const todayItems = getTodaySales(history)
  const total = todayItems.reduce((sum, item) => sum + item.jumlah * item.harga, 0)
  const lines = todayItems.map((item, index) => {
    const subtotal = formatCurrency(item.jumlah * item.harga)
    return `${index + 1}. ${item.namaBarang} x${item.jumlah} - ${subtotal}`
  })

  return [
    `Ringkasan penjualan harian ${storeName}`,
    `Tanggal: ${dateLabel(new Date())}`,
    '',
    lines.length ? lines.join('\n') : 'Belum ada transaksi keluar hari ini.',
    '',
    `Total: ${formatCurrency(total)}`,
  ].join('\n')
}

export function trendFromValues(current: number, previous: number) {
  if (previous === 0 && current > 0) {
    return 100
  }

  if (previous === 0) {
    return 0
  }

  return ((current - previous) / previous) * 100
}

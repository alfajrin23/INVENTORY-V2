import type { HistoryItem, Product } from '@/lib/types'

export type RestockStatus = 'habis' | 'kritis' | 'laris'

export type RestockRecommendation = {
  id: string
  name: string
  brand: string
  barcode: string
  stock: number
  sold7: number
  sold30: number
  targetStock: number
  suggestedQty: number
  status: RestockStatus
  priority: number
  product: Product
}

const DAY_MS = 24 * 60 * 60 * 1000
export const MIN_SAFE_STOCK = 5
const COVERAGE_DAYS = 21
const SAFETY_FACTOR = 1.25

export function buildRestockRecommendations(
  products: Product[],
  history: HistoryItem[],
  storeId?: string,
  now = Date.now(),
): RestockRecommendation[] {
  const sevenDaysAgo = now - 7 * DAY_MS
  const thirtyDaysAgo = now - 30 * DAY_MS
  const salesByBarcode = new Map<string, { sold7: number; sold30: number }>()

  for (const item of history) {
    if (item.kategori !== 'keluar') continue
    if (storeId && item.storeId !== storeId) continue

    const time = new Date(item.tanggal).getTime()
    if (!Number.isFinite(time) || time < thirtyDaysAgo || time > now) continue

    const current = salesByBarcode.get(item.barcode) ?? { sold7: 0, sold30: 0 }
    current.sold30 += item.jumlah
    if (time >= sevenDaysAgo) current.sold7 += item.jumlah
    salesByBarcode.set(item.barcode, current)
  }

  const scopedProducts = storeId ? products.filter(product => product.storeId === storeId) : products
  const metrics = scopedProducts.map(product => {
    const sales = salesByBarcode.get(product.barcode) ?? { sold7: 0, sold30: 0 }
    return { product, ...sales }
  })

  const topSellerIds = new Set(
    metrics
      .filter(item => item.sold30 > 0)
      .sort((a, b) => b.sold30 - a.sold30 || b.sold7 - a.sold7)
      .slice(0, Math.min(3, metrics.length))
      .map(item => item.product.id),
  )

  return metrics
    .map(({ product, sold7, sold30 }): RestockRecommendation | null => {
      const recentDailySales = Math.max(sold7 / 7, sold30 / 30)
      const projectedBuffer = Math.ceil(recentDailySales * COVERAGE_DAYS * SAFETY_FACTOR)
      const targetStock = Math.max(MIN_SAFE_STOCK, projectedBuffer)
      const suggestedQty = Math.max(0, targetStock - product.stok)
      const isFastSeller = topSellerIds.has(product.id) && sold30 > 0

      let status: RestockStatus | null = null
      let priority = 0
      if (product.stok === 0) {
        status = 'habis'
        priority = 3
      } else if (product.stok <= MIN_SAFE_STOCK) {
        status = 'kritis'
        priority = 2
      } else if (isFastSeller && suggestedQty > 0) {
        status = 'laris'
        priority = 1
      }

      if (!status) return null

      return {
        id: product.id,
        name: product.namaBarang,
        brand: product.brand,
        barcode: product.barcode,
        stock: product.stok,
        sold7,
        sold30,
        targetStock,
        suggestedQty: Math.max(suggestedQty, product.stok === 0 ? MIN_SAFE_STOCK : 0),
        status,
        priority,
        product,
      }
    })
    .filter((item): item is RestockRecommendation => item !== null)
    .sort((a, b) => b.priority - a.priority || b.suggestedQty - a.suggestedQty || b.sold30 - a.sold30)
}

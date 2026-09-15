import { Flame, PackageCheck, PackageX, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'

import { GlassPanel } from '@/components/shared/glass-panel'
import { Badge } from '@/components/ui/badge'
import { useInventory } from '@/hooks/use-inventory'
import { formatNumber } from '@/lib/format'

type RestockStatus = 'habis' | 'kritis' | 'laris'

type RestockRecommendation = {
  id: string
  name: string
  brand: string
  stock: number
  sold7: number
  sold30: number
  targetStock: number
  suggestedQty: number
  status: RestockStatus
  priority: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_SAFE_STOCK = 5
const COVERAGE_DAYS = 21
const SAFETY_FACTOR = 1.25

function statusLabel(status: RestockStatus) {
  if (status === 'habis') return 'Habis'
  if (status === 'kritis') return 'Stok kritis'
  return 'Laris'
}

function statusClass(status: RestockStatus) {
  if (status === 'habis') return 'bg-rose-400/18 text-rose-100 ring-1 ring-rose-300/25'
  if (status === 'kritis') return 'bg-amber-300/18 text-amber-100 ring-1 ring-amber-200/25'
  return 'bg-cyan-300/16 text-cyan-100 ring-1 ring-cyan-200/20'
}

function statusIcon(status: RestockStatus) {
  if (status === 'habis') return <PackageX className="size-4" />
  if (status === 'kritis') return <TriangleAlert className="size-4" />
  return <Flame className="size-4" />
}

export function RestockRecommendations() {
  const { activeStore, products, history, loading } = useInventory()

  const recommendations = useMemo(() => {
    const now = Date.now()
    const sevenDaysAgo = now - 7 * DAY_MS
    const thirtyDaysAgo = now - 30 * DAY_MS
    const salesByBarcode = new Map<string, { sold7: number; sold30: number }>()

    for (const item of history) {
      if (item.kategori !== 'keluar') continue
      if (activeStore && item.storeId !== activeStore.id) continue

      const time = new Date(item.tanggal).getTime()
      if (!Number.isFinite(time) || time < thirtyDaysAgo || time > now) continue

      const current = salesByBarcode.get(item.barcode) ?? { sold7: 0, sold30: 0 }
      current.sold30 += item.jumlah
      if (time >= sevenDaysAgo) current.sold7 += item.jumlah
      salesByBarcode.set(item.barcode, current)
    }

    const metrics = products.map(product => {
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
          stock: product.stok,
          sold7,
          sold30,
          targetStock,
          suggestedQty: Math.max(suggestedQty, product.stok === 0 ? MIN_SAFE_STOCK : 0),
          status,
          priority,
        }
      })
      .filter((item): item is RestockRecommendation => item !== null)
      .sort((a, b) => b.priority - a.priority || b.suggestedQty - a.suggestedQty || b.sold30 - a.sold30)
      .slice(0, 10)
  }, [activeStore, history, products])

  return (
    <GlassPanel className="p-4 sm:p-5" glow="amber">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <PackageCheck className="size-5 text-amber-200" />
            <h2 className="text-xl font-semibold text-white">Rekomendasi Restock</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-white/55">
            Prioritas otomatis dari stok habis, stok kritis, lalu barang paling laris. Saran jumlah memakai pola barang keluar 7 dan 30 hari terakhir dengan buffer stok sekitar 21 hari.
          </p>
        </div>
        <Badge className="w-fit bg-amber-300/16 text-amber-100">
          {loading ? 'Menghitung...' : `${formatNumber(recommendations.length)} perlu perhatian`}
        </Badge>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map(item => <div key={item} className="h-44 animate-pulse rounded-2xl border border-white/10 bg-white/[0.05]" />)}
        </div>
      ) : recommendations.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recommendations.map((item, index) => (
            <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4 shadow-lg shadow-black/5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={statusClass(item.status)}>
                      {statusIcon(item.status)}
                      {statusLabel(item.status)}
                    </Badge>
                    <span className="text-xs font-medium text-white/38">Prioritas #{index + 1}</span>
                  </div>
                  <h3 className="mt-3 truncate font-semibold text-white">{item.name}</h3>
                  <p className="truncate text-sm text-white/48">{item.brand}</p>
                </div>
                <div className="rounded-xl bg-black/15 px-3 py-2 text-right">
                  <p className="text-[11px] uppercase tracking-wide text-white/38">Stok</p>
                  <p className="font-mono text-xl font-bold text-white">{formatNumber(item.stock)}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/8 bg-black/10 p-2.5">
                  <p className="text-[11px] text-white/42">Keluar 7 hari</p>
                  <p className="mt-1 font-mono font-semibold text-white">{formatNumber(item.sold7)} unit</p>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/10 p-2.5">
                  <p className="text-[11px] text-white/42">Keluar 30 hari</p>
                  <p className="mt-1 font-mono font-semibold text-white">{formatNumber(item.sold30)} unit</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.07] px-3 py-2.5">
                <div>
                  <p className="text-xs text-emerald-100/65">Saran restock</p>
                  <p className="text-xs text-white/42">Target stok {formatNumber(item.targetStock)} unit</p>
                </div>
                <p className="font-mono text-xl font-bold text-emerald-200">+{formatNumber(item.suggestedQty)}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] p-4">
          <PackageCheck className="size-5 shrink-0 text-emerald-200" />
          <div>
            <p className="font-medium text-white">Stok masih aman</p>
            <p className="text-sm text-white/52">Belum ada item habis, kritis, atau barang laris yang membutuhkan tambahan stok saat ini.</p>
          </div>
        </div>
      )}
    </GlassPanel>
  )
}

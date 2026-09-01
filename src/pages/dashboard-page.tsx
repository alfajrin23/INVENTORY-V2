import {
  AlertTriangle,
  ClipboardList,
  History,
  Package,
  ReceiptText,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { EmptyState, ErrorState, LoadingGrid } from '@/components/shared/data-state'
import { GlassPanel } from '@/components/shared/glass-panel'
import { MetricCard } from '@/components/shared/metric-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useInventory } from '@/hooks/use-inventory'
import { getDailyRevenueSeries, getDashboardMetrics, getTopProductsThisMonth } from '@/lib/analytics'
import { dateTimeLabel, formatCurrency, formatNumber } from '@/lib/format'
import { routes } from '@/lib/navigation'

export function DashboardPage() {
  const { products, history, loading, error, refresh } = useInventory()
  const metrics = getDashboardMetrics(products, history)
  const dailyRevenue = getDailyRevenueSeries(history)
  const topProducts = getTopProductsThisMonth(history)
  const recentHistory = history.slice(0, 6)

  if (error) {
    return <ErrorState message={error} onRetry={() => void refresh()} />
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          <LoadingGrid rows={4} className="md:col-span-2 xl:col-span-4 xl:grid-cols-4" />
        ) : (
          <>
            <MetricCard
              label="Pendapatan Hari Ini"
              value={metrics.todayRevenueLabel}
              detail="Realtime transaksi keluar"
              trend={metrics.revenueTrend}
              icon={<WalletCards className="size-5" />}
              accent="emerald"
            />
            <MetricCard
              label="Total Produk"
              value={formatNumber(metrics.totalProducts)}
              detail="SKU pada toko aktif"
              icon={<Package className="size-5" />}
              accent="cyan"
            />
            <MetricCard
              label="Transaksi Hari Ini"
              value={formatNumber(metrics.todayTransactions)}
              detail="Barang keluar tercatat"
              icon={<ReceiptText className="size-5" />}
              accent="violet"
            />
            <MetricCard
              label="Stok Rendah"
              value={formatNumber(metrics.lowStockCount)}
              detail="Produk stok 5 atau kurang"
              icon={<AlertTriangle className="size-5" />}
              accent={metrics.lowStockCount ? 'amber' : 'emerald'}
            />
          </>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <GlassPanel className="min-h-[370px] p-5" glow="cyan">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Pendapatan 7 Hari</h2>
              <p className="text-sm text-white/52">Bar dan line transaksi keluar</p>
            </div>
            <Badge className="bg-cyan-300/15 text-cyan-100">Mixed chart</Badge>
          </div>
          <div className="h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyRevenue} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="hari" stroke="rgba(255,255,255,0.55)" tickLine={false} axisLine={false} />
                <YAxis
                  stroke="rgba(255,255,255,0.55)"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${Number(value) / 1000}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(17,24,39,0.94)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: 14,
                    color: '#fff',
                  }}
                  formatter={(value, name) =>
                    name === 'pendapatan' ? [formatCurrency(Number(value)), 'Pendapatan'] : [value, 'Transaksi']
                  }
                />
                <Legend />
                <Bar dataKey="pendapatan" fill="#00d2ff" radius={[8, 8, 0, 0]} />
                <Line type="monotone" dataKey="transaksi" stroke="#ffb454" strokeWidth={3} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        <GlassPanel className="min-h-[370px] p-5" glow="violet">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Top Produk Bulan Ini</h2>
              <p className="text-sm text-white/52">Urutan berdasarkan jumlah terjual</p>
            </div>
            <Badge className="bg-violet-300/15 text-violet-100">Top 10</Badge>
          </div>
          <div className="h-[290px]">
            {topProducts.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                  <XAxis type="number" stroke="rgba(255,255,255,0.55)" tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="namaBarang"
                    width={126}
                    stroke="rgba(255,255,255,0.55)"
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(17,24,39,0.94)',
                      border: '1px solid rgba(255,255,255,0.14)',
                      borderRadius: 14,
                      color: '#fff',
                    }}
                    formatter={(value) => [formatNumber(Number(value)), 'Terjual']}
                  />
                  <Bar dataKey="jumlah" fill="#7b2ff7" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="Belum ada penjualan" description="Produk terlaris akan muncul setelah transaksi keluar tercatat." />
            )}
          </div>
        </GlassPanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <GlassPanel className="p-5" glow="amber">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="size-5 text-amber-200" />
            <h2 className="text-lg font-semibold text-white">Aksi Cepat</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <Button asChild className="h-14 justify-start bg-cyan-300 text-slate-950 hover:bg-cyan-200">
              <Link to={routes.products}>
                <Package className="size-5" />
                Data Barang
              </Link>
            </Button>
            <Button asChild className="h-14 justify-start bg-emerald-300 text-slate-950 hover:bg-emerald-200">
              <Link to={routes.history}>
                <History className="size-5" />
                History Barang
              </Link>
            </Button>
            <Button asChild className="h-14 justify-start bg-amber-300 text-slate-950 hover:bg-amber-200">
              <Link to={routes.reports}>
                <ClipboardList className="size-5" />
                Laporan
              </Link>
            </Button>
          </div>
        </GlassPanel>

        <GlassPanel className="p-5" glow="emerald">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Transaksi Terkini</h2>
              <p className="text-sm text-white/52">Masuk dan keluar dari toko aktif</p>
            </div>
            <Button asChild variant="outline" className="border-white/12 bg-white/[0.06] text-white hover:bg-white/12">
              <Link to={routes.history}>Lihat semua</Link>
            </Button>
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-white/10 lg:block">
            <Table>
              <TableHeader className="bg-white/[0.07]">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/62">Barang</TableHead>
                  <TableHead className="text-white/62">Kategori</TableHead>
                  <TableHead className="text-white/62">Qty</TableHead>
                  <TableHead className="text-white/62">Tanggal</TableHead>
                  <TableHead className="text-right text-white/62">Nilai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentHistory.map((item) => (
                  <TableRow key={item.id} className="border-white/10 hover:bg-white/[0.05]">
                    <TableCell>
                      <p className="font-medium text-white">{item.namaBarang}</p>
                      <p className="text-xs text-white/46">{item.brand}</p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          item.kategori === 'keluar'
                            ? 'bg-rose-300/14 text-rose-100'
                            : 'bg-emerald-300/14 text-emerald-100'
                        }
                      >
                        {item.kategori === 'keluar' ? 'Keluar' : 'Masuk'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-white/72">{item.jumlah}</TableCell>
                    <TableCell className="text-white/60">{dateTimeLabel(item.tanggal)}</TableCell>
                    <TableCell className="text-right font-mono text-white">{formatCurrency(item.harga * item.jumlah)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 lg:hidden">
            {recentHistory.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.055] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{item.namaBarang}</p>
                    <p className="text-sm text-white/50">{item.brand}</p>
                  </div>
                  <Badge className={item.kategori === 'keluar' ? 'bg-rose-300/14 text-rose-100' : 'bg-emerald-300/14 text-emerald-100'}>
                    {item.kategori}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-white/52">{dateTimeLabel(item.tanggal)}</span>
                  <span className="font-mono text-white">{formatCurrency(item.harga * item.jumlah)}</span>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      </section>
    </div>
  )
}

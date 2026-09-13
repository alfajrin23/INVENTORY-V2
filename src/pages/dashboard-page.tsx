import {
  ArrowRight,
  AlertTriangle,
  ClipboardList,
  History,
  Package,
  ReceiptText,
  TrendingUp,
  WalletCards,
  PackagePlus,
  PackageMinus,
  ScanLine,
  Plus,
  Box,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { useMemo, useState } from 'react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useInventory } from '@/hooks/use-inventory'
import { useMediaQuery } from '@/hooks/use-media-query'
import { getDailyRevenueSeries, getDashboardMetrics, getTopProductsThisMonth } from '@/lib/analytics'
import { dateTimeLabel, formatCurrency, formatNumber } from '@/lib/format'
import { routes } from '@/lib/navigation'

const chartTextColor = '#315f63'
const chartGridColor = 'rgba(49,95,99,0.14)'

export function DashboardPage() {
  const { products, history, loading, productsReady, error, refresh } = useInventory()
  const desktop = useMediaQuery('(min-width: 1024px)')
  const navigate = useNavigate()
  const { openScanner } = useOutletContext<{ openScanner: () => void }>()
  const [selectedDay, setSelectedDay] = useState(6)
  const metrics = useMemo(() => getDashboardMetrics(products, history), [products, history])
  const dailyRevenue = useMemo(() => getDailyRevenueSeries(history), [history])
  const topProducts = useMemo(() => getTopProductsThisMonth(history), [history])
  const recentHistory = useMemo(() => history.slice(0, 6), [history])

  if (error) {
    return <ErrorState message={error} onRetry={() => void refresh()} />
  }

  return (
    <div className="space-y-6">
      {!desktop && <div className="mobile-dashboard lg:hidden">
        <div className="mobile-page-heading">
          <div><h1>Ringkasan toko</h1><p>{new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p></div>
          <span className="mobile-date-badge">Hari ini</span>
        </div>
        {loading && !productsReady ? <LoadingGrid rows={3} /> : <>
          <section className="revenue-hero" aria-label="Pendapatan hari ini">
            <span>Pendapatan hari ini</span>
            <strong>{metrics.todayRevenueLabel}</strong>
            <div><span className="hero-trend"><TrendingUp size={14} /> {metrics.revenueTrend.toFixed(1)}%</span><span>dibanding kemarin</span></div>
          </section>
          <section className="mobile-metrics" aria-label="Metrik toko">
            <button onClick={() => navigate(routes.products)}><Package size={16} /><span>Produk</span><strong>{formatNumber(metrics.totalProducts)}</strong></button>
            <button onClick={() => navigate(routes.history)}><ReceiptText size={16} /><span>Transaksi keluar</span><strong>{formatNumber(metrics.todayTransactions)}</strong></button>
            <button className="warning" onClick={() => navigate(`${routes.products}?stock=low`)}><AlertTriangle size={16} /><span>Stok rendah</span><strong>{formatNumber(metrics.lowStockCount)}</strong></button>
          </section>
          <section className="mobile-quick-actions" aria-label="Aksi cepat">
            <button onClick={() => navigate(`${routes.history}?action=masuk`)}><span className="action-icon incoming"><PackagePlus /></span><span>Masuk</span></button>
            <button onClick={() => navigate(`${routes.history}?action=keluar`)}><span className="action-icon outgoing"><PackageMinus /></span><span>Keluar</span></button>
            <button onClick={openScanner}><span className="action-icon scan"><ScanLine /></span><span>Scan</span></button>
            <button onClick={() => navigate(`${routes.products}?create=1`)}><span className="action-icon add"><Plus /></span><span>Tambah</span></button>
          </section>
          <section className="mobile-chart-card">
            <div className="section-heading"><h2>Pendapatan 7 hari</h2><Link to={routes.revenueDay}>Detail <ArrowUpRight size={15} /></Link></div>
            <strong className="chart-total">{formatCurrency(dailyRevenue.reduce((total, day) => total + day.pendapatan, 0))}</strong>
            <p className="chart-period">7 hari terakhir · transaksi keluar</p>
            <div className="mobile-chart" role="group" aria-label="Pilih hari pendapatan">
              {dailyRevenue.map((day, index) => <button key={day.tanggal} className={selectedDay === index ? 'selected' : ''} onClick={() => setSelectedDay(index)} aria-label={`${day.hari}, ${day.tanggal}: ${formatCurrency(day.pendapatan)}`} aria-pressed={selectedDay === index}><span className="bar-track"><span style={{ height: `${Math.max(8, day.pendapatan / Math.max(...dailyRevenue.map(point => point.pendapatan), 1) * 100)}%` }} /></span><span>{day.hari.slice(0, 3)}</span></button>)}
            </div>
            <div className="chart-selection"><span>{dailyRevenue[selectedDay]?.tanggal}</span><strong>{formatCurrency(dailyRevenue[selectedDay]?.pendapatan ?? 0)}</strong></div>
          </section>
          <section className="mobile-activity"><div className="section-heading"><h2>Aktivitas terbaru</h2><Link to={routes.history}>Semua <ArrowRight size={15} /></Link></div>
            {recentHistory.length ? recentHistory.slice(0, 3).map(item => <Link to={routes.history} className="activity-row" key={item.id}><span className={`activity-icon ${item.kategori}`}>{item.kategori === 'keluar' ? <ArrowUpRight /> : <ArrowDownLeft />}</span><span className="activity-copy"><strong>{item.namaBarang}</strong><small>{item.kategori === 'keluar' ? 'Keluar' : 'Masuk'} · {dateTimeLabel(item.tanggal)} · {item.oleh || 'Kasir'}</small></span><span className="activity-value"><strong>{formatCurrency(item.harga * item.jumlah)}</strong><small>{item.kategori === 'keluar' ? '−' : '+'}{item.jumlah} unit</small></span></Link>) : <EmptyState title="Belum ada aktivitas" description="Transaksi masuk dan keluar akan muncul di sini." />}
          </section>
          <section className="mobile-top-products"><div className="section-heading"><h2>Terlaris bulan ini</h2><span>Unit terjual</span></div>
            {topProducts.length ? topProducts.slice(0, 3).map((product, index) => <div className="top-product-row" key={`${product.brand}-${product.namaBarang}`}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{product.namaBarang}</strong><i style={{ width: `${Math.max(12, product.jumlah / (topProducts[0]?.jumlah || 1) * 100)}%` }} /></div><strong>{product.jumlah}</strong></div>) : <p className="mobile-empty-copy"><Box size={18} /> Produk terlaris muncul setelah ada penjualan.</p>}
          </section>
        </>}
      </div>}
      {desktop && <div className="hidden space-y-6 lg:block">
      <section className="dashboard-metrics grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading && !productsReady ? (
          <LoadingGrid rows={4} className="md:col-span-2 xl:col-span-4 xl:grid-cols-4" />
        ) : (
          <>
            {loading ? <Skeleton className="h-32 rounded-lg bg-white/10" /> : <MetricCard
              label="Pendapatan Hari Ini"
              value={metrics.todayRevenueLabel}
              detail="Transaksi keluar tersimpan"
              trend={metrics.revenueTrend}
              icon={<WalletCards className="size-5" />}
              accent="emerald"
            />}
            <MetricCard
              label="Total Produk"
              value={formatNumber(metrics.totalProducts)}
              detail="SKU pada toko aktif"
              icon={<Package className="size-5" />}
              accent="cyan"
            />
            {loading ? <Skeleton className="h-32 rounded-lg bg-white/10" /> : <MetricCard
              label="Transaksi Hari Ini"
              value={formatNumber(metrics.todayTransactions)}
              detail="Barang keluar tercatat"
              icon={<ReceiptText className="size-5" />}
              accent="violet"
            />}
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
            {loading ? <Skeleton className="h-full w-full rounded-lg bg-white/10" /> : <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyRevenue} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={chartGridColor} vertical={false} />
                <XAxis dataKey="hari" stroke={chartTextColor} tickLine={false} axisLine={false} />
                <YAxis yAxisId="revenue"
                  stroke={chartTextColor}
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
                <YAxis yAxisId="transactions" orientation="right" width={28} allowDecimals={false} tickLine={false} axisLine={false} stroke={chartTextColor} />
                <Legend />
                <Bar yAxisId="revenue" dataKey="pendapatan" fill="#00d2ff" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                <Line yAxisId="transactions" type="monotone" dataKey="transaksi" stroke="#ffb454" strokeWidth={3} dot={{ r: 4 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>}
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
            {loading ? <Skeleton className="h-full w-full rounded-lg bg-white/10" /> : topProducts.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={chartGridColor} horizontal={false} />
                  <XAxis type="number" stroke={chartTextColor} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="namaBarang"
                    width={126}
                    stroke={chartTextColor}
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
                  <Bar dataKey="jumlah" fill="#7b2ff7" radius={[0, 8, 8, 0]} isAnimationActive={false} />
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
              <Link to={routes.history}>
                <ArrowRight className="size-4" />
                Lihat semua
              </Link>
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
      </div>}
    </div>
  )
}

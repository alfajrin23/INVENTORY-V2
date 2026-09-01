import {
  CalendarDays,
  FileText,
  RefreshCcw,
  Search,
  TrendingUp,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { EmptyState, ErrorState, TableSkeleton } from '@/components/shared/data-state'
import { GlassPanel } from '@/components/shared/glass-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useInventory } from '@/hooks/use-inventory'
import {
  getRevenueRowsByRange,
  getStockValue,
  getTotalRevenue,
} from '@/lib/analytics'
import {
  dateTimeLabel,
  endOfDay,
  endOfMonth,
  formatCurrency,
  formatNumber,
  getWeekRange,
  indonesiaMonths,
  isWithinDateRange,
  startOfDay,
  startOfMonth,
  toInputDate,
} from '@/lib/format'
import { routes } from '@/lib/navigation'
import { downloadMovementPdf, downloadRevenuePdf, downloadStockPdf } from '@/lib/pdf'
import type { HistoryItem, Product, RevenueRow, TransactionCategory } from '@/lib/types'

function inputDateToRange(value: string, edge: 'start' | 'end') {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, edge === 'start' ? 0 : 23, edge === 'start' ? 0 : 59, edge === 'start' ? 0 : 59, edge === 'start' ? 0 : 999)
}

function PageTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-sm text-cyan-100/70">{eyebrow}</p>
      <h1 className="mt-1 text-3xl font-bold text-white lg:text-4xl">{title}</h1>
    </div>
  )
}

function RevenueTabs() {
  const navigate = useNavigate()
  const location = useLocation()
  const valueByPath = {
    [routes.revenueDay]: 'harian',
    [routes.revenueWeek]: 'mingguan',
    [routes.revenueMonth]: 'bulanan',
    [routes.revenueYear]: 'tahunan',
  } as Record<string, string>
  const pathByValue = {
    harian: routes.revenueDay,
    mingguan: routes.revenueWeek,
    bulanan: routes.revenueMonth,
    tahunan: routes.revenueYear,
  } as Record<string, string>

  return (
    <Tabs value={valueByPath[location.pathname] ?? 'tahunan'} onValueChange={(value) => navigate(pathByValue[value])}>
      <TabsList className="grid h-auto w-full grid-cols-2 border border-white/10 bg-white/[0.06] p-1 sm:w-fit sm:grid-cols-4">
        <TabsTrigger value="harian">Harian</TabsTrigger>
        <TabsTrigger value="mingguan">Mingguan</TabsTrigger>
        <TabsTrigger value="bulanan">Bulanan</TabsTrigger>
        <TabsTrigger value="tahunan">Tahunan</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

function MovementReport({ category }: { category: TransactionCategory }) {
  const { history, loading, error, refresh } = useInventory()
  const today = toInputDate(new Date())
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const title = category === 'masuk' ? 'Laporan Barang Masuk Terbaru' : 'Laporan Barang Keluar Terbaru'

  const rows = useMemo(() => {
    const start = inputDateToRange(startDate, 'start')
    const end = inputDateToRange(endDate, 'end')
    return history
      .filter((item) => item.kategori === category && isWithinDateRange(item.tanggal, start, end))
      .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
  }, [category, endDate, history, startDate])

  if (error) {
    return <ErrorState message={error} onRetry={() => void refresh()} />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <PageTitle eyebrow="Mutasi Barang" title={title} />
        <Button type="button" onClick={() => downloadMovementPdf(title, rows)} className="bg-emerald-300 text-slate-950 hover:bg-emerald-200">
          <FileText className="size-4" />
          Simpan PDF
        </Button>
      </div>

      <GlassPanel className="p-4" glow={category === 'masuk' ? 'emerald' : 'amber'}>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <DateField id="start-date" label="Tanggal Awal" value={startDate} onChange={setStartDate} />
          <DateField id="end-date" label="Tanggal Akhir" value={endDate} onChange={setEndDate} />
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStartDate(today)
                setEndDate(today)
              }}
              className="h-11 border-white/12 bg-white/[0.07]"
            >
              <RefreshCcw className="size-4" />
              Reset
            </Button>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="overflow-hidden p-0" glow="cyan">
        {loading ? (
          <div className="p-5">
            <TableSkeleton />
          </div>
        ) : rows.length ? (
          <MovementTable rows={rows} />
        ) : (
          <div className="p-5">
            <EmptyState title="Data kosong" description="Tidak ada transaksi pada rentang tanggal ini." />
          </div>
        )}
      </GlassPanel>
    </div>
  )
}

function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-white/70">
        {label}
      </Label>
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/42" />
        <Input
          id={id}
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 border-white/12 bg-white/[0.07] pl-10 text-white"
        />
      </div>
    </div>
  )
}

function MovementTable({ rows }: { rows: HistoryItem[] }) {
  return (
    <>
      <div className="hidden max-h-[620px] overflow-auto lg:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-[#17213a]/95">
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-white/62">No</TableHead>
              <TableHead className="text-white/62">Nama Barang</TableHead>
              <TableHead className="text-white/62">Tanggal</TableHead>
              <TableHead className="text-white/62">Jumlah</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((item, index) => (
              <TableRow key={item.id} className="border-white/10 hover:bg-white/[0.05]">
                <TableCell className="font-mono text-white/54">{index + 1}</TableCell>
                <TableCell>
                  <p className="font-semibold text-white">{item.namaBarang}</p>
                  <p className="text-xs text-white/46">{item.brand}</p>
                </TableCell>
                <TableCell className="text-white/62">{dateTimeLabel(item.tanggal)}</TableCell>
                <TableCell className="font-mono text-white">{item.jumlah}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-3 p-4 lg:hidden">
        {rows.map((item) => (
          <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.055] p-4">
            <p className="font-semibold text-white">{item.namaBarang}</p>
            <p className="text-sm text-white/52">{dateTimeLabel(item.tanggal)}</p>
            <p className="mt-3 font-mono text-white">Qty {item.jumlah}</p>
          </div>
        ))}
      </div>
    </>
  )
}

export function IncomingReportPage() {
  return <MovementReport category="masuk" />
}

export function OutgoingReportPage() {
  return <MovementReport category="keluar" />
}

export function StockReportPage() {
  const { products, loading, error, refresh } = useInventory()
  const [query, setQuery] = useState('')
  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('id-ID')
    if (!normalized) {
      return products
    }

    return products.filter((product) => product.namaBarang.toLocaleLowerCase('id-ID').startsWith(normalized))
  }, [products, query])

  if (error) {
    return <ErrorState message={error} onRetry={() => void refresh()} />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <PageTitle eyebrow="Inventory" title="Laporan Stok Barang" />
        <Button type="button" onClick={() => downloadStockPdf('Laporan Stok Barang', filteredProducts)} className="bg-emerald-300 text-slate-950 hover:bg-emerald-200">
          <FileText className="size-4" />
          Simpan PDF
        </Button>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <GlassPanel className="p-4" glow="cyan">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/42" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari awalan nama barang"
              className="h-11 border-white/12 bg-white/[0.07] pl-10 text-white placeholder:text-white/38"
            />
          </div>
        </GlassPanel>
        <GlassPanel className="grid grid-cols-2 gap-3 p-4" glow="emerald">
          <div>
            <p className="text-sm text-white/50">Produk</p>
            <p className="font-mono text-2xl font-semibold text-white">{formatNumber(filteredProducts.length)}</p>
          </div>
          <div>
            <p className="text-sm text-white/50">Nilai Stok</p>
            <p className="font-mono text-lg font-semibold text-emerald-100">{formatCurrency(getStockValue(filteredProducts))}</p>
          </div>
        </GlassPanel>
      </section>

      <GlassPanel className="overflow-hidden p-0" glow="cyan">
        {loading ? (
          <div className="p-5">
            <TableSkeleton />
          </div>
        ) : filteredProducts.length ? (
          <StockTable products={filteredProducts} />
        ) : (
          <div className="p-5">
            <EmptyState title="Stok tidak ditemukan" description="Tidak ada produk yang cocok dengan filter ini." />
          </div>
        )}
      </GlassPanel>
    </div>
  )
}

function StockTable({ products }: { products: Product[] }) {
  return (
    <>
      <div className="hidden max-h-[640px] overflow-auto lg:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-[#17213a]/95">
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="w-[60px] text-white/62">ID</TableHead>
              <TableHead className="text-white/62">Nama</TableHead>
              <TableHead className="text-white/62">Brand</TableHead>
              <TableHead className="text-white/62">Stok</TableHead>
              <TableHead className="text-right text-white/62">Harga</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product, index) => (
              <TableRow key={product.id} className="border-white/10 hover:bg-white/[0.05]">
                <TableCell className="font-mono text-white/54">{index + 1}</TableCell>
                <TableCell className="font-semibold text-white">{product.namaBarang}</TableCell>
                <TableCell className="text-white/68">{product.brand}</TableCell>
                <TableCell>
                  <Badge className={product.stok <= 5 ? 'bg-amber-300/16 text-amber-100' : 'bg-emerald-300/14 text-emerald-100'}>
                    {product.stok}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-white">{formatCurrency(product.harga)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-3 p-4 lg:hidden">
        {products.map((product) => (
          <div key={product.id} className="rounded-xl border border-white/10 bg-white/[0.055] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{product.namaBarang}</p>
                <p className="text-sm text-white/52">{product.brand}</p>
              </div>
              <Badge className="bg-cyan-300/14 text-cyan-100">{product.stok}</Badge>
            </div>
            <p className="mt-3 font-mono text-white">{formatCurrency(product.harga)}</p>
          </div>
        ))}
      </div>
    </>
  )
}

export function RevenueAnnualPage() {
  const { history, loading, error, refresh } = useInventory()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(String(currentYear))
  const rows = useMemo(() => {
    const numericYear = Number(year)
    return getRevenueRowsByRange(
      history,
      new Date(numericYear, 0, 1, 0, 0, 0, 0),
      new Date(numericYear, 11, 31, 23, 59, 59, 999),
    )
  }, [history, year])
  const total = getTotalRevenue(rows)

  return (
    <RevenueReportShell
      title={`Laporan Pendapatan Tahunan ${year}`}
      loading={loading}
      error={error}
      onRetry={refresh}
      rows={rows}
      total={total}
      controls={
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="h-11 border-white/12 bg-white/[0.07] text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[currentYear, currentYear - 1, currentYear - 2].map((item) => (
              <SelectItem key={item} value={String(item)}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  )
}

export function RevenueDailyPage() {
  const { history, loading, error, refresh } = useInventory()
  const [date, setDate] = useState(toInputDate(new Date()))
  const rows = useMemo(
    () => getRevenueRowsByRange(history, startOfDay(inputDateToRange(date, 'start')), endOfDay(inputDateToRange(date, 'start'))),
    [date, history],
  )
  const total = getTotalRevenue(rows)

  return (
    <RevenueReportShell
      title={`Laporan Pendapatan Harian (${date})`}
      loading={loading}
      error={error}
      onRetry={refresh}
      rows={rows}
      total={total}
      controls={<DateField id="revenue-date" label="Tanggal" value={date} onChange={setDate} />}
    />
  )
}

export function RevenueWeeklyPage() {
  const { history, loading, error, refresh } = useInventory()
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth()))
  const [week, setWeek] = useState(String(Math.min(Math.ceil(now.getDate() / 7), 4)))
  const year = now.getFullYear()
  const range = getWeekRange(year, Number(month), Number(week))
  const rows = useMemo(() => getRevenueRowsByRange(history, range.start, range.end), [history, range.end, range.start])
  const total = getTotalRevenue(rows)

  return (
    <RevenueReportShell
      title={`Laporan Pendapatan Mingguan (${indonesiaMonths[Number(month)]}, Minggu ke-${week})`}
      loading={loading}
      error={error}
      onRetry={refresh}
      rows={rows}
      total={total}
      controls={
        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-11 border-white/12 bg-white/[0.07] text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {indonesiaMonths.map((name, index) => (
                <SelectItem key={name} value={String(index)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={week} onValueChange={setWeek}>
            <SelectTrigger className="h-11 border-white/12 bg-white/[0.07] text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((item) => (
                <SelectItem key={item} value={String(item)}>
                  Minggu ke-{item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    />
  )
}

export function RevenueMonthlyPage() {
  const { history, loading, error, refresh } = useInventory()
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth()))
  const year = now.getFullYear()
  const rows = useMemo(
    () => getRevenueRowsByRange(history, startOfMonth(year, Number(month)), endOfMonth(year, Number(month))),
    [history, month, year],
  )
  const total = getTotalRevenue(rows)

  return (
    <RevenueReportShell
      title={`Laporan Pendapatan Bulanan ${indonesiaMonths[Number(month)]}`}
      loading={loading}
      error={error}
      onRetry={refresh}
      rows={rows}
      total={total}
      controls={
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="h-11 border-white/12 bg-white/[0.07] text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {indonesiaMonths.map((name, index) => (
              <SelectItem key={name} value={String(index)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  )
}

function RevenueReportShell({
  title,
  loading,
  error,
  onRetry,
  rows,
  total,
  controls,
}: {
  title: string
  loading: boolean
  error: string | null
  onRetry: () => Promise<void>
  rows: RevenueRow[]
  total: number
  controls: ReactNode
}) {
  if (error) {
    return <ErrorState message={error} onRetry={() => void onRetry()} />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <PageTitle eyebrow="Revenue" title={title} />
        <RevenueTabs />
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <GlassPanel className="p-4" glow="cyan">
          {controls}
        </GlassPanel>
        <GlassPanel className="p-4" glow="emerald">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-300/12 text-emerald-100">
              <TrendingUp className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-white/50">Total Pendapatan</p>
              <p className="truncate font-mono text-xl font-semibold text-emerald-100" aria-live="polite">
                {formatCurrency(total)}
              </p>
            </div>
          </div>
        </GlassPanel>
      </section>

      <div className="flex justify-end">
        <Button type="button" onClick={() => downloadRevenuePdf(title, rows, total)} className="bg-emerald-300 text-slate-950 hover:bg-emerald-200">
          <FileText className="size-4" />
          Simpan PDF
        </Button>
      </div>

      <GlassPanel className="overflow-hidden p-0" glow="violet">
        {loading ? (
          <div className="p-5">
            <TableSkeleton />
          </div>
        ) : rows.length ? (
          <RevenueTable rows={rows} />
        ) : (
          <div className="p-5">
            <EmptyState title="Pendapatan kosong" description="Tidak ada transaksi keluar pada periode ini." />
          </div>
        )}
      </GlassPanel>
    </div>
  )
}

function RevenueTable({ rows }: { rows: RevenueRow[] }) {
  return (
    <>
      <div className="hidden max-h-[620px] overflow-auto lg:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-[#17213a]/95">
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-white/62">Tanggal</TableHead>
              <TableHead className="text-white/62">Nama Barang</TableHead>
              <TableHead className="text-white/62">Qty</TableHead>
              <TableHead className="text-right text-white/62">Harga</TableHead>
              <TableHead className="text-right text-white/62">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="border-white/10 hover:bg-white/[0.05]">
                <TableCell className="text-white/62">{dateTimeLabel(row.tanggal)}</TableCell>
                <TableCell className="font-semibold text-white">{row.namaBarang}</TableCell>
                <TableCell className="font-mono text-white">{row.qty}</TableCell>
                <TableCell className="text-right font-mono text-white/72">{formatCurrency(row.harga)}</TableCell>
                <TableCell className="text-right font-mono text-white">{formatCurrency(row.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-3 p-4 lg:hidden">
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.055] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{row.namaBarang}</p>
                <p className="text-sm text-white/52">{dateTimeLabel(row.tanggal)}</p>
              </div>
              <Badge className="bg-emerald-300/14 text-emerald-100">{row.qty}</Badge>
            </div>
            <p className="mt-3 text-right font-mono text-white">{formatCurrency(row.total)}</p>
          </div>
        ))}
      </div>
    </>
  )
}

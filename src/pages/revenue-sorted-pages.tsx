import { CalendarDays, FileText, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { TransactionActions, TransactionRevisionDialog, type RevisionAction } from '@/components/inventory/transaction-revision-dialog'
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
import { getRevenueRowsByRange, getTotalRevenue } from '@/lib/analytics'
import {
  dateTimeLabel,
  endOfDay,
  endOfMonth,
  formatCurrency,
  getWeekRange,
  indonesiaMonths,
  startOfDay,
  startOfMonth,
  toInputDate,
} from '@/lib/format'
import { routes } from '@/lib/navigation'
import { downloadRevenuePdf } from '@/lib/pdf'
import type { HistoryItem, RevenueRow } from '@/lib/types'

type RevenueSort = 'date-desc' | 'date-asc' | 'qty-desc' | 'qty-asc' | 'name-asc' | 'name-desc' | 'total-desc' | 'total-asc'

function inputDateToRange(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

function sortRevenueRows(rows: RevenueRow[], sort: RevenueSort) {
  const next = [...rows]
  switch (sort) {
    case 'date-asc': return next.sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime())
    case 'qty-desc': return next.sort((a, b) => b.qty - a.qty || new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
    case 'qty-asc': return next.sort((a, b) => a.qty - b.qty || new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
    case 'name-asc': return next.sort((a, b) => a.namaBarang.localeCompare(b.namaBarang, 'id-ID', { numeric: true }))
    case 'name-desc': return next.sort((a, b) => b.namaBarang.localeCompare(a.namaBarang, 'id-ID', { numeric: true }))
    case 'total-desc': return next.sort((a, b) => b.total - a.total || b.qty - a.qty)
    case 'total-asc': return next.sort((a, b) => a.total - b.total || a.qty - b.qty)
    default: return next.sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
  }
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
    <Tabs value={valueByPath[location.pathname] ?? 'tahunan'} onValueChange={value => navigate(pathByValue[value])}>
      <TabsList className="grid h-auto w-full grid-cols-2 border border-white/10 bg-white/[0.06] p-1 sm:w-fit sm:grid-cols-4">
        <TabsTrigger value="harian">Harian</TabsTrigger>
        <TabsTrigger value="mingguan">Mingguan</TabsTrigger>
        <TabsTrigger value="bulanan">Bulanan</TabsTrigger>
        <TabsTrigger value="tahunan">Tahunan</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

function DateField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="revenue-date" className="text-white/70">Tanggal</Label>
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/42" />
        <Input id="revenue-date" type="date" value={value} onChange={event => onChange(event.target.value)} className="h-11 border-white/12 bg-white/[0.07] pl-10 text-white" />
      </div>
    </div>
  )
}

function RevenuePage({ title, rows, loading, error, onRetry, controls }: {
  title: string
  rows: RevenueRow[]
  loading: boolean
  error: string | null
  onRetry: () => Promise<void>
  controls: ReactNode
}) {
  const { history } = useInventory()
  const [sort, setSort] = useState<RevenueSort>('date-desc')
  const [revision, setRevision] = useState<{ item: HistoryItem; action: RevisionAction } | null>(null)
  const historyById = useMemo(() => new Map(history.map(item => [item.id, item])), [history])
  const sortedRows = useMemo(() => sortRevenueRows(rows, sort), [rows, sort])
  const total = getTotalRevenue(rows)

  if (error) return <ErrorState message={error} onRetry={() => void onRetry()} />

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-sm text-cyan-100/70">Revenue</p><h1 className="mt-1 text-3xl font-bold text-white lg:text-4xl">{title}</h1></div>
        <RevenueTabs />
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <GlassPanel className="p-4" glow="cyan">{controls}</GlassPanel>
        <GlassPanel className="p-4" glow="emerald">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-300/12 text-emerald-100"><TrendingUp className="size-5" /></div>
            <div className="min-w-0"><p className="text-sm text-white/50">Total Pendapatan</p><p className="truncate font-mono text-xl font-semibold text-emerald-100">{formatCurrency(total)}</p></div>
          </div>
        </GlassPanel>
      </section>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,18rem)_auto] sm:justify-end">
        <Select value={sort} onValueChange={value => setSort(value as RevenueSort)}>
          <SelectTrigger aria-label="Urutkan pendapatan" className="h-11 border-white/12 bg-white/[0.07] text-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">Tanggal terbaru</SelectItem>
            <SelectItem value="date-asc">Tanggal terlama</SelectItem>
            <SelectItem value="qty-desc">Terjual terbanyak</SelectItem>
            <SelectItem value="qty-asc">Terjual tersedikit</SelectItem>
            <SelectItem value="name-asc">Nama A–Z</SelectItem>
            <SelectItem value="name-desc">Nama Z–A</SelectItem>
            <SelectItem value="total-desc">Nilai transaksi terbesar</SelectItem>
            <SelectItem value="total-asc">Nilai transaksi terkecil</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" onClick={() => void downloadRevenuePdf(title, sortedRows, total)} className="bg-emerald-300 text-slate-950 hover:bg-emerald-200"><FileText className="size-4" /> Simpan PDF</Button>
      </div>

      <GlassPanel className="overflow-hidden p-0" glow="violet">
        {loading ? <div className="p-5"><TableSkeleton /></div> : sortedRows.length ? (
          <>
            <div className="hidden max-h-[620px] overflow-auto lg:block">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[#17213a]/95"><TableRow className="border-white/10 hover:bg-transparent"><TableHead className="text-white/62">Tanggal</TableHead><TableHead className="text-white/62">Nama Barang</TableHead><TableHead className="text-white/62">Qty</TableHead><TableHead className="text-right text-white/62">Harga</TableHead><TableHead className="text-right text-white/62">Total</TableHead><TableHead className="text-right text-white/62">Aksi</TableHead></TableRow></TableHeader>
                <TableBody>{sortedRows.map(row => <TableRow key={row.id} className="border-white/10 hover:bg-white/[0.05]"><TableCell className="text-white/62">{dateTimeLabel(row.tanggal)}</TableCell><TableCell className="font-semibold text-white">{row.namaBarang}</TableCell><TableCell className="font-mono text-white">{row.qty}</TableCell><TableCell className="text-right font-mono text-white/72">{formatCurrency(row.harga)}</TableCell><TableCell className="text-right font-mono text-white">{formatCurrency(row.total)}</TableCell><TableCell>{historyById.has(row.id) && <TransactionActions item={historyById.get(row.id)!} onAction={(_, action) => setRevision({ item: historyById.get(row.id)!, action })} />}</TableCell></TableRow>)}</TableBody>
              </Table>
            </div>
            <div className="space-y-3 p-4 lg:hidden">{sortedRows.map(row => <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.055] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-white">{row.namaBarang}</p><p className="text-sm text-white/52">{dateTimeLabel(row.tanggal)}</p></div><Badge className="bg-emerald-300/14 text-emerald-100">{row.qty}</Badge></div><p className="mt-3 text-right font-mono text-white">{formatCurrency(row.total)}</p>{historyById.has(row.id) && <TransactionActions item={historyById.get(row.id)!} onAction={(_, action) => setRevision({ item: historyById.get(row.id)!, action })} />}</div>)}</div>
          </>
        ) : <div className="p-5"><EmptyState title="Pendapatan kosong" description="Tidak ada transaksi keluar pada periode ini." /></div>}
      </GlassPanel>
      {revision && <TransactionRevisionDialog key={`${revision.item.id}-${revision.action}`} item={revision.item} action={revision.action} onClose={() => setRevision(null)} />}
    </div>
  )
}

export function RevenueAnnualPage() {
  const { history, loading, error, refresh } = useInventory()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(String(currentYear))
  const rows = useMemo(() => getRevenueRowsByRange(history, new Date(Number(year), 0, 1, 0, 0, 0, 0), new Date(Number(year), 11, 31, 23, 59, 59, 999)), [history, year])
  return <RevenuePage title={`Laporan Pendapatan Tahunan ${year}`} rows={rows} loading={loading} error={error} onRetry={refresh} controls={<Select value={year} onValueChange={setYear}><SelectTrigger className="h-11 border-white/12 bg-white/[0.07] text-white"><SelectValue /></SelectTrigger><SelectContent>{[currentYear, currentYear - 1, currentYear - 2].map(item => <SelectItem key={item} value={String(item)}>{item}</SelectItem>)}</SelectContent></Select>} />
}

export function RevenueDailyPage() {
  const { history, loading, error, refresh } = useInventory()
  const [date, setDate] = useState(toInputDate(new Date()))
  const base = inputDateToRange(date)
  const rows = useMemo(() => getRevenueRowsByRange(history, startOfDay(base), endOfDay(base)), [base.getTime(), history])
  return <RevenuePage title={`Laporan Pendapatan Harian (${date})`} rows={rows} loading={loading} error={error} onRetry={refresh} controls={<DateField value={date} onChange={setDate} />} />
}

export function RevenueWeeklyPage() {
  const { history, loading, error, refresh } = useInventory()
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth()))
  const [week, setWeek] = useState(String(Math.min(Math.ceil(now.getDate() / 7), 4)))
  const range = getWeekRange(now.getFullYear(), Number(month), Number(week))
  const rows = useMemo(() => getRevenueRowsByRange(history, range.start, range.end), [history, range.end.getTime(), range.start.getTime()])
  return <RevenuePage title={`Laporan Pendapatan Mingguan (${indonesiaMonths[Number(month)]}, Minggu ke-${week})`} rows={rows} loading={loading} error={error} onRetry={refresh} controls={<div className="grid gap-3 sm:grid-cols-2"><Select value={month} onValueChange={setMonth}><SelectTrigger className="h-11 border-white/12 bg-white/[0.07] text-white"><SelectValue /></SelectTrigger><SelectContent>{indonesiaMonths.map((name, index) => <SelectItem key={name} value={String(index)}>{name}</SelectItem>)}</SelectContent></Select><Select value={week} onValueChange={setWeek}><SelectTrigger className="h-11 border-white/12 bg-white/[0.07] text-white"><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 4].map(item => <SelectItem key={item} value={String(item)}>Minggu ke-{item}</SelectItem>)}</SelectContent></Select></div>} />
}

export function RevenueMonthlyPage() {
  const { history, loading, error, refresh } = useInventory()
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth()))
  const rows = useMemo(() => getRevenueRowsByRange(history, startOfMonth(now.getFullYear(), Number(month)), endOfMonth(now.getFullYear(), Number(month))), [history, month, now.getFullYear()])
  return <RevenuePage title={`Laporan Pendapatan Bulanan ${indonesiaMonths[Number(month)]}`} rows={rows} loading={loading} error={error} onRetry={refresh} controls={<Select value={month} onValueChange={setMonth}><SelectTrigger className="h-11 border-white/12 bg-white/[0.07] text-white"><SelectValue /></SelectTrigger><SelectContent>{indonesiaMonths.map((name, index) => <SelectItem key={name} value={String(index)}>{name}</SelectItem>)}</SelectContent></Select>} />
}

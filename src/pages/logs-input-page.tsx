import { ArrowLeft, Database, Filter, RefreshCcw, Search } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { ErrorState, TableSkeleton } from '@/components/shared/data-state'
import { GlassPanel } from '@/components/shared/glass-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useInventory } from '@/hooks/use-inventory'
import { dateTimeLabel, formatCurrency } from '@/lib/format'
import { getInventoryRepository } from '@/lib/inventory-service'
import { routes } from '@/lib/navigation'
import type { AuditLog } from '@/lib/types'

type LogFilter = 'all' | AuditLog['entity']

function auditName(log: AuditLog) {
  const data = log.afterData ?? log.beforeData ?? {}
  return String(data.namaBarang ?? data.nama_barang ?? data.name ?? log.recordId)
}

function auditValues(log: AuditLog, data: Record<string, unknown> | null) {
  if (!data) return ''
  if (log.entity === 'transaction') {
    return `${data.kategori === 'keluar' ? 'Keluar' : 'Masuk'} ${data.jumlah ?? 0} unit | ${formatCurrency(Number(data.harga ?? 0))}`
  }
  if (log.entity === 'product') return `Stok ${data.stok ?? 0} | ${formatCurrency(Number(data.harga ?? 0))}`
  return String(data.name ?? '')
}

function actionLabel(action: AuditLog['action']) {
  if (action === 'insert') return 'Input'
  if (action === 'update') return 'Edit'
  return 'Hapus'
}

function entityLabel(entity: AuditLog['entity']) {
  if (entity === 'transaction') return 'transaksi'
  if (entity === 'product') return 'barang'
  return 'toko'
}

export function LogsInputPage() {
  const { activeStore, mode } = useInventory()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<LogFilter>('all')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const request = useRef(0)
  const storeId = activeStore?.id

  const loadLogs = useCallback(async () => {
    const requestId = ++request.current
    if (!storeId) {
      setLogs([])
      setError('')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await getInventoryRepository().getAuditLogs(storeId)
      if (requestId === request.current) setLogs(result)
    } catch (cause) {
      if (requestId === request.current) setError(cause instanceof Error ? cause.message : 'Logs gagal dimuat')
    } finally {
      if (requestId === request.current) setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    void loadLogs()
    return () => { ++request.current }
  }, [loadLogs])

  const visibleLogs = useMemo(() => {
    const normalized = deferredSearch.trim().toLocaleLowerCase('id-ID')
    return logs.filter(log =>
      (filter === 'all' || log.entity === filter)
      && (!normalized || `${auditName(log)} ${log.action} ${log.entity}`.toLocaleLowerCase('id-ID').includes(normalized)),
    )
  }, [deferredSearch, filter, logs])

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadLogs()} />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-cyan-100/70">Audit Aktivitas</p>
          <h1 className="mt-1 text-3xl font-bold text-white lg:text-4xl">Logs Input</h1>
          <p className="mt-2 text-sm text-white/55">{activeStore?.name ?? 'Pilih toko'} | {logs.length} aktivitas terbaru</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="border-white/12 bg-white/[0.07] text-white hover:bg-white/12">
            <Link to={routes.settings}>
              <ArrowLeft className="size-4" />
              Pengaturan
            </Link>
          </Button>
          <Button type="button" variant="outline" onClick={() => void loadLogs()} disabled={loading} className="border-white/12 bg-white/[0.07] text-white hover:bg-white/12">
            <RefreshCcw className="size-4" />
            Muat ulang
          </Button>
        </div>
      </div>

      <GlassPanel className="p-4" glow="cyan">
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/42" />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Cari aktivitas"
              aria-label="Cari logs input"
              className="h-11 border-white/12 bg-white/[0.07] pl-10 text-white"
            />
          </div>
          <Select value={filter} onValueChange={value => setFilter(value as LogFilter)}>
            <SelectTrigger aria-label="Filter logs input" className="h-11 border-white/12 bg-white/[0.07] text-white">
              <Filter className="size-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua aktivitas</SelectItem>
              <SelectItem value="transaction">Transaksi</SelectItem>
              <SelectItem value="product">Barang</SelectItem>
              <SelectItem value="store">Toko</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </GlassPanel>

      <GlassPanel className="overflow-hidden p-0" glow="emerald">
        {loading ? (
          <div className="p-5">
            <TableSkeleton rows={8} />
          </div>
        ) : visibleLogs.length ? (
          <>
            <div className="hidden max-h-[680px] overflow-auto lg:block">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[#17213a]/95">
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/62">Waktu</TableHead>
                    <TableHead className="text-white/62">Aktivitas</TableHead>
                    <TableHead className="text-white/62">Detail</TableHead>
                    <TableHead className="text-right text-white/62">Aktor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleLogs.map(log => (
                    <TableRow key={log.id} className="border-white/10 hover:bg-white/[0.05]">
                      <TableCell className="whitespace-nowrap text-xs text-white/50">{dateTimeLabel(log.createdAt)}</TableCell>
                      <TableCell>
                        <Badge className={log.action === 'delete' ? 'bg-rose-300/14 text-rose-100' : log.action === 'update' ? 'bg-cyan-300/14 text-cyan-100' : 'bg-emerald-300/14 text-emerald-100'}>
                          {actionLabel(log.action)} {entityLabel(log.entity)}
                        </Badge>
                        <p className="mt-2 font-semibold text-white">{actionLabel(log.action)} {entityLabel(log.entity)}: {auditName(log)}</p>
                      </TableCell>
                      <TableCell className="max-w-[34rem] text-sm text-white/58">
                        {log.beforeData && `${auditValues(log, log.beforeData)} ke `}
                        {log.afterData ? auditValues(log, log.afterData) : 'Dihapus'}
                      </TableCell>
                      <TableCell className="text-right text-xs text-white/42" title={log.actorId ?? undefined}>
                        {mode === 'demo' ? 'Demo' : log.actorId ? 'Pemilik toko' : 'Sistem'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 p-4 lg:hidden">
              {visibleLogs.map(log => (
                <div key={log.id} className="rounded-xl border border-white/10 bg-white/[0.055] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-white">{actionLabel(log.action)} {entityLabel(log.entity)}: {auditName(log)}</p>
                      <time className="mt-1 block text-xs text-white/50" dateTime={log.createdAt}>{dateTimeLabel(log.createdAt)}</time>
                    </div>
                    <Database className="mt-0.5 size-4 shrink-0 text-cyan-100/70" />
                  </div>
                  <p className="mt-3 break-words text-sm text-white/55">
                    {log.beforeData && `${auditValues(log, log.beforeData)} ke `}
                    {log.afterData ? auditValues(log, log.afterData) : 'Dihapus'}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="p-6 text-sm text-white/55">Belum ada aktivitas untuk filter ini.</p>
        )}
      </GlassPanel>
    </div>
  )
}

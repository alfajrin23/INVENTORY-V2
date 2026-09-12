import { Info, LogOut, RefreshCcw, Search, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { GlassPanel } from '@/components/shared/glass-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { demoEnabled, supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { routes } from '@/lib/navigation'
import { useToast } from '@/hooks/use-toast'
import { useInventory } from '@/hooks/use-inventory'
import { dateTimeLabel, formatCurrency } from '@/lib/format'
import { getInventoryRepository } from '@/lib/inventory-service'
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

export function SettingsPage() {
  const [aboutOpen, setAboutOpen] = useState(false)
  const { showToast } = useToast()
  const { activeStore, mode } = useInventory()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [logLoading, setLogLoading] = useState(true)
  const [logError, setLogError] = useState('')
  const [logFilter, setLogFilter] = useState<LogFilter>('all')
  const [logSearch, setLogSearch] = useState('')
  const logRequest = useRef(0)
  const storeId = activeStore?.id
  const loadLogs = useCallback(async () => {
    const requestId = ++logRequest.current
    if (!storeId) { setLogs([]); setLogError(''); setLogLoading(false); return }
    setLogLoading(true); setLogError('')
    try {
      const result = await getInventoryRepository().getAuditLogs(storeId)
      if (requestId === logRequest.current) setLogs(result)
    } catch (error) {
      if (requestId === logRequest.current) setLogError(error instanceof Error ? error.message : 'Logs gagal dimuat')
    } finally {
      if (requestId === logRequest.current) setLogLoading(false)
    }
  }, [storeId])
  useEffect(() => {
    void loadLogs()
    return () => { ++logRequest.current }
  }, [loadLogs])
  const visibleLogs = useMemo(() => logs.filter(log =>
    (logFilter === 'all' || log.entity === logFilter)
    && (!logSearch.trim() || `${auditName(log)} ${log.action} ${log.entity}`.toLocaleLowerCase('id-ID').includes(logSearch.trim().toLocaleLowerCase('id-ID')))
  ), [logs, logFilter, logSearch])

  const handleExit = async () => {
    if (supabase && !demoEnabled) {
      try { const { error } = await supabase.auth.signOut(); if (error) throw error } catch { showToast('Gagal keluar. Coba lagi.', 'error') }
      return
    }
    const confirmed = window.confirm('Keluar dari aplikasi?')
    if (!confirmed) {
      return
    }

    showToast('Sesi ditutup', 'info')
    window.setTimeout(() => {
      window.close()
      window.location.href = 'about:blank'
    }, 350)
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-cyan-100/70">Preference</p>
        <h1 className="mt-1 text-3xl font-bold text-white lg:text-4xl">Pengaturan</h1>
      </div>

      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to={routes.profile}>Profil & Toko</Link></Button><Button asChild variant="outline"><Link to={routes.history}>History Barang</Link></Button></div>
      <GlassPanel className="max-w-2xl divide-y divide-white/10 p-2" glow="cyan">
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          className="flex w-full items-center justify-between rounded-xl px-4 py-4 text-left transition hover:bg-white/[0.07]"
        >
          <span className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-cyan-300/12 text-cyan-100">
              <Info className="size-5" />
            </span>
            <span>
              <span className="block font-semibold text-white">Tentang</span>
              <span className="text-sm text-white/52">ABElektronik Web Stock</span>
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={handleExit}
          className="flex w-full items-center justify-between rounded-xl px-4 py-4 text-left transition hover:bg-rose-400/10"
        >
          <span className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-rose-300/12 text-rose-100">
              <LogOut className="size-5" />
            </span>
            <span>
              <span className="block font-semibold text-white">Keluar</span>
              <span className="text-sm text-white/52">Tutup sesi aplikasi</span>
            </span>
          </span>
        </button>
      </GlassPanel>

      <section aria-labelledby="audit-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="audit-heading" className="text-xl font-semibold text-white">Logs Input</h2><p className="text-sm text-white/55">{activeStore?.name ?? 'Pilih toko'} | {logs.length} aktivitas terbaru</p></div>
          <Button type="button" variant="outline" size="icon" aria-label="Muat ulang logs" title="Muat ulang logs" onClick={() => void loadLogs()} disabled={logLoading}><RefreshCcw className="size-4" /></Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/42" /><Input value={logSearch} onChange={event => setLogSearch(event.target.value)} placeholder="Cari aktivitas" aria-label="Cari logs input" className="h-11 border-white/12 bg-white/[0.07] pl-10 text-white" /></div>
          <Select value={logFilter} onValueChange={value => setLogFilter(value as LogFilter)}><SelectTrigger aria-label="Filter logs input" className="h-11 border-white/12 bg-white/[0.07] text-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua aktivitas</SelectItem><SelectItem value="transaction">Transaksi</SelectItem><SelectItem value="product">Barang</SelectItem><SelectItem value="store">Toko</SelectItem></SelectContent></Select>
        </div>
        {logError ? <p role="alert" className="text-sm text-rose-200">{logError}</p> : logLoading ? <p className="text-sm text-white/55">Memuat logs...</p> : visibleLogs.length ? (
          <div className="divide-y divide-white/10 border-y border-white/10">
            {visibleLogs.map(log => <div key={log.id} className="grid gap-2 py-3 sm:grid-cols-[10rem_1fr_auto] sm:items-start sm:gap-4">
              <time className="text-xs text-white/50" dateTime={log.createdAt}>{dateTimeLabel(log.createdAt)}</time>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-white">{log.action === 'insert' ? 'Input' : log.action === 'update' ? 'Edit' : 'Hapus'} {log.entity === 'transaction' ? 'transaksi' : log.entity === 'product' ? 'barang' : 'toko'}: {auditName(log)}</p>
                <p className="mt-1 break-words text-xs text-white/55">{log.beforeData && `${auditValues(log, log.beforeData)} ke `}{log.afterData ? auditValues(log, log.afterData) : 'Dihapus'}</p>
              </div>
              <span className="text-xs text-white/42" title={log.actorId ?? undefined}>{mode === 'demo' ? 'Demo' : log.actorId ? 'Pemilik toko' : 'Sistem'}</span>
            </div>)}
          </div>
        ) : <p className="border-y border-white/10 py-6 text-sm text-white/55">Belum ada aktivitas untuk filter ini.</p>}
      </section>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="border-white/12 bg-[#121827]/96 text-white shadow-2xl sm:max-w-lg">
          <DialogHeader>
            <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-cyan-300/12 text-cyan-100">
              <ShieldCheck className="size-6" />
            </div>
            <DialogTitle className="text-white">Tentang ABElektronik</DialogTitle>
            <DialogDescription className="text-white/62">
              ABElektronik adalah aplikasi manajemen stok barang elektronik dengan inventory, scanner,
              laporan, barcode, multi-store, dan resi digital.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4 text-sm text-white/62">
            Versi 1.0.0 (c) by Al Fajrin A Alamsyah 2025
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setAboutOpen(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

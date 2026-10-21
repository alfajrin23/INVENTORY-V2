import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, RefreshCw, QrCode, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GlassPanel } from '@/components/shared/glass-panel'
import { useInventory } from '@/hooks/use-inventory'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/format'
import { demoEnabled, supabase } from '@/lib/supabase'

type QrisPayment = {
  id: string
  order_id: string
  gross_amount: number | string
  status: 'creating' | 'pending' | 'paid' | 'expired' | 'failed' | 'inventory_error'
  provider_status: string | null
  failure_reason: string | null
  created_at: string
  expires_at: string
  paid_at: string | null
}

function paymentState(payment: QrisPayment) {
  if (payment.status === 'pending' && new Date(payment.expires_at).getTime() <= Date.now()) {
    return { label: 'Batas reservasi lewat · cek GoBiz', tone: 'border-amber-300/25 bg-amber-300/10 text-amber-100' }
  }
  const states = {
    creating: { label: 'Menyiapkan QR', tone: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100' },
    pending: { label: 'Menunggu pembayaran', tone: 'border-amber-300/25 bg-amber-300/10 text-amber-100' },
    paid: { label: 'Lunas', tone: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' },
    expired: { label: 'Batas reservasi lewat · cek GoBiz', tone: 'border-amber-300/25 bg-amber-300/10 text-amber-100' },
    failed: { label: 'Gagal menyiapkan QR', tone: 'border-rose-300/25 bg-rose-300/10 text-rose-100' },
    inventory_error: { label: 'Dana dikonfirmasi · stok perlu ditinjau', tone: 'border-orange-300/25 bg-orange-300/10 text-orange-100' },
  }
  return states[payment.status]
}

function dateLabel(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function QrisHistoryPage() {
  const { activeStore, mode } = useInventory()
  const { showToast } = useToast()
  const activeStoreId = activeStore?.id
  const [payments, setPayments] = useState<QrisPayment[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmingId, setConfirmingId] = useState('')
  const [completedAmount, setCompletedAmount] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortOrder, setSortOrder] = useState('newest')

  const refresh = useCallback(async (showSpinner = true) => {
    const client = supabase
    if (!activeStoreId || !client || demoEnabled) {
      if (showSpinner) setLoading(false)
      return
    }
    if (showSpinner) setLoading(true)
    if (showSpinner) setError('')
    try {
      const { data, error: queryError } = await client
        .from('qris_payments')
        .select('id, order_id, gross_amount, status, provider_status, failure_reason, created_at, expires_at, paid_at')
        .eq('store_id', activeStoreId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (queryError) throw queryError
      setPayments((data ?? []) as QrisPayment[])
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Riwayat QRIS gagal dimuat.')
    } finally {
      setLoading(false)
    }
  }, [activeStoreId])

  const filteredPayments = useMemo(() => {
    const normalizedSearch = search.toLocaleLowerCase('id-ID').replace(/[\s./,_-]+/g, '')
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY

    return payments
      .filter(payment => {
        const createdAt = new Date(payment.created_at)
        const createdTime = createdAt.getTime()
        if (createdTime < fromTime || createdTime > toTime) return false
        if (!normalizedSearch) return true

        const amount = Number(payment.gross_amount)
        const searchableText = [
          payment.order_id,
          String(amount),
          formatCurrency(amount),
          dateLabel(payment.created_at),
          createdAt.toLocaleDateString('id-ID'),
          payment.created_at.slice(0, 10),
          payment.paid_at ? dateLabel(payment.paid_at) : '',
        ].join(' ').toLocaleLowerCase('id-ID').replace(/[\s./,_-]+/g, '')

        return searchableText.includes(normalizedSearch)
      })
      .sort((a, b) => {
        const createdDifference = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        const amountDifference = Number(a.gross_amount) - Number(b.gross_amount)
        if (sortOrder === 'oldest') return createdDifference
        if (sortOrder === 'amount-high') return amountDifference * -1 || createdDifference * -1
        if (sortOrder === 'amount-low') return amountDifference || createdDifference * -1
        return createdDifference * -1
      })
  }, [dateFrom, dateTo, payments, search, sortOrder])

  const clearFilters = () => {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setSortOrder('newest')
  }

  const confirmPayment = async (payment: QrisPayment) => {
    const client = supabase
    if (!client || confirmingId) return
    setConfirmingId(payment.id)
    try {
      const { data, error: confirmError } = await client.rpc('confirm_qris_payment', { p_payment_id: payment.id })
      if (confirmError) throw confirmError
      const result = data as { status?: string; message?: string } | null
      if (result?.status === 'paid') {
        setCompletedAmount(Number(payment.gross_amount))
        showToast(`Pembayaran ${formatCurrency(Number(payment.gross_amount))} dikonfirmasi.`, 'success')
      }
      else if (result?.status === 'inventory_error') showToast('Dana dikonfirmasi, tetapi stok perlu ditinjau admin.', 'error')
      else throw new Error('Status pembayaran tidak dikenali. Muat ulang riwayat QRIS.')
      await refresh(false)
    } catch (failure) {
      showToast(failure instanceof Error ? failure.message : 'Konfirmasi QRIS gagal.', 'error')
    } finally {
      setConfirmingId('')
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(false) }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  useEffect(() => {
    const client = supabase
    if (!client || demoEnabled || !activeStoreId) return
    const channel = client.channel(`qris-history-${activeStoreId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'qris_payments', filter: `store_id=eq.${activeStoreId}`,
      }, () => { void refresh() })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [activeStoreId, refresh])

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-sm text-cyan-100/70">Pembayaran</p>
        <h1 className="mt-1 text-3xl font-bold text-white lg:text-4xl">Riwayat Transaksi QRIS</h1>
        <p className="mt-2 text-sm text-white/60">Kasir mengecek dana masuk di GoBiz lalu mengonfirmasi pembayaran di aplikasi. Batas waktu hanya melepas reservasi stok; QR mungkin masih dapat dibayar.</p>
      </div>
      <Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading || demoEnabled}>
        <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        Muat ulang
      </Button>
    </div>

    {activeStore && mode !== 'demo' && supabase ? <GlassPanel className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(220px,2fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(180px,1.2fr)_auto] xl:items-end">
      <label htmlFor="qris-search" className="grid gap-1.5 text-xs font-medium text-white/70">
        Cari nominal atau tanggal
        <span className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/45" />
          <Input id="qris-search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Contoh: Rp 200 atau 21/10/2026"
            className="h-11 border-white/12 bg-white/[0.07] pl-9 text-white placeholder:text-white/35" />
        </span>
      </label>
      <label htmlFor="qris-date-from" className="grid gap-1.5 text-xs font-medium text-white/70">
        Dari tanggal
        <Input id="qris-date-from" type="date" value={dateFrom} max={dateTo || undefined}
          onChange={event => setDateFrom(event.target.value)}
          className="h-11 border-white/12 bg-white/[0.07] text-white [color-scheme:dark]" />
      </label>
      <label htmlFor="qris-date-to" className="grid gap-1.5 text-xs font-medium text-white/70">
        Sampai tanggal
        <Input id="qris-date-to" type="date" value={dateTo} min={dateFrom || undefined}
          onChange={event => setDateTo(event.target.value)}
          className="h-11 border-white/12 bg-white/[0.07] text-white [color-scheme:dark]" />
      </label>
      <div className="grid gap-1.5 text-xs font-medium text-white/70">
        Urutkan
        <Select value={sortOrder} onValueChange={setSortOrder}>
          <SelectTrigger aria-label="Urutkan transaksi QRIS" className="h-11 w-full border-white/12 bg-white/[0.07] text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Tanggal terbaru</SelectItem>
            <SelectItem value="oldest">Tanggal terlama</SelectItem>
            <SelectItem value="amount-high">Nominal terbesar</SelectItem>
            <SelectItem value="amount-low">Nominal terkecil</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="button" variant="outline" onClick={clearFilters}
        disabled={!search && !dateFrom && !dateTo && sortOrder === 'newest'} className="h-11">
        Hapus filter
      </Button>
    </GlassPanel> : null}

    {!activeStore ? <GlassPanel className="p-6 text-sm text-white/65">Pilih toko untuk melihat riwayat QRIS.</GlassPanel>
      : mode === 'demo' || !supabase ? <GlassPanel className="p-6 text-sm text-white/65">
        Riwayat pembayaran asli tersedia setelah aplikasi terhubung ke Supabase.
      </GlassPanel>
      : error ? <GlassPanel className="border-rose-300/20 p-6 text-sm text-rose-100" role="alert">{error}</GlassPanel>
      : loading && !payments.length ? <GlassPanel className="p-6 text-sm text-white/65" role="status">Memuat riwayat QRIS…</GlassPanel>
      : !payments.length ? <GlassPanel className="p-8 text-center text-white/65">
        <QrCode className="mx-auto mb-3 size-8 text-cyan-200" />
        Belum ada transaksi QRIS untuk {activeStore.name}.
      </GlassPanel>
      : !filteredPayments.length ? <GlassPanel className="p-8 text-center text-white/65">
        <Search aria-hidden="true" className="mx-auto mb-3 size-8 text-cyan-200" />
        Tidak ada transaksi QRIS yang cocok dengan pencarian atau filter tanggal.
      </GlassPanel>
      : <div className="grid gap-3">
        <p className="text-xs text-white/55" role="status">Menampilkan {filteredPayments.length} dari {payments.length} transaksi QRIS.</p>
        {filteredPayments.map(payment => {
          const state = paymentState(payment)
          const canConfirm = ['pending', 'expired', 'inventory_error'].includes(payment.status)
          return <GlassPanel key={payment.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-sm font-semibold text-white">{payment.order_id}</h2>
                <Badge className={state.tone}>{state.label}</Badge>
              </div>
              <p className="mt-1 text-xs text-white/55">Dibuat {dateLabel(payment.created_at)}{payment.paid_at ? ` · Lunas ${dateLabel(payment.paid_at)}` : ''}</p>
              {payment.failure_reason ? <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-100/85"><Activity className="mt-0.5 size-3 shrink-0" />{payment.failure_reason}</p> : null}
            </div>
            <p className="font-mono text-lg font-semibold text-white">{formatCurrency(Number(payment.gross_amount))}</p>
            {canConfirm ? <Button type="button" variant={payment.status === 'inventory_error' ? 'outline' : 'default'}
              disabled={Boolean(confirmingId)} onClick={() => void confirmPayment(payment)}>
              {confirmingId === payment.id ? 'Menyimpan…' : payment.status === 'inventory_error' ? 'Coba simpan stok' : 'Konfirmasi dibayar'}
            </Button> : null}
          </GlassPanel>
        })}
      </div>}

    <Dialog open={completedAmount !== null} onOpenChange={open => { if (!open) setCompletedAmount(null) }}>
      <DialogContent className="border-white/12 bg-[#121827]/96 text-white shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Transaksi selesai</DialogTitle>
          <DialogDescription className="text-white/62">
            Pembayaran QRIS {completedAmount === null ? '' : formatCurrency(completedAmount)} telah dicatat dan stok diperbarui.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter><Button type="button" onClick={() => setCompletedAmount(null)}>Oke</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}

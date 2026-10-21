import { useCallback, useEffect, useState } from 'react'
import { Activity, RefreshCw, QrCode } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
      : <div className="grid gap-3">
        {payments.map(payment => {
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

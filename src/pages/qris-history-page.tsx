import { useCallback, useEffect, useState } from 'react'
import { Activity, RefreshCw, QrCode } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GlassPanel } from '@/components/shared/glass-panel'
import { useInventory } from '@/hooks/use-inventory'
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
    return { label: 'Kedaluwarsa · notifikasi belum diterima', tone: 'border-amber-300/25 bg-amber-300/10 text-amber-100' }
  }
  const states = {
    creating: { label: 'Menyiapkan QR', tone: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100' },
    pending: { label: 'Menunggu pembayaran', tone: 'border-amber-300/25 bg-amber-300/10 text-amber-100' },
    paid: { label: 'Lunas', tone: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' },
    expired: { label: 'Kedaluwarsa', tone: 'border-white/15 bg-white/6 text-white/65' },
    failed: { label: 'Gagal', tone: 'border-rose-300/25 bg-rose-300/10 text-rose-100' },
    inventory_error: { label: 'Dana diterima · stok perlu ditinjau', tone: 'border-orange-300/25 bg-orange-300/10 text-orange-100' },
  }
  return states[payment.status]
}

function dateLabel(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function QrisHistoryPage() {
  const { activeStore, mode } = useInventory()
  const activeStoreId = activeStore?.id
  const [payments, setPayments] = useState<QrisPayment[]>([])
  const [loading, setLoading] = useState(false)
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
        <p className="mt-2 text-sm text-white/60">Status lunas hanya mengikuti konfirmasi resmi GoPay/Midtrans.</p>
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
          return <GlassPanel key={payment.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-sm font-semibold text-white">{payment.order_id}</h2>
                <Badge className={state.tone}>{state.label}</Badge>
              </div>
              <p className="mt-1 text-xs text-white/55">Dibuat {dateLabel(payment.created_at)}{payment.paid_at ? ` · Lunas ${dateLabel(payment.paid_at)}` : ''}</p>
              {payment.failure_reason ? <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-100/85"><Activity className="mt-0.5 size-3 shrink-0" />{payment.failure_reason}</p> : null}
            </div>
            <p className="font-mono text-lg font-semibold text-white">{formatCurrency(Number(payment.gross_amount))}</p>
          </GlassPanel>
        })}
      </div>}
  </div>
}

import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Check, CheckCircle2, Flame, PackageCheck, PackageX, Search, ShoppingCart, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useInventory } from '@/hooks/use-inventory'
import { useToast } from '@/hooks/use-toast'
import { clearShoppingNotification, showShoppingNotification } from '@/lib/android-notifications'
import { formatNumber } from '@/lib/format'
import { buildRestockRecommendations, type RestockRecommendation, type RestockStatus } from '@/lib/restock'
import { cn } from '@/lib/utils'

type ShoppingFilter = 'semua' | RestockStatus

type CompletedShoppingItem = {
  id: string
  name: string
  brand: string
  quantity: number
  completedAt: string
}

type ShoppingModeState = {
  active: boolean
  completed: CompletedShoppingItem[]
}

const EMPTY_MODE: ShoppingModeState = { active: false, completed: [] }

function storageKey(storeId: string) {
  return `ab:shopping-mode:v1:${storeId}`
}

function readMode(storeId: string): ShoppingModeState {
  try {
    const raw = localStorage.getItem(storageKey(storeId))
    if (!raw) return EMPTY_MODE
    const parsed = JSON.parse(raw) as Partial<ShoppingModeState>
    return {
      active: Boolean(parsed.active),
      completed: Array.isArray(parsed.completed) ? parsed.completed : [],
    }
  } catch {
    return EMPTY_MODE
  }
}

function saveMode(storeId: string, state: ShoppingModeState) {
  localStorage.setItem(storageKey(storeId), JSON.stringify(state))
}

function statusLabel(status: RestockStatus) {
  if (status === 'habis') return 'Habis'
  if (status === 'kritis') return 'Menipis'
  return 'Laris'
}

function StatusIcon({ status }: { status: RestockStatus }) {
  if (status === 'habis') return <PackageX className="size-4" />
  if (status === 'kritis') return <TriangleAlert className="size-4" />
  return <Flame className="size-4" />
}

export function ShoppingPage() {
  const { activeStore, products, history, processTransaction, loading } = useInventory()
  const { showToast } = useToast()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ShoppingFilter>('semua')
  const [mode, setMode] = useState<ShoppingModeState>(EMPTY_MODE)
  const [selected, setSelected] = useState<RestockRecommendation | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [saving, setSaving] = useState(false)
  const [notificationMessage, setNotificationMessage] = useState('')

  const recommendations = useMemo(
    () => buildRestockRecommendations(products, history, activeStore?.id),
    [activeStore?.id, history, products],
  )

  useEffect(() => {
    if (!activeStore?.id) {
      setMode(EMPTY_MODE)
      return
    }
    setMode(readMode(activeStore.id))
  }, [activeStore?.id])

  useEffect(() => {
    if (!activeStore?.id) return
    saveMode(activeStore.id, mode)
  }, [activeStore?.id, mode])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    if (!mode.active) {
      void clearShoppingNotification().catch(() => undefined)
      return
    }
    void showShoppingNotification(recommendations).catch(() => undefined)
  }, [mode.active, recommendations])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('id-ID')
    return recommendations.filter(item => {
      if (filter !== 'semua' && item.status !== filter) return false
      if (!needle) return true
      return `${item.name} ${item.brand} ${item.barcode}`.toLocaleLowerCase('id-ID').includes(needle)
    })
  }, [filter, query, recommendations])

  const startMode = async () => {
    setNotificationMessage('')
    setMode({ active: true, completed: [] })
    if (!Capacitor.isNativePlatform()) return
    try {
      let permission = await LocalNotifications.checkPermissions()
      if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions()
      if (permission.display !== 'granted') {
        setNotificationMessage('Mode Belanja tetap aktif, tetapi notifikasi Android belum diizinkan.')
        return
      }
      await showShoppingNotification(recommendations)
    } catch (cause) {
      setNotificationMessage(cause instanceof Error ? cause.message : 'Notifikasi Mode Belanja belum dapat ditampilkan.')
    }
  }

  const finishMode = async () => {
    setMode(EMPTY_MODE)
    setSelected(null)
    setNotificationMessage('')
    if (Capacitor.isNativePlatform()) await clearShoppingNotification().catch(() => undefined)
    showToast('Mode Belanja selesai', 'success')
  }

  const openQuantity = (item: RestockRecommendation) => {
    setSelected(item)
    setQuantity(Math.max(1, item.suggestedQty || 1))
  }

  const confirmRestock = async () => {
    if (!selected || !activeStore || saving) return
    const safeQuantity = Math.trunc(quantity)
    if (!Number.isFinite(safeQuantity) || safeQuantity < 1 || safeQuantity > 1_000_000) {
      showToast('Jumlah beli harus 1 sampai 1.000.000', 'error')
      return
    }

    setSaving(true)
    try {
      await processTransaction({
        category: 'masuk',
        items: [{ product: selected.product, quantity: safeQuantity }],
        note: 'Belanja stok',
        operator: 'Mode Belanja',
      })
      const completed: CompletedShoppingItem = {
        id: selected.id,
        name: selected.name,
        brand: selected.brand,
        quantity: safeQuantity,
        completedAt: new Date().toISOString(),
      }
      setMode(current => ({
        ...current,
        completed: [completed, ...current.completed.filter(item => item.id !== completed.id)],
      }))
      setSelected(null)
      showToast(`${selected.name} ditambahkan ke stok`, 'success')
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Stok gagal ditambahkan', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 pb-8">
      <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-300/12 text-amber-100">
              <ShoppingCart className="size-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-100/65">Laporan · Restock</p>
              <h1 className="mt-1 text-2xl font-bold text-white">Belanja Stok</h1>
              <p className="mt-1 text-sm text-white/58">
                {loading ? 'Menghitung rekomendasi…' : `${formatNumber(recommendations.length)} barang perlu diperhatikan`}
              </p>
            </div>
          </div>

          {mode.active ? (
            <div role="status" className="flex min-h-11 items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08] px-3 text-sm font-bold text-emerald-100">
              <span className="size-2.5 animate-pulse rounded-full bg-emerald-300 motion-reduce:animate-none" />
              Mode Belanja Aktif
            </div>
          ) : (
            <Button type="button" className="min-h-12 bg-amber-300 text-base font-bold text-slate-950 hover:bg-amber-200" onClick={() => void startMode()}>
              <ShoppingCart className="size-5" />
              Mulai Mode Belanja
            </Button>
          )}
        </div>

        {notificationMessage ? <p role="status" className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-3 text-sm text-amber-100">{notificationMessage}</p> : null}

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-white/38" />
            <Input
              aria-label="Cari nama barang merek atau barcode"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Cari nama barang / merek / barcode"
              className="h-12 border-white/12 bg-black/15 pl-11 text-base text-white placeholder:text-white/38"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Filter belanja stok">
            {([
              ['semua', 'Semua'],
              ['habis', 'Habis'],
              ['kritis', 'Menipis'],
              ['laris', 'Laris'],
            ] as const).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={filter === value ? 'default' : 'outline'}
                aria-pressed={filter === value}
                className="min-h-11 whitespace-nowrap border-white/15"
                onClick={() => setFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Daftar barang yang perlu dibeli" className="space-y-2">
        {filtered.map(item => (
          <article key={item.id} className="flex min-h-[84px] items-center gap-3 rounded-2xl border border-white/10 bg-[#151a22] p-3.5 shadow-sm">
            <button
              type="button"
              aria-label={`Tandai ${item.name} sudah dibeli`}
              onClick={() => openQuantity(item)}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-white/25 text-white/55 outline-none transition hover:border-emerald-300 hover:text-emerald-200 focus-visible:ring-2 focus-visible:ring-emerald-200"
            >
              <Check className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-white sm:text-lg">{item.name}</h2>
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
                  item.status === 'habis' ? 'bg-rose-300/14 text-rose-100' : item.status === 'kritis' ? 'bg-amber-300/14 text-amber-100' : 'bg-cyan-300/14 text-cyan-100',
                )}>
                  <StatusIcon status={item.status} />
                  {statusLabel(item.status)}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-300">{item.brand} · <span className="font-mono text-xs text-slate-400">{item.barcode}</span></p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-300">Stok: <strong className="text-white">{formatNumber(item.stock)}</strong></span>
                <span className="text-slate-300">Saran beli: <strong className="text-emerald-200">{formatNumber(item.suggestedQty)}</strong></span>
              </div>
            </div>
          </article>
        ))}

        {!loading && filtered.length === 0 ? (
          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] p-5 text-center">
            <PackageCheck className="mx-auto size-7 text-emerald-200" />
            <p className="mt-2 font-bold text-white">Tidak ada barang pada filter ini</p>
            <p className="mt-1 text-sm text-white/52">Stok bisa sudah aman atau pencarian tidak cocok.</p>
          </div>
        ) : null}
      </section>

      {mode.completed.length ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4" aria-labelledby="shopping-completed-title">
          <h2 id="shopping-completed-title" className="flex items-center gap-2 text-lg font-bold text-white">
            <CheckCircle2 className="size-5 text-emerald-300" />
            Sudah dibeli ({mode.completed.length})
          </h2>
          <div className="mt-3 space-y-2">
            {mode.completed.map(item => (
              <div key={`${item.id}-${item.completedAt}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 px-3 py-2.5 text-sm">
                <span className="min-w-0"><strong className="block truncate text-white">{item.name}</strong><span className="text-white/48">{item.brand}</span></span>
                <span className="shrink-0 font-mono font-bold text-emerald-200">+{formatNumber(item.quantity)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {mode.active ? (
        <Button type="button" variant="outline" className="min-h-12 w-full border-emerald-300/30 bg-emerald-300/[0.06] text-base font-bold text-emerald-100" onClick={() => void finishMode()}>
          <CheckCircle2 className="size-5" />
          Selesaikan Belanja
        </Button>
      ) : null}

      <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open && !saving) setSelected(null) }}>
        <DialogContent className="border-white/12 bg-[#121827]/98 text-white sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Berapa barang yang dibeli?</DialogTitle>
            <DialogDescription className="text-white/58">Stok baru ditambahkan setelah Anda menekan Tambah ke Stok.</DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                <p className="font-bold text-white">{selected.name}</p>
                <p className="mt-1 text-sm text-white/52">Saran: {formatNumber(selected.suggestedQty)}</p>
              </div>
              <div className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] gap-2">
                <Button type="button" variant="outline" className="min-h-12 border-white/15 text-xl" aria-label="Kurangi jumlah" onClick={() => setQuantity(value => Math.max(1, value - 1))}>−</Button>
                <Input
                  aria-label="Jumlah barang dibeli"
                  type="number"
                  min={1}
                  max={1_000_000}
                  value={quantity}
                  onChange={event => setQuantity(Number(event.target.value))}
                  className="h-12 border-white/15 bg-black/20 text-center text-xl font-bold text-white"
                />
                <Button type="button" variant="outline" className="min-h-12 border-white/15 text-xl" aria-label="Tambah jumlah" onClick={() => setQuantity(value => Math.min(1_000_000, value + 1))}>+</Button>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:grid sm:grid-cols-2">
            <Button type="button" variant="outline" className="min-h-11 border-white/15" disabled={saving} onClick={() => setSelected(null)}>Batal</Button>
            <Button type="button" className="min-h-11" disabled={saving} onClick={() => void confirmRestock()}>{saving ? 'Menyimpan…' : 'Tambah ke Stok'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
